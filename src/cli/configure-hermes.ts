import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse, stringify } from 'yaml';
import { HERMES_MODEL_ID, HERMES_PROVIDER_NAME, upsertHermesRelayConfig } from '../hermes/config.js';

async function activePort(): Promise<number> {
  try {
    const value = Number.parseInt((await readFile(join(process.cwd(), '.relay-browser', 'active-port'), 'utf8')).trim(), 10);
    if (Number.isInteger(value) && value > 0 && value < 65536) return value;
  } catch { /* fall through */ }
  const env = await readFile(join(process.cwd(), '.env'), 'utf8');
  return Number.parseInt(env.match(/^PORT=(\d+)$/m)?.[1] ?? '8787', 10);
}

async function fetchAdvertisedModelIds(baseUrl: string): Promise<string[]> {
  const response = await fetch(`${baseUrl}/models`);
  if (!response.ok) throw new Error(`Relay model discovery returned HTTP ${response.status}.`);
  const body = await response.json() as { data?: Array<{ id?: string }> };
  const ids = (body.data ?? [])
    .map((model) => model?.id)
    .filter((id): id is string => Boolean(id) && id !== HERMES_MODEL_ID);
  return ids;
}

async function writeHermesConfig(baseUrl: string, additionalModelIds: readonly string[]): Promise<void> {
  const hermesHome = process.env.HERMES_HOME ?? join(homedir(), '.hermes');
  const configPath = join(hermesHome, 'config.yaml');
  await mkdir(dirname(configPath), { recursive: true });
  let original = '';
  try { original = await readFile(configPath, 'utf8'); } catch { /* create below */ }
  const parsed = original.trim() ? parse(original) : {};
  const updated = upsertHermesRelayConfig(parsed, baseUrl, additionalModelIds);
  if (original) await copyFile(configPath, `${configPath}.bak-local-ai-relay`);
  const temporary = `${configPath}.local-ai-relay.tmp`;
  await writeFile(temporary, stringify(updated), { mode: 0o600 });
  await rename(temporary, configPath);
}

async function main(): Promise<void> {
  const port = await activePort();
  const baseUrl = `http://127.0.0.1:${port}/v1`;
  const response = await fetch(`${baseUrl}/models`);
  if (!response.ok) throw new Error(`Relay model discovery returned HTTP ${response.status}.`);
  const body = await response.json() as { data?: Array<{ id?: string }> };
  if (!body.data?.some((model) => model.id === HERMES_MODEL_ID)) {
    throw new Error(`The running relay does not advertise ${HERMES_MODEL_ID}.`);
  }

  const additionalModelIds = await fetchAdvertisedModelIds(baseUrl);
  await writeHermesConfig(baseUrl, additionalModelIds);

  const allModels = [HERMES_MODEL_ID, ...additionalModelIds];
  console.log(`PASS: Hermes named provider ${HERMES_PROVIDER_NAME} advertises ${allModels.length} model(s):`);
  for (const id of allModels) {
    console.log(`  - custom:${HERMES_PROVIDER_NAME}:${id}`);
  }
  console.log(`Default selector: custom:${HERMES_PROVIDER_NAME}:${HERMES_MODEL_ID}`);
  console.log('Start a new Hermes session for the change to take effect.');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`HERMES SETUP FAILED: ${message}`);
  console.error('The relay remains installed and healthy; Hermes configuration was not reported as complete.');
  process.exitCode = 1;
});
