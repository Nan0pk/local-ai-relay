import { clearPersistedCapability, persistCapability } from './evidence-store.js';
import { capabilityTracker } from './tracker.js';
import { BrowserFailure } from '../browser/types.js';

const READINESS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const INVALIDATING_FAILURES = new Set([
  'login_required',
  'captcha',
  'rate_limit',
  'quota_exhausted',
  'composer_disabled',
  'layout_changed',
]);

function isTestRuntime(): boolean {
  return process.env.RELAY_ENABLE_TEST_PROVIDERS === '1'
    || process.env.RELAY_MOCK_BROWSER === 'true';
}

export async function recordSuccessfulProviderUse(providerId: string): Promise<void> {
  if (!providerId.startsWith('browser-') || isTestRuntime()) return;
  const current = capabilityTracker.getStatus(providerId);
  const currentRecordedAt = Date.parse(current?.evidence?.recordedAt ?? '');
  if (Number.isFinite(currentRecordedAt) && Date.now() - currentRecordedAt < 24 * 60 * 60 * 1000) {
    return;
  }
  const recordedAt = new Date().toISOString();
  const record = {
    providerId,
    status: 'ready' as const,
    evidence: {
      reference: `successful-request:${recordedAt}`,
      recordedAt,
      expiresAt: new Date(Date.now() + READINESS_TTL_MS).toISOString(),
    },
    detail: 'A real request completed successfully; readiness was refreshed.',
    updatedAt: recordedAt,
  };
  capabilityTracker.setStatus(providerId, record.status, record.evidence, record.detail);
  await persistCapability(record);
}

export async function recordProviderFailure(providerId: string, error: unknown): Promise<void> {
  if (
    !providerId.startsWith('browser-')
    || isTestRuntime()
    || !(error instanceof BrowserFailure)
    || !INVALIDATING_FAILURES.has(error.kind)
  ) return;
  capabilityTracker.setStatus(
    providerId,
    'installed',
    undefined,
    error.kind === 'rate_limit' || error.kind === 'quota_exhausted'
      ? `${error.message} Wait for the provider limit to reset, then verify it again.`
      : `${error.message} Reconnect this provider before routing more work to it.`,
  );
  await clearPersistedCapability(providerId);
}
