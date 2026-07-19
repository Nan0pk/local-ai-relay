import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { stringify } from 'yaml';
import { findSystemBrowser, getWritableHome } from '../browser/paths.js';
import { persistCapability } from '../capabilities/evidence-store.js';
import type { ProviderCapabilityRecord } from '../capabilities/tracker.js';
import { HERMES_PROVIDER_NAME, upsertHermesRelayConfig } from '../hermes/config.js';

const execFileAsync = promisify(execFile);
const MODEL = 'browser-chatgpt-free';
const PROVIDER = `custom:${HERMES_PROVIDER_NAME}`;
const CANARY_COUNT = 5;

interface CommandResult {
  stdout: string;
  stderr: string;
}

interface RelayProcess {
  child: ChildProcess;
  instanceId: string;
}

interface MissionResult {
  name: string;
  duration_ms: number;
  status: 'passed' | 'failed';
  failure_class?: string;
}

interface Evidence {
  schema_version: 1;
  provider: 'chatgpt';
  model: typeof MODEL;
  recorded_at: string;
  os: string;
  node: string;
  chrome: string;
  patchright: string;
  hermes: string;
  commit: string;
  worktree: string;
  mission_count: number;
  missions: MissionResult[];
}

export function isExactMarker(output: string, marker: string): boolean {
  return output.trim().replace(/\s+/g, ' ') === marker;
}

export function sessionIdFrom(output: string): string | undefined {
  return output.match(/session_id:\s*([^\s]+)/)?.[1];
}

export function streamedTextFromSse(body: string): string | undefined {
  let complete = false;
  let text = '';
  for (const frame of body.split(/\r?\n\r?\n/)) {
    const data = frame.split(/\r?\n/).find((line) => line.startsWith('data: '))?.slice(6);
    if (!data) continue;
    if (data === '[DONE]') {
      complete = true;
      continue;
    }
    try {
      const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: unknown } }> };
      const content = parsed.choices?.[0]?.delta?.content;
      if (typeof content === 'string') text += content;
    } catch { /* Ignore non-content event frames. */ }
  }
  return complete ? text : undefined;
}

export function hermesVersionFrom(output: string): string {
  const version = output.match(/Hermes Agent v([0-9][0-9A-Za-z._-]*)/i)?.[1];
  const commit = output.match(/upstream\s+([0-9a-f]{7,64})/i)?.[1];
  return [version && `v${version}`, commit].filter(Boolean).join(' ') || 'unknown';
}

function failureClass(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/login|required|sign in/i.test(message)) return 'login_required';
  if (/captcha|challenge/i.test(message)) return 'captcha';
  if (/rate limit/i.test(message)) return 'rate_limited';
  if (/quota/i.test(message)) return 'quota_exhausted';
  if (/timeout|timed out/i.test(message)) return 'timeout';
  return 'mission_failed';
}

function port(): number {
  const explicit = Number.parseInt(process.env.RELAY_CANARY_PORT ?? '', 10);
  return Number.isInteger(explicit) && explicit > 0 && explicit < 65_536
    ? explicit
    : 30_000 + Math.floor(Math.random() * 10_000);
}

async function osName(): Promise<string> {
  try {
    const source = await readFile('/etc/os-release', 'utf8');
    return source.match(/^PRETTY_NAME=(?:"([^"]+)"|(.+))$/m)?.slice(1).find(Boolean) ?? process.platform;
  } catch {
    return process.platform;
  }
}

async function installedChrome(): Promise<string> {
  const browser = await findSystemBrowser();
  if (!browser) return 'unavailable';
  return (await run(browser, ['--version'], process.env)).stdout.trim();
}

