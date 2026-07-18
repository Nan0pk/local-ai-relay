import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { getWritableHome } from '../browser/paths.js';

/** Returns the path where the API token is persisted. */
export function getTokenPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.RELAY_API_TOKEN_PATH ?? join(getWritableHome(), '.local-ai-relay', 'token');
}

/** Reads the persisted token, or generates and saves a new high-entropy token if missing. */
export async function getOrGenerateToken(env: NodeJS.ProcessEnv = process.env): Promise<string> {
  if (env.RELAY_API_TOKEN) {
    return env.RELAY_API_TOKEN;
  }
  const tokenPath = getTokenPath(env);
  try {
    const data = await readFile(tokenPath, 'utf8');
    const token = data.trim();
    if (token) return token;
  } catch {
    // Missing or unreadable token file
  }

  const token = randomBytes(32).toString('hex');
  await mkdir(dirname(tokenPath), { recursive: true }).catch(() => {});
  await writeFile(tokenPath, token, { encoding: 'utf8', mode: 0o600 });
  return token;
}
