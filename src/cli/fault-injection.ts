import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export type InjectedFaultScenario = 'captcha' | 'quota_exhausted' | 'login_required' | 'rate_limited' | 'network_cut';

export interface FaultInjectionResult {
  scenario: InjectedFaultScenario;
  expectedClass: string;
  actualClass: string;
  ok: boolean;
  detail: string;
}

export interface FaultSuiteReport {
  totalMissions: number;
  passedMissions: number;
  correctnessRate: number; // percentage
  meetsThreshold: boolean; // >= 95%
  results: FaultInjectionResult[];
}

export class FaultInjectionServer {
  private server: Server | null = null;
  private port = 0;

  public async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        const url = req.url ?? '/';
        if (url.includes('/captcha')) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><iframe title="Cloudflare Security Captcha"></iframe></body></html>');
        } else if (url.includes('/quota')) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><div>You have reached your message limit. Please try again later.</div></body></html>');
        } else if (url.includes('/login')) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><button>Sign in to ChatGPT</button></body></html>');
        } else if (url.includes('/rate_limited')) {
          res.writeHead(429, { 'Content-Type': 'text/plain' });
          res.end('Too Many Requests');
        } else if (url.includes('/network_cut')) {
          req.destroy();
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><div id="prompt-textarea">Ready</div></body></html>');
        }
      });

      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server?.address() as AddressInfo;
        this.port = addr.port;
        resolve(this.port);
      });

      this.server.on('error', reject);
    });
  }

  public getUrl(path: string): string {
    return `http://127.0.0.1:${this.port}${path}`;
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
    });
  }
}

export function classifyHtmlDOM(htmlContent: string, statusCode = 200): string {
  if (statusCode === 429) return 'rate_limited';
  if (htmlContent.includes('captcha') || htmlContent.includes('Cloudflare Security')) return 'captcha';
  if (htmlContent.includes('reached your message limit')) return 'quota_exhausted';
  if (htmlContent.includes('Sign in') || htmlContent.includes('Log in')) return 'login_required';
  return 'ok';
}

export async function runFaultInjectionSuite(server: FaultInjectionServer): Promise<FaultSuiteReport> {
  const scenarios: Array<{ scenario: InjectedFaultScenario; path: string; expected: string }> = [
    { scenario: 'captcha', path: '/captcha', expected: 'captcha' },
    { scenario: 'quota_exhausted', path: '/quota', expected: 'quota_exhausted' },
    { scenario: 'login_required', path: '/login', expected: 'login_required' },
    { scenario: 'rate_limited', path: '/rate_limited', expected: 'rate_limited' },
    { scenario: 'network_cut', path: '/network_cut', expected: 'network_cut' },
  ];

  const results: FaultInjectionResult[] = [];

  for (const s of scenarios) {
    try {
      const response = await fetch(server.getUrl(s.path));
      const text = await response.text();
      const actual = classifyHtmlDOM(text, response.status);
      results.push({
        scenario: s.scenario,
        expectedClass: s.expected,
        actualClass: actual,
        ok: actual === s.expected,
        detail: `HTTP ${response.status} classified as ${actual}`,
      });
    } catch (err: unknown) {
      const isNetworkCut = s.scenario === 'network_cut';
      results.push({
        scenario: s.scenario,
        expectedClass: s.expected,
        actualClass: isNetworkCut ? 'network_cut' : 'unknown_error',
        ok: isNetworkCut,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const total = results.length;
  const passed = results.filter((r) => r.ok).length;
  const correctnessRate = (passed / total) * 100;

  return {
    totalMissions: total,
    passedMissions: passed,
    correctnessRate,
    meetsThreshold: correctnessRate >= 95,
    results,
  };
}
