import { mkdir, open, rename, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getWritableHome } from '../browser/paths.js';
import type {
  CapabilityEvidence,
  ProviderCapabilityRecord,
  ProviderCapabilityStatus,
} from './tracker.js';

const STORE_VERSION = 1;
const ALL_STATUSES = new Set<ProviderCapabilityStatus>([
  'installed', 'authenticated', 'reachable', 'ready', 'degraded', 'disabled',
]);

interface CapabilityStore {
  version: number;
  records: ProviderCapabilityRecord[];
}

export function capabilityEvidencePath(env: NodeJS.ProcessEnv = process.env): string {
  return env.RELAY_CAPABILITY_STORE
    ?? join(getWritableHome(), '.local-ai-relay', 'capabilities.json');
}

export function isEvidenceCurrent(evidence: CapabilityEvidence | null): boolean {
  if (!evidence || !validIsoDate(evidence.recordedAt)) return false;
  return !evidence.expiresAt || (validIsoDate(evidence.expiresAt) && Date.parse(evidence.expiresAt) > Date.now());
}

export function loadPersistedCapability(
  providerId: string,
  path = capabilityEvidencePath(),
): ProviderCapabilityRecord | undefined {
  return readStore(path).records.find((record) => record.providerId === providerId);
}

/** Store only fresh probe-backed ready/degraded states. */
export async function persistCapability(
  record: ProviderCapabilityRecord,
  path = capabilityEvidencePath(),
): Promise<void> {
  if (!isPersistable(record)) {
    throw new Error('Only current browser capability evidence can be persisted.');
  }
  await withStoreLock(path, async () => {
    const store = readStore(path);
    const records = store.records.filter((existing) => existing.providerId !== record.providerId);
    records.push(record);
    await writeStore({ version: STORE_VERSION, records }, path);
  });
}

function readStore(path: string): CapabilityStore {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (!isStore(raw)) return { version: STORE_VERSION, records: [] };
    return {
      version: STORE_VERSION,
      records: raw.records.filter(isPersistable),
    };
  } catch {
    return { version: STORE_VERSION, records: [] };
  }
}

async function writeStore(store: CapabilityStore, path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

async function withStoreLock(path: string, action: () => Promise<void>): Promise<void> {
  const lockPath = `${path}.lock`;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const lock = await open(lockPath, 'wx', 0o600);
      try {
        await action();
      } finally {
        await lock.close();
        await rm(lockPath, { force: true });
      }
      return;
    } catch (error: unknown) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw new Error(`Timed out waiting for capability evidence lock: ${lockPath}`);
}

function isStore(value: unknown): value is CapabilityStore {
  return typeof value === 'object'
    && value !== null
    && (value as { version?: unknown }).version === STORE_VERSION
    && Array.isArray((value as { records?: unknown }).records);
}

function isPersistable(value: unknown): value is ProviderCapabilityRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<ProviderCapabilityRecord>;
  return typeof record.providerId === 'string'
    && record.providerId.startsWith('browser-')
    && typeof record.status === 'string'
    && ALL_STATUSES.has(record.status)
    && typeof record.detail === 'string'
    && typeof record.updatedAt === 'string'
    && validEvidence(record.evidence)
    && isEvidenceCurrent(record.evidence);
}

function validEvidence(value: unknown): value is CapabilityEvidence {
  if (typeof value !== 'object' || value === null) return false;
  const evidence = value as Partial<CapabilityEvidence>;
  return typeof evidence.reference === 'string'
    && validIsoDate(evidence.recordedAt)
    && (evidence.expiresAt === undefined || validIsoDate(evidence.expiresAt));
}

function validIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
