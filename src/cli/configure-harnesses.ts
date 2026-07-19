import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse, stringify } from 'yaml';
import { getOrGenerateToken } from '../auth/token.js';
import { upsertHermesRelayConfig } from '../hermes/config.js';
import { type HarnessModel, upsertOpenCodeRelayConfig } from '../opencode/config.js';

async function activePort(): Promise<number> {
  const explicit = Number.parseInt(process.env.PORT ?? '', 10);
  if (Number.isInteger(explicit) && explicit > 0 && explicit < 65536) return explicit;
  try {
    const value = Number.parseInt((await readFile(join(process.cwd(), '.relay-browser', 'active-port'), 'utf8')).trim(), 10);
    if (Number.isInteger(value) && value > 0 && value < 65536) return value;
  } catch { /* use .env */ }
  try {
    const env = await readFile(join(process.cwd(), '.env'), 'utf8');
    return Number.parseInt(env.match(/^PORT=(\d+)$/m)?.[1] ?? '8787', 10);
  } catch {
    return 8787;
  }
}

async function fetchModels(baseUrl: string, token: string): Promise<HarnessModel[]> {
  const response = await fetch(`${baseUrl}/models?include=all`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Relay model discovery returned HTTP ${response.status}.`);
  const body = await response.json() as {
    data?: Array<{ id?: string; x_relay?: { capability_status?: string } }>;
  };
  return (body.data ?? [])
    .filter((model): model is { id: string; x_relay?: { capability_status?: string } } => Boolean(model.id))
    .map((model) => ({ id: model.id, status: model.x_relay?.capability_status }));
}

async function writeAtomic(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  try { await copyFile(path, `${path}.bak-local-ai-relay`); } catch { /* new file */ }
  const temporary = `${path}.local-ai-relay.tmp`;
  await writeFile(temporary, content, { mode: 0o600 });
  await rename(temporary, path);
}

async function configureHermes(baseUrl: string, token: string, models: readonly HarnessModel[]): Promise<string> {
  const path = join(process.env.HERMES_HOME ?? join(homedir(), '.hermes'), 'config.yaml');
  let original = '';
  try { original = await readFile(path, 'utf8'); } catch { /* new file */ }
  const source = original.trim() ? parse(original) : {};
  const defaultModel = process.env.DEFAULT_MODEL ?? models[0]?.id ?? 'mock-gpt-4o-mini';
  const updated = upsertHermesRelayConfig(source, baseUrl, token, models.map((model) => model.id), defaultModel);
  await writeAtomic(path, stringify(updated));
  return path;
}

async function configureOpenCode(baseUrl: string, token: string, models: readonly HarnessModel[]): Promise<string> {
  const path = process.env.OPENCODE_CONFIG ?? join(homedir(), '.config', 'opencode', 'opencode.json');
  let original = '';
  try { original = await readFile(path, 'utf8'); } catch { /* new file */ }
  const source = original.trim() ? JSON.parse(original) : {};
  const updated = upsertOpenCodeRelayConfig(source, baseUrl, token, models);
  await writeAtomic(path, `${JSON.stringify(updated, null, 2)}\n`);
  return path;
}

async function main(): Promise<void> {
  const token = await getOrGenerateToken();
  const baseUrl = `http://127.0.0.1:${await activePort()}/v1`;
  const models = await fetchModels(baseUrl, token);
  if (models.length === 0) throw new Error('Relay returned no registered models.');
  const hermesOnly = process.argv.includes('--hermes');
  const paths = [await configureHermes(baseUrl, token, models)];
  if (!hermesOnly) paths.push(await configureOpenCode(baseUrl, token, models));
  console.log(`PASS: populated ${models.length} model(s) using Responses API.`);
  for (const path of paths) console.log(`  ${path}`);
}

main().catch((error: unknown) => {
  console.error(`HARNESS SETUP FAILED: ${error instanceof Error ? error.message : String(error)}`);
  console.error('Confirm relay is running, then retry. Existing configs remain backed up.');
  process.exitCode = 1;
});
