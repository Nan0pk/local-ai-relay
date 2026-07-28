import { mkdir, rename, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getWritableHome } from '../browser/paths.js';

export function controlStatePath(
  filename: string,
  envName?: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (envName ? env[envName] : undefined)
    ?? join(getWritableHome(), '.local-ai-relay', filename);
}

export function readJsonFile<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const isPosix = process.platform !== 'win32';
  await mkdir(dirname(path), { recursive: true, ...(isPosix ? { mode: 0o700 } : {}) });
  const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(
    temporary,
    `${JSON.stringify(value, null, 2)}\n`,
    isPosix ? { mode: 0o600 } : {},
  );
  await rename(temporary, path);
}