async function patchrightVersion(): Promise<string> {
  try {
    const source = await readFile(join(process.cwd(), 'node_modules', 'patchright', 'package.json'), 'utf8');
    const value = JSON.parse(source) as { version?: unknown };
    return typeof value.version === 'string' ? value.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

async function run(command: string, args: string[], env: NodeJS.ProcessEnv, cwd = process.cwd()): Promise<CommandResult> {
  const result = await execFileAsync(command, args, {
    cwd,
    env,
    maxBuffer: 2 * 1024 * 1024,
  });
  return { stdout: result.stdout, stderr: result.stderr };
}

async function worktreeFingerprint(): Promise<string> {
  const tracked = await run('git', ['diff', '--binary', 'HEAD', '--'], process.env);
  const untracked = await run('git', ['ls-files', '--others', '--exclude-standard', '-z'], process.env);
  const hash = createHash('sha256').update(tracked.stdout);
  for (const path of untracked.stdout.split('\0').filter(Boolean).sort()) {
    hash.update(path).update('\0').update(await readFile(join(process.cwd(), path)));
  }
  return `sha256:${hash.digest('hex')}`;
}

async function waitForPortDown(value: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${value}/health`, { signal: AbortSignal.timeout(250) });
      if (!response.ok) return;
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('relay_port_still_open');
}

async function stop(relay: RelayProcess, value: number): Promise<void> {
  const { child } = relay;
  if (child.exitCode !== null) {
    await waitForPortDown(value);
    return;
  }
  child.kill('SIGTERM');
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('relay_stop_timeout')), 5_000);
    timeout.unref();
    const done = (): void => { clearTimeout(timeout); resolve(); };
    child.once('exit', done);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
  });
  await waitForPortDown(value);
}

async function startRelay(value: number, token: string, environment: NodeJS.ProcessEnv = {}): Promise<RelayProcess> {
  await waitForPortDown(value);
  const instanceId = randomBytes(16).toString('hex');
  const relay = spawn(process.execPath, ['dist/index.js'], {
    cwd: process.cwd(),
    env: { ...process.env, ...environment, HOST: '127.0.0.1', PORT: String(value), RELAY_API_TOKEN: token, RELAY_INSTANCE_ID: instanceId, LOG_LEVEL: 'silent' },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (relay.exitCode !== null) throw new Error('relay_start_failed');
    try {
      const response = await fetch(`http://127.0.0.1:${value}/health`);
      const body = await response.json() as { service?: unknown; instance_id?: unknown };
      if (response.ok && body.service === 'local-ai-relay' && body.instance_id === instanceId) {
        return { child: relay, instanceId };
      }
    } catch { /* relay still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await stop({ child: relay, instanceId }, value);
  throw new Error('relay_start_timeout');
}

export async function writeHermesCanaryPlugin(home: string, countPath: string): Promise<void> {
  const directory = join(home, 'plugins', 'relay_canary');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(join(directory, 'plugin.yaml'), [
    'name: relay_canary',
    'version: 1.0.0',
    'description: Fixed read-only local-ai-relay canary tool.',
    'kind: standalone',
    'provides_tools:',
    '  - relay_canary_readonly',
    '',
  ].join('\n'), { mode: 0o600 });
  const escapedCountPath = JSON.stringify(countPath);
  await writeFile(join(directory, '__init__.py'), [
    'from pathlib import Path',
    '',
    `COUNT_PATH = Path(${escapedCountPath})`,
    '',
    'def relay_canary_readonly(args, **kwargs):',
    '    with COUNT_PATH.open("a") as records:',
    '        records.write("call\\n")',
    '    return "SAFE_TOOL_RESULT_OK"',
    '',
    'def register(ctx):',
    '    ctx.register_tool(',
    '        name="relay_canary_readonly",',
    '        toolset="relay_canary",',
    '        schema={"name": "relay_canary_readonly", "description": "Return the fixed safe canary marker.", "parameters": {"type": "object", "properties": {}, "additionalProperties": False}},',
    '        handler=relay_canary_readonly,',
    '    )',
    '',
  ].join('\n'), { mode: 0o600 });
}

export async function writeHermesConfig(home: string, baseUrl: string, token: string): Promise<string> {
  await mkdir(home, { recursive: true, mode: 0o700 });
  const countPath = join(home, 'relay-canary-tool-count');
  await writeHermesCanaryPlugin(home, countPath);
  const config = upsertHermesRelayConfig({
    plugins: { enabled: ['relay_canary'] },
    platform_toolsets: { cli: ['relay_canary', 'no_mcp'] },
    agent: { max_turns: 2 },
  }, baseUrl, token, [MODEL], MODEL);
  await writeFile(join(home, 'config.yaml'), stringify(config), { mode: 0o600 });
  return countPath;
}

async function callHermes(home: string, workspace: string, prompt: string, options: { resume?: string } = {}): Promise<CommandResult> {
  const args = options.resume
    ? ['chat', '-q', prompt, '--provider', PROVIDER, '--model', MODEL, '--resume', options.resume, '--no-restore-cwd', '--ignore-rules', '--toolsets', 'relay_canary', '-Q']
    : ['-z', prompt, '--provider', PROVIDER, '--model', MODEL, '--ignore-rules', '--toolsets', 'relay_canary'];
  const isolatedHome = join(home, 'os-home');
  await mkdir(isolatedHome, { recursive: true, mode: 0o700 });
  return run(process.env.HERMES_BIN ?? 'hermes', args, {
    ...process.env,
    HERMES_HOME: home,
    HOME: isolatedHome,
    XDG_CONFIG_HOME: join(home, 'xdg-config'),
  }, workspace);
}

async function assertHermesMarker(home: string, workspace: string, marker: string, prefix = ''): Promise<void> {
  const result = await callHermes(home, workspace, `${prefix}Reply with exactly: ${marker}`);
  if (!isExactMarker(result.stdout, marker)) throw new Error('hermes_marker_mismatch');
}

async function streamedCheck(baseUrl: string, token: string): Promise<void> {
  const marker = 'RELAY_STREAM_OK';
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, stream: true, messages: [{ role: 'user', content: `Reply with exactly: ${marker}` }] }),
  });
  const body = await response.text();
  if (!response.ok || !isExactMarker(streamedTextFromSse(body) ?? '', marker)) throw new Error('streaming_failed');
}

async function hermesToolRoundTrip(home: string, workspace: string, countPath: string): Promise<void> {
  const result = await callHermes(
    home,
    workspace,
    'Call relay_canary_readonly exactly once. Then reply with exactly: SAFE_TOOL_RESULT_OK.',
  );
  if (!isExactMarker(result.stdout, 'SAFE_TOOL_RESULT_OK')) throw new Error('hermes_tool_result_mismatch');
  const count = (await readFile(countPath, 'utf8').catch(() => '')).split('\n').filter(Boolean).length;
  if (count !== 1) throw new Error('hermes_tool_call_count_mismatch');
}

async function writeEvidence(evidence: Evidence): Promise<string> {
  const directory = join(getWritableHome(), '.local-ai-relay', 'evidence');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const name = `chatgpt-canary-${evidence.recorded_at.replace(/[:.]/g, '-')}.json`;
  const destination = join(directory, name);
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, destination);
  return destination;
}

async function main(): Promise<void> {
  if (process.env.RELAY_MOCK_BROWSER === 'true') {
    throw new Error('live_chatgpt_canary_requires_real_browser');
  }
  const startedAt = new Date().toISOString();
  const missions: MissionResult[] = [];
  const token = randomBytes(32).toString('hex');
  const selectedPort = port();
  const baseUrl = `http://127.0.0.1:${selectedPort}/v1`;
  const hermesHome = await mkdtemp(join(tmpdir(), 'local-ai-relay-hermes-'));
  const hermesWorkspace = await mkdtemp(join(tmpdir(), 'local-ai-relay-hermes-workspace-'));
  const stagedCapabilityStore = join(hermesHome, 'capabilities.json');
  let relay: RelayProcess | undefined;
  let toolCountPath: string | undefined;
  const evidence: Evidence = {
    schema_version: 1,
    provider: 'chatgpt',
    model: MODEL,
    recorded_at: startedAt,
    os: await osName(),
    node: process.version,
    chrome: await installedChrome(),
    patchright: await patchrightVersion(),
    hermes: hermesVersionFrom((await run(process.env.HERMES_BIN ?? 'hermes', ['--version'], process.env)).stdout),
    commit: (await run('git', ['rev-parse', 'HEAD'], process.env)).stdout.trim(),
    worktree: await worktreeFingerprint(),
    mission_count: 0,
    missions,
  };
  const mission = async (name: string, action: () => Promise<void>): Promise<void> => {
    const started = Date.now();
    try {
      await action();
      missions.push({ name, duration_ms: Date.now() - started, status: 'passed' });
    } catch (error) {
      missions.push({ name, duration_ms: Date.now() - started, status: 'failed', failure_class: failureClass(error) });
      throw error;
    }
  };

  try {
    await mission('fresh_probe', async () => {
      await run(process.execPath, ['--import', 'tsx', 'src/cli/live-probe.ts', '--provider', 'chatgpt'], process.env);
    });
    relay = await startRelay(selectedPort, token);
    toolCountPath = await writeHermesConfig(hermesHome, baseUrl, token);
    await mission('hermes_single_turn', () => assertHermesMarker(hermesHome, hermesWorkspace, 'HERMES_SINGLE_OK'));
    await mission('compatibility_streaming', () => streamedCheck(baseUrl, token));
    await mission('hermes_continuation', async () => {
      const first = await callHermes(hermesHome, hermesWorkspace, 'Reply with exactly: HERMES_CONTINUATION_ONE');
      const session = sessionIdFrom(first.stderr);
      if (!session) throw new Error('hermes_session_missing');
      const second = await callHermes(hermesHome, hermesWorkspace, 'Reply with exactly: HERMES_CONTINUATION_TWO', { resume: session });
      if (!isExactMarker(second.stdout, 'HERMES_CONTINUATION_TWO')) throw new Error('hermes_continuation_mismatch');
    });
    await mission('long_native_insertion', () => assertHermesMarker(hermesHome, hermesWorkspace, 'HERMES_LONG_PROMPT_OK', `${'safe canary text '.repeat(900)}\n\n`));
    await mission('hermes_compact_tool_round_trip', () => hermesToolRoundTrip(hermesHome, hermesWorkspace, toolCountPath!));

    await stop(relay, selectedPort);
    relay = await startRelay(selectedPort, token);
    for (let index = 1; index <= CANARY_COUNT; index += 1) {
      await mission(`cold_restart_canary_${index}`, () => assertHermesMarker(hermesHome, hermesWorkspace, `HERMES_CANARY_${index}_OK`));
    }

    const now = new Date().toISOString();
    const ready: ProviderCapabilityRecord = {
      providerId: 'browser-chatgpt',
      status: 'ready',
      evidence: { reference: `live-chatgpt-canary:${now}`, recordedAt: now, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() },
      detail: 'Full Hermes and relay ChatGPT canary passed.',
      updatedAt: now,
    };
    await persistCapability(ready, stagedCapabilityStore);
    await stop(relay, selectedPort);
    relay = await startRelay(selectedPort, token, { RELAY_CAPABILITY_STORE: stagedCapabilityStore });
    await mission('post_promotion_discovery', async () => {
      const response = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json() as { data?: Array<{ id?: string }> };
      if (!response.ok || !body.data?.some((model) => model.id === MODEL)) throw new Error('promotion_discovery_failed');
    });
    evidence.mission_count = missions.length;
    const evidencePath = await writeEvidence(evidence);
    await stop(relay, selectedPort);
    relay = undefined;
    await rm(hermesHome, { recursive: true, force: true });
    await rm(hermesWorkspace, { recursive: true, force: true });
    await persistCapability(ready);
    console.log(`PASS: ${missions.length} ChatGPT canary missions passed. Sanitized evidence: ${evidencePath}`);
  } catch (error) {
    evidence.mission_count = missions.length;
    const evidencePath = await writeEvidence(evidence);
    console.error(`FAIL: ChatGPT canary failed (${failureClass(error)}). Sanitized evidence: ${evidencePath}`);
    process.exitCode = 1;
  } finally {
    await Promise.allSettled([
      relay ? stop(relay, selectedPort) : Promise.resolve(),
      rm(hermesHome, { recursive: true, force: true }),
      rm(hermesWorkspace, { recursive: true, force: true }),
    ]);
  }
}

const isMain = process.argv[1]?.endsWith('chatgpt-canary.ts') || process.argv[1]?.endsWith('chatgpt-canary.js');
if (isMain) {
  void main().catch((error: unknown) => {
    console.error(`FAIL: ${failureClass(error)}`);
    process.exitCode = 1;
  });
}
