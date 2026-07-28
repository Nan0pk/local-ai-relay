import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { resolveRelayPort } from '../startup/relay-location.js';
import { getOrGenerateToken } from '../auth/token.js';
import { normalizeLoopbackBaseUrl } from '../utils/loopback-url.js';

export interface HealthAuditReport {
  timestamp: string;
  status: 'ok' | 'degraded' | 'unreachable';
  relayUrl: string;
  providersStatus?: Record<string, unknown>;
  error?: string;
}

export async function runHealthCheck(
  relayUrl?: string,
  outputDir = join(homedir(), '.local', 'share', 'local-ai-relay', 'diagnostics'),
): Promise<HealthAuditReport> {
  const resolvedRelayUrl = relayUrl ?? `http://127.0.0.1:${await resolveRelayPort()}`;
  const timestamp = new Date().toISOString();
  let report: HealthAuditReport;

  try {
    const loopbackRelayUrl = normalizeLoopbackBaseUrl(resolvedRelayUrl);
    const healthRes = await fetch(`${loopbackRelayUrl}/health`, {
      signal: AbortSignal.timeout(5000),
      redirect: 'error',
    });
    if (!healthRes.ok) {
      report = { timestamp, status: 'degraded', relayUrl: resolvedRelayUrl, error: `HTTP ${healthRes.status}` };
    } else {
      let providersStatus: Record<string, unknown> | undefined;
      try {
        const token = await getOrGenerateToken();
        const tokenRes = await fetch(`${loopbackRelayUrl}/v1/providers/status`, {
          signal: AbortSignal.timeout(5000),
          headers: { Authorization: `Bearer ${token}` },
          redirect: 'error',
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
        relayUrl: resolvedRelayUrl,
        providersStatus,
      };
    }
  } catch (err) {
    report = {
      timestamp,
      status: 'unreachable',
      relayUrl: resolvedRelayUrl,
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
