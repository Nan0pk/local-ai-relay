import { BrowserFailure } from '../browser/types.js';

/**
 * Retry another provider only when the first attempt is known to have failed
 * before prompt submission. Timeouts, interrupted generations, empty
 * responses, cancellation, layout changes, and unknown errors may have
 * submitted work upstream and must not be duplicated automatically.
 */
const PRE_SUBMISSION_FAILURES = new Set([
  'login_required',
  'captcha',
  'rate_limit',
  'quota_exhausted',
  'composer_disabled',
]);

export function canSafelyFailOver(error: unknown): boolean {
  return error instanceof BrowserFailure
    && PRE_SUBMISSION_FAILURES.has(error.kind);
}
