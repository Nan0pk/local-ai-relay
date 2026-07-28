import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { controlStatePath, readJsonFile, writeJsonAtomic } from '../control/storage.js';

interface HarnessTokenRecord {
  id: string;
  harnessId: string;
  digest: string;
  createdAt: string;
}

interface HarnessTokenStore {
  version: 1;
  tokens: HarnessTokenRecord[];
}

function emptyStore(): HarnessTokenStore {
  return { version: 1, tokens: [] };
}

function digest(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

function loadStore(path: string): HarnessTokenStore {
  const value = readJsonFile<unknown>(path, emptyStore());
  if (!value || typeof value !== 'object') return emptyStore();
  const candidate = value as Partial<HarnessTokenStore>;
  if (candidate.version !== 1 || !Array.isArray(candidate.tokens)) return emptyStore();
  return {
    version: 1,
    tokens: candidate.tokens.filter((record): record is HarnessTokenRecord => (
      Boolean(record)
      && typeof record.id === 'string'
      && typeof record.harnessId === 'string'
      && typeof record.digest === 'string'
      && typeof record.createdAt === 'string'
    )),
  };
}

export class HarnessTokenRegistry {
  constructor(
    private readonly path = controlStatePath(
      'harness-tokens.json',
      'RELAY_HARNESS_TOKEN_STORE',
    ),
  ) {}

  async issue(
    harnessId: string,
    options: { replaceExisting?: boolean } = {},
  ): Promise<{ id: string; token: string }> {
    const store = loadStore(this.path);
    const id = crypto.randomUUID();
    const token = `lar_${harnessId}_${randomBytes(24).toString('base64url')}`;
    const record: HarnessTokenRecord = {
      id,
      harnessId,
      digest: digest(token).toString('hex'),
      createdAt: new Date().toISOString(),
    };
    if (options.replaceExisting !== false) {
      store.tokens = store.tokens.filter((existing) => existing.harnessId !== harnessId);
    }
    store.tokens.push(record);
    await writeJsonAtomic(this.path, store);
    return { id, token };
  }

  verify(token: string): boolean {
    const actual = digest(token);
    return loadStore(this.path).tokens.some((record) => {
      const expected = Buffer.from(record.digest, 'hex');
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    });
  }

  async revokeHarness(harnessId: string): Promise<void> {
    const store = loadStore(this.path);
    store.tokens = store.tokens.filter((record) => record.harnessId !== harnessId);
    await writeJsonAtomic(this.path, store);
  }

  async revokeToken(tokenId: string): Promise<void> {
    const store = loadStore(this.path);
    store.tokens = store.tokens.filter((record) => record.id !== tokenId);
    await writeJsonAtomic(this.path, store);
  }

  async retainHarnessToken(harnessId: string, tokenId: string): Promise<void> {
    const store = loadStore(this.path);
    store.tokens = store.tokens.filter(
      (record) => record.harnessId !== harnessId || record.id === tokenId,
    );
    await writeJsonAtomic(this.path, store);
  }
}

export const harnessTokens = new HarnessTokenRegistry();
