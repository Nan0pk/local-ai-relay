import { BrowserFailure } from './types.js';

export type ProbeStatus =
  | 'operational'
  | 'login_required'
  | 'layout_changed'
  | 'blocked_by_anti_bot'
  | 'timeout'
  | 'browser_launch_failure'
  | 'rate_limited'
  | 'quota_exhausted'
  | 'unsupported';

export function classifyProbeError(error: unknown): ProbeStatus {
  if (error instanceof BrowserFailure) {
    switch (error.kind) {
      case 'login_required':
        return 'login_required';
      case 'captcha':
        return 'blocked_by_anti_bot';
      case 'rate_limit':
        return 'rate_limited';
      case 'quota_exhausted':
        return 'quota_exhausted';
      case 'layout_changed':
        return 'layout_changed';
      case 'timeout':
        return 'timeout';
      case 'empty_response':
        return 'layout_changed';
      default:
        return 'unsupported';
    }
  }

  const message = error instanceof Error ? error.message : String(error);
  
  if (message.includes('Browser launch') || message.includes('executable') || message.includes('Failed to launch')) {
    return 'browser_launch_failure';
  }
  if (message.includes('timeout') || message.includes('Timeout') || message.includes('timed out')) {
    return 'timeout';
  }
  if (message.includes('anti-bot') || message.includes('cloudflare') || message.includes('challenge')) {
    return 'blocked_by_anti_bot';
  }
  if (message.includes('not available') || message.includes('unavailable')) {
    return 'unsupported';
  }
  
  return 'unsupported';
}
