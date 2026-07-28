import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { controlStatePath } from '../control/storage.js';

export interface BrowserBridgeStatus {
  installed: boolean;
  connected: boolean;
  mode: 'existing_browser' | 'relay_browser';
  session_id?: string;
  last_seen_at?: string;
  extension_path: string;
  detail: string;
}

interface PersistedBridgeStatus {
  version: 1;
  session_id: string;
  last_seen_at: string;
}

const ACTIVE_WINDOW_MS = 45_000;

function bridgeStatusPath(): string {
  return controlStatePath('browser-bridge.json', 'RELAY_BROWSER_BRIDGE_STATUS');
}

export function recordBrowserBridgeHeartbeat(sessionId: string): void {
  writeBrowserBridgeStatus(sessionId, new Date().toISOString());
}

export function recordBrowserBridgeDisconnect(sessionId: string): void {
  writeBrowserBridgeStatus(sessionId, new Date(0).toISOString());
}

function writeBrowserBridgeStatus(sessionId: string, lastSeenAt: string): void {
  const path = bridgeStatusPath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  const value: PersistedBridgeStatus = {
    version: 1,
    session_id: sessionId,
    last_seen_at: lastSeenAt,
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
      mode: connected ? 'existing_browser' : 'relay_browser',
      session_id: value.session_id,
      last_seen_at: value.last_seen_at,
      extension_path: join(process.cwd(), 'extension'),
      detail: connected
        ? 'Using provider tabs in this signed-in Chrome profile.'
        : 'The Chrome extension was paired before but is offline; connections use the shared relay-browser fallback.',
    };
  } catch {
    return {
      installed: false,
      connected: false,
      mode: 'relay_browser',
      extension_path: join(process.cwd(), 'extension'),
      detail: 'Chrome extension not paired; connections use the shared relay-browser fallback.',
    };
  }
}
