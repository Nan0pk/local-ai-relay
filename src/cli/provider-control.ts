import { capabilityTracker } from '../capabilities/tracker.js';
import {
  capabilityEvidencePath,
  clearPersistedCapability,
} from '../capabilities/evidence-store.js';

export type ControlVerb = 'status' | 'reprobe' | 'disable' | 'enable' | 'clear-evidence';

export function isKillSwitchActive(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.RELAY_BROWSER_KILL_SWITCH === '1' || env.RELAY_BROWSER_KILL_SWITCH === 'true';
}

export async function executeControlVerb(
  verb: ControlVerb,
  providerId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ ok: boolean; message: string }> {
  if (isKillSwitchActive(env)) {
    return {
      ok: false,
      message: 'FAIL: Global browser-provider kill switch is active (RELAY_BROWSER_KILL_SWITCH=1). All browser providers are disabled.',
    };
  }

  switch (verb) {
    case 'status': {
      const record = capabilityTracker.getStatus(providerId);
      if (!record) return { ok: false, message: `Provider ${providerId} is not registered.` };
      return {
        ok: true,
        message: `Provider ${providerId}: status=${record.status}, detail="${record.detail}"`,
      };
    }
    case 'disable': {
      capabilityTracker.setStatus(providerId, 'disabled', undefined, 'Disabled via CLI control');
      return { ok: true, message: `Provider ${providerId} set to disabled.` };
    }
    case 'enable': {
      capabilityTracker.setStatus(providerId, 'installed', undefined, 'Re-enabled via CLI control');
      return { ok: true, message: `Provider ${providerId} set to installed (re-enabled).` };
    }
    case 'clear-evidence': {
      const path = capabilityEvidencePath(env);
      await clearPersistedCapability(providerId, path);
      return { ok: true, message: `Capability evidence for ${providerId} cleared at ${path}.` };
    }
    case 'reprobe': {
      return {
        ok: false,
        message: `No probe was queued. Run the explicit live probe for ${providerId} from an authenticated browser session.`,
      };
    }
    default:
      return { ok: false, message: `Unknown control verb: ${verb}` };
  }
}
