import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { controlStatePath } from '../control/storage.js';

export interface BrowserBridgeStatus {
  installed: boolean;
  connected: boolean;
  session_id?: string;
  last_seen_at?: string;
  detail: string;
}

interface PersistedBridgeStatus {
  version: 1;
  session_id: string;
  last_seen_at: string;
}

const ACTIVE_WINDOW_MS = 150_000;

function bridgeStatusPath(): string {
  return controlStatePath('browser-bridge.json', 'RELAY_BROWSER_BRIDGE_STATUS');
}

export function recordBrowserBridgeHeartbeat(sessionId: string): void {
  const path = bridgeStatusPath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  const value: PersistedBridgeStatus = {
    version: 1,
    session_id: sessionId,
    last_seen_at: new Date().toISOString(),
  };
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

export function getBrowserBridgeStatus(now = Date.now()): BrowserBridgeStatus {
  try {
    const value = JSON.parse(readFileSync(bridgeStatusPath(), 'utf8')) as Partial<PersistedBridgeStatus>;
    if (
      value.version !== 1
      || typeof value.session_id !== 'string'
      || typeof value.last_seen_at !== 'string'
    ) {
      throw new Error('invalid status');
    }
    const connected = now - Date.parse(value.last_seen_at) <= ACTIVE_WINDOW_MS;
    return {
      installed: true,
      connected,
      session_id: value.session_id,
      last_seen_at: value.last_seen_at,
      detail: connected
        ? 'Native Messaging status bridge connected; provider automation still uses the relay profile.'
        : 'Browser status bridge seen before but offline; provider automation still uses the relay profile.',
    };
  } catch {
    return {
      installed: false,
      connected: false,
      detail: 'Optional status companion not detected; provider automation uses the relay profile.',
    };
  }
}
