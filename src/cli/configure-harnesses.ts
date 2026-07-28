import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse, stringify } from 'yaml';
import { getOrGenerateToken } from '../auth/token.js';
import { upsertHermesRelayConfig } from '../hermes/config.js';
import { type HarnessModel, upsertOpenCodeRelayConfig } from '../opencode/config.js';
import { resolveRelayPort } from '../startup/relay-location.js';

async function fetchModels(baseUrl: string, token: string): Promise<HarnessModel[]> {
  const response = await fetch(`${baseUrl}/models`, {
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

async function discoverModels(baseUrl: string, token: string): Promise<HarnessModel[]> {
  try {
    const health = await fetch(baseUrl.replace(/\/v1$/, '/health'));
    const identity = await health.json() as { service?: unknown };
    if (!health.ok || identity.service !== 'local-ai-relay') throw new Error('not_local_ai_relay');
    return await fetchModels(baseUrl, token);
  } catch (error) {
    throw new Error(
      `Could not discover usable relay models. Start the relay and connect a provider first: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function writeAtomic(path: string, content: string): Promise<void> {
  const isPosix = process.platform !== 'win32';
  await mkdir(dirname(path), { recursive: true });
  try { await copyFile(path, `${path}.bak-local-ai-relay`); } catch { /* new file */ }
  const temporary = `${path}.local-ai-relay.tmp`;
  await writeFile(temporary, content, isPosix ? { mode: 0o600 } : {});
  await rename(temporary, path);
}

async function configureHermes(baseUrl: string, token: string, models: readonly HarnessModel[]): Promise<string> {
  const path = join(process.env.HERMES_HOME ?? join(homedir(), '.hermes'), 'config.yaml');
  let original = '';
  try { original = await readFile(path, 'utf8'); } catch { /* new file */ }
  const source = original.trim() ? parse(original) : {};
  const defaultModel = process.env.DEFAULT_MODEL ?? (
    models.some((model) => model.id === 'relay-auto')
      ? 'relay-auto'
      : models[0]?.id
  );
  if (!defaultModel) throw new Error('No usable model is available for Hermes.');
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

export async function runHarnessConfiguration(overridePort?: number, silent = false): Promise<string[]> {
  const token = await getOrGenerateToken();
  const port = overridePort ?? await resolveRelayPort();
  const baseUrl = `http://127.0.0.1:${port}/v1`;
  const models = await discoverModels(baseUrl, token);
  if (models.length === 0) throw new Error('Relay returned no registered models.');
  const hermesOnly = process.argv.includes('--hermes');
  const paths = [await configureHermes(baseUrl, token, models)];
  if (!hermesOnly) paths.push(await configureOpenCode(baseUrl, token, models));
  if (!silent) {
    console.log(`PASS: populated ${models.length} usable model(s) using the Responses API.`);
    for (const path of paths) console.log(`  ${path}`);
  }
  return paths;
}

if (process.argv[1]?.endsWith('configure-harnesses.ts') || process.argv[1]?.endsWith('configure-harnesses.js')) {
  runHarnessConfiguration().catch((error: unknown) => {
    console.error(`HARNESS SETUP FAILED: ${error instanceof Error ? error.message : String(error)}`);
    console.error('Existing configs remain backed up.');
    process.exitCode = 1;
  });
}
