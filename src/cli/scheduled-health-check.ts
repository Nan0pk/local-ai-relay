import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface HealthAuditReport {
  timestamp: string;
  status: 'ok' | 'degraded' | 'unreachable';
  relayUrl: string;
  providersStatus?: Record<string, unknown>;
  error?: string;
}

export async function runHealthCheck(
  relayUrl = 'http://127.0.0.1:8787',
  outputDir = join(homedir(), '.local', 'share', 'local-ai-relay', 'diagnostics'),
): Promise<HealthAuditReport> {
  const timestamp = new Date().toISOString();
  let report: HealthAuditReport;

  try {
    const healthRes = await fetch(`${relayUrl}/health`, { signal: AbortSignal.timeout(5000) });
    if (!healthRes.ok) {
      report = { timestamp, status: 'degraded', relayUrl, error: `HTTP ${healthRes.status}` };
    } else {
      let providersStatus: Record<string, unknown> | undefined;
      try {
        const tokenRes = await fetch(`${relayUrl}/v1/providers/status`, {
          signal: AbortSignal.timeout(5000),
        });
        if (tokenRes.ok) {
          providersStatus = (await tokenRes.json()) as Record<string, unknown>;
        }
      } catch {
        // Provider diagnostic endpoint optional if unauthorized
      }

      report = {
        timestamp,
        status: 'ok',
        relayUrl,
        providersStatus,
      };
    }
  } catch (err) {
    report = {
      timestamp,
      status: 'unreachable',
      relayUrl,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  try {
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(join(outputDir, 'health-audit.json'), JSON.stringify(report, null, 2), 'utf-8');
  } catch {
    // Ignore file write errors in restricted test environments
  }

  return report;
}
