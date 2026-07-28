import { chmod, mkdir, open, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { getWritableHome } from '../browser/paths.js';

/** Returns the path where the API token is persisted. */
export function getTokenPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.RELAY_API_TOKEN_PATH ?? join(getWritableHome(), '.local-ai-relay', 'token');
}

/** Reads the persisted token, or generates and saves a new high-entropy token if missing. */
export async function getOrGenerateToken(env: NodeJS.ProcessEnv = process.env): Promise<string> {
  if (env === process.env) {
    try {
      process.loadEnvFile?.();
    } catch {
      // An absent .env is normal; malformed values are handled by consumers.
    }
  }
  if (env.RELAY_API_TOKEN) {
    return env.RELAY_API_TOKEN;
  }
  const tokenPath = getTokenPath(env);

  try {
    const data = await readFile(tokenPath, 'utf8');
    const token = data.trim();
    if (!token) throw new Error(`Relay token file is empty: ${tokenPath}`);
    if (process.platform !== 'win32') await chmod(tokenPath, 0o600);
    return token;
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
  }

  const token = randomBytes(32).toString('hex');
  const tokenDirectory = dirname(tokenPath);
  await mkdir(tokenDirectory, {
    recursive: true,
    ...(process.platform === 'win32' ? {} : { mode: 0o700 }),
  });
  if (process.platform !== 'win32') await chmod(tokenDirectory, 0o700);

  try {
    const handle = await open(tokenPath, 'wx', process.platform === 'win32' ? undefined : 0o600);
    try {
      await handle.writeFile(token, 'utf8');
    } finally {
      await handle.close();
    }
    return token;
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
    const existing = (await readFile(tokenPath, 'utf8')).trim();
    if (!existing) throw new Error(`Relay token file is empty: ${tokenPath}`);
    if (process.platform !== 'win32') await chmod(tokenPath, 0o600);
    return existing;
  }
}
