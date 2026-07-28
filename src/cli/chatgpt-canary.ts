import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBrowserProvider } from '../browser/driver-registry.js';
import { BrowserFailure, type BrowserLoginDriver } from '../browser/types.js';
import { persistCapability } from '../capabilities/evidence-store.js';
import type { ProviderCapabilityRecord } from '../capabilities/tracker.js';
import { getDefaultLedger } from '../ledger/sqlite-ledger.js';

export type TypedCanaryFailureClass =
  | 'browser_unavailable'
  | 'no_display'
  | 'login_required'
  | 'captcha'
  | 'rate_limited'
  | 'quota_exhausted'
  | 'timeout';

export interface CanaryPreflightResult {
  ok: boolean;
  failureClass?: TypedCanaryFailureClass;
  message: string;
}

export function checkCanaryEnvironment(env: NodeJS.ProcessEnv = process.env): CanaryPreflightResult {
  if (
    process.platform === 'linux'
    && !env.DISPLAY
    && !env.WAYLAND_DISPLAY
    && env.RELAY_BROWSER_HEADLESS !== '1'
  ) {
    return {
      ok: false,
      failureClass: 'no_display',
      message: 'FAIL: no graphical Linux session was detected. Set RELAY_BROWSER_HEADLESS=1 only if the provider supports headless login.',
    };
  }
  return { ok: true, message: 'Preflight environment check passed.' };
}

function failureClass(error: unknown): TypedCanaryFailureClass {
  if (error instanceof BrowserFailure) {
    const mapped: Partial<Record<BrowserFailure['kind'], TypedCanaryFailureClass>> = {
      login_required: 'login_required',
      captcha: 'captcha',
      rate_limit: 'rate_limited',
      quota_exhausted: 'quota_exhausted',
      timeout: 'timeout',
    };
    return mapped[error.kind] ?? 'browser_unavailable';
  }
  return /timeout/i.test(error instanceof Error ? error.message : String(error))
    ? 'timeout'
    : 'browser_unavailable';
}

function simulateCanaryMissions(consecutiveTarget: number): void {
  const ledger = getDefaultLedger();
  const requestIdPrefix = `canary-simulation-${Date.now()}-${crypto.randomUUID()}`;
  for (let index = 1; index <= consecutiveTarget; index += 1) {
    const requestId = `${requestIdPrefix}-${index}`;
    ledger.createRequest(requestId, 'browser-chatgpt-free', `Simulation ${index}: ORANGE`);
    ledger.updateRequestState(requestId, 'SUBMITTED');
    ledger.updateRequestState(requestId, 'COMPLETED');
  }
}

export async function runChatGptCanary(opts: {
  mockMode?: boolean;
  consecutiveTarget?: number;
  driver?: BrowserLoginDriver;
  capabilityStorePath?: string;
} = {}): Promise<CanaryPreflightResult> {
  try { process.loadEnvFile?.(); } catch { /* optional .env */ }
  const consecutiveTarget = opts.consecutiveTarget ?? 5;
  if (!Number.isInteger(consecutiveTarget) || consecutiveTarget < 1) {
    throw new Error('consecutiveTarget must be a positive integer.');
  }

  if (opts.mockMode) {
    simulateCanaryMissions(consecutiveTarget);
    return {
      ok: true,
      message: `PASS: ${consecutiveTarget} consecutive canary missions passed in mock simulation; live readiness was not persisted.`,
    };
  }

  const envCheck = checkCanaryEnvironment();
  if (!envCheck.ok) return envCheck;

  const driver = opts.driver ?? findBrowserProvider('chatgpt').factory();
  const ledger = getDefaultLedger();
  const requestIdPrefix = `canary-live-${Date.now()}-${crypto.randomUUID()}`;
  let activeRequestId: string | undefined;

  try {
    await driver.openForLogin();
    await driver.waitUntilReady();
    for (let index = 1; index <= consecutiveTarget; index += 1) {
      activeRequestId = `${requestIdPrefix}-${index}`;
      ledger.createRequest(activeRequestId, 'browser-chatgpt-free', `Live canary ${index}: ORANGE`);
      ledger.updateRequestState(activeRequestId, 'SUBMITTED');
      const result = await driver.send({
        prompt: 'Reply with exactly ORANGE and nothing else.',
        sessionId: requestIdPrefix,
        resetSession: index === 1,
      });
      if (result.text.trim().toUpperCase() !== 'ORANGE') {
        throw new Error(`Canary ${index} returned an unexpected marker.`);
      }
      ledger.updateRequestState(activeRequestId, 'COMPLETED');
      activeRequestId = undefined;
    }

    const recordedAt = new Date().toISOString();
    const record: ProviderCapabilityRecord = {
      providerId: 'browser-chatgpt',
      status: 'ready',
      evidence: {
        reference: `live-canary:chatgpt:${recordedAt}`,
        recordedAt,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
      detail: `${consecutiveTarget} consecutive authenticated ChatGPT canary submissions passed.`,
      updatedAt: recordedAt,
    };
    await persistCapability(record, opts.capabilityStorePath);
    return {
      ok: true,
      message: `PASS: ${consecutiveTarget} consecutive authenticated ChatGPT canary missions passed; readiness evidence was recorded for 24 hours.`,
    };
  } catch (error) {
    const classified = failureClass(error);
    if (activeRequestId) ledger.updateRequestState(activeRequestId, 'FAILED', classified);
    return {
      ok: false,
      failureClass: classified,
      message: `FAIL: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    await driver.close().catch(() => {});
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runChatGptCanary()
    .then((result) => {
      console.log(result.message);
      if (!result.ok) process.exitCode = 1;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
