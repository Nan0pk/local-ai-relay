import {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { parse, stringify } from 'yaml';
import {
  harnessTokens,
  type HarnessTokenRegistry,
} from '../auth/harness-tokens.js';
import { controlEvents } from '../control/events.js';
import { controlStatePath, readJsonFile, writeJsonAtomic } from '../control/storage.js';
import {
  HERMES_PROVIDER_NAME,
  removeHermesRelayConfig,
  upsertHermesRelayConfig,
} from '../hermes/config.js';
import {
  OPENCODE_PROVIDER_ID,
  removeOpenCodeRelayConfig,
  type HarnessModel,
  upsertOpenCodeRelayConfig,
} from '../opencode/config.js';
import { listReadyModels } from '../providers/registry.js';
import { detectHarnessExecutable } from './detection.js';
import { launchHarness } from './launcher.js';
import { resolveRelayPort } from '../startup/relay-location.js';

export type HarnessId = 'hermes' | 'opencode' | 'generic';

interface HarnessReceipt {
  harnessId: HarnessId;
  tokenId: string;
  connectedAt: string;
  path?: string;
  backupPath?: string;
  previousModel?: unknown;
}

interface HarnessLedger {
  version: 1;
  receipts: HarnessReceipt[];
}

export interface HarnessStatus {
  id: HarnessId;
  label: string;
  supported: boolean;
  detected: boolean;
  installed: boolean;
  configurationDetected: boolean;
  connected: boolean;
  /** Configuration exists but points at an old relay URL or unsupported protocol. */
  needsRepair?: boolean;
  executable?: string;
  installUrl?: string;
  path?: string;
  connectedAt?: string;
}

export interface HarnessConnectResult {
  status: HarnessStatus;
  baseUrl: string;
  models: string[];
  token?: string;
  configuration?: Record<string, unknown>;
  backupPath?: string;
}

const LABELS: Record<HarnessId, string> = {
  hermes: 'Hermes Agent',
  opencode: 'OpenCode',
  generic: 'Generic OpenAI-compatible client',
};

const INSTALL_URLS: Partial<Record<HarnessId, string>> = {
  hermes: 'https://hermes-agent.nousresearch.com/docs/getting-started/installation',
  opencode: 'https://opencode.ai/docs/',
};

function emptyLedger(): HarnessLedger {
  return { version: 1, receipts: [] };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function hermesPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.HERMES_HOME ?? join(homedir(), '.hermes'), 'config.yaml');
}

function openCodePath(env: NodeJS.ProcessEnv = process.env): string {
  return env.OPENCODE_CONFIG ?? join(homedir(), '.config', 'opencode', 'opencode.json');
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function writeConfigAtomic(path: string, content: string): Promise<string | undefined> {
  const isPosix = process.platform !== 'win32';
  await mkdir(dirname(path), { recursive: true, ...(isPosix ? { mode: 0o700 } : {}) });
  let backupPath: string | undefined;
  if (await exists(path)) {
    backupPath = `${path}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}`;
    await copyFile(path, backupPath);
    const prefix = `${basename(path)}.backup-`;
    const backups = (await readdir(dirname(path), { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.startsWith(prefix))
      .map((entry) => entry.name)
      .sort()
      .reverse();
    for (const oldBackup of backups.slice(3)) {
      await unlink(join(dirname(path), oldBackup));
    }
  }
  const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, content, isPosix ? { mode: 0o600 } : {});
  await rename(temporary, path);
  return backupPath;
}

function modelCatalog(): HarnessModel[] {
  const readyModels = listReadyModels();
  if (readyModels.length === 0) {
    throw new Error('Connect and verify at least one real provider before configuring a harness.');
  }
  return [
    { id: 'relay-auto', status: 'ready' },
    ...readyModels.map((model) => ({ id: model.id, status: 'ready' })),
  ];
}

function isHarnessId(value: string): value is HarnessId {
  return value === 'hermes' || value === 'opencode' || value === 'generic';
}

export class HarnessManager {
  constructor(
    private readonly ledgerPath = controlStatePath(
      'harness-integrations.json',
      'RELAY_HARNESS_LEDGER',
    ),
    private readonly tokenRegistry: HarnessTokenRegistry = harnessTokens,
  ) {}

  parseHarnessId(value: string): HarnessId {
    if (!isHarnessId(value)) throw new Error(`Unsupported harness '${value}'.`);
    return value;
  }

  async list(): Promise<HarnessStatus[]> {
    return Promise.all((['hermes', 'opencode', 'generic'] as const).map((id) => this.status(id)));
  }

  async status(harnessId: HarnessId): Promise<HarnessStatus> {
    const ledger = this.loadLedger();
    const receipt = ledger.receipts.find((item) => item.harnessId === harnessId);
    if (harnessId === 'generic') {
      return {
        id: harnessId,
        label: LABELS[harnessId],
        supported: true,
        detected: true,
        installed: true,
        configurationDetected: Boolean(receipt),
        connected: Boolean(receipt),
        ...(receipt ? { connectedAt: receipt.connectedAt } : {}),
      };
    }
    const path = harnessId === 'hermes' ? hermesPath() : openCodePath();
    const executable = await detectHarnessExecutable(harnessId);
    const configurationDetected = await exists(path);
    let connected = false;
    let needsRepair = false;
    if (configurationDetected) {
      try {
        const source = await readFile(path, 'utf8');
        const config = harnessId === 'hermes' ? record(parse(source)) : record(JSON.parse(source));
        const relay = harnessId === 'hermes'
          ? (Array.isArray(config.custom_providers)
            ? config.custom_providers.find((item: unknown) => record(item).name === HERMES_PROVIDER_NAME)
            : undefined)
          : record(record(config.provider))[OPENCODE_PROVIDER_ID];
        const key = harnessId === 'hermes' ? record(relay).api_key : record(record(relay).options).apiKey;
        const url = harnessId === 'hermes' ? record(relay).base_url : record(record(relay).options).baseURL;
        const protocolValid = harnessId !== 'hermes' || record(relay).api_mode === 'chat_completions';
        connected = Boolean(relay && typeof key === 'string' && this.tokenRegistry.verify(key) && protocolValid);
        const activePort = await resolveRelayPort();
        const activeUrl = activePort ? `http://127.0.0.1:${activePort}/v1` : undefined;
        needsRepair = Boolean(connected && activeUrl && url !== activeUrl);
        if (needsRepair) connected = false;
      } catch {
        connected = false;
      }
    }
    return {
      id: harnessId,
      label: LABELS[harnessId],
      supported: true,
      detected: Boolean(executable),
      installed: Boolean(executable),
      configurationDetected,
      connected,
      ...(needsRepair ? { needsRepair: true } : {}),
      path,
      ...(executable ? { executable } : {}),
      ...(INSTALL_URLS[harnessId] ? { installUrl: INSTALL_URLS[harnessId] } : {}),
      ...(receipt ? { connectedAt: receipt.connectedAt } : {}),
    };
  }

  async connect(harnessId: HarnessId, baseUrl: string): Promise<HarnessConnectResult> {
    const models = modelCatalog();
    // Keep the previous token valid until the new configuration is committed.
    // This makes reconnect transactional if a config file is malformed or
    // unwritable.
    const tokenRecord = await this.tokenRegistry.issue(
      harnessId,
      { replaceExisting: false },
    );
    const ledger = this.loadLedger();
    const previousReceipt = ledger.receipts.find((item) => item.harnessId === harnessId);
    try {
      if (harnessId === 'generic') {
        const receipt: HarnessReceipt = {
          harnessId,
          tokenId: tokenRecord.id,
          connectedAt: new Date().toISOString(),
        };
        await this.saveReceipt(receipt);
        await this.tokenRegistry.retainHarnessToken(harnessId, tokenRecord.id);
        const configuration = {
          base_url: baseUrl,
          api_key: tokenRecord.token,
          model: 'relay-auto',
        };
        controlEvents.record({
          scope: 'harness',
          code: 'harness_connected',
          message: 'Generated a scoped Generic OpenAI-compatible client connection.',
          harnessId,
        });
        return {
          status: await this.status(harnessId),
          baseUrl,
          models: models.map((model) => model.id),
          token: tokenRecord.token,
          configuration,
        };
      }

      const path = harnessId === 'hermes' ? hermesPath() : openCodePath();
      let sourceText = '';
      try { sourceText = await readFile(path, 'utf8'); } catch { /* new configuration */ }
      const source = sourceText.trim()
        ? (harnessId === 'hermes' ? parse(sourceText) : JSON.parse(sourceText))
        : {};
      const previousModel = previousReceipt?.previousModel
        ?? (harnessId === 'hermes' ? structuredClone(record(source).model) : undefined);
      const updated = harnessId === 'hermes'
        ? upsertHermesRelayConfig(
            source,
            baseUrl,
            tokenRecord.token,
            models.map((model) => model.id),
            'relay-auto',
          )
        : upsertOpenCodeRelayConfig(source, baseUrl, tokenRecord.token, models);
      const content = harnessId === 'hermes'
        ? stringify(updated)
        : `${JSON.stringify(updated, null, 2)}\n`;
      const backupPath = await writeConfigAtomic(path, content);
      const receipt: HarnessReceipt = {
        harnessId,
        tokenId: tokenRecord.id,
        connectedAt: new Date().toISOString(),
        path,
        ...(backupPath ? { backupPath } : {}),
        ...(previousModel && Object.keys(record(previousModel)).length > 0 ? { previousModel } : {}),
      };
      await this.saveReceipt(receipt);
      await this.tokenRegistry.retainHarnessToken(harnessId, tokenRecord.id);
      controlEvents.record({
        scope: 'harness',
        code: 'harness_connected',
        message: `${LABELS[harnessId]} was connected with a dedicated revocable token.`,
        harnessId,
        detail: backupPath ? `Previous configuration backed up to ${backupPath}.` : 'Created a new configuration file.',
      });
      return {
        status: await this.status(harnessId),
        baseUrl,
        models: models.map((model) => model.id),
        backupPath,
      };
    } catch (error) {
      await this.tokenRegistry.revokeToken(tokenRecord.id);
      throw error;
    }
  }

  /**
   * Move relay-owned configurations to the port currently recorded by the
   * runtime. Only entries with a receipt and a still-valid scoped token are
   * touched; unrelated user configuration is never rewritten.
   */
  async repairOwnedConfigurations(options: { activePort?: number } = {}): Promise<string[]> {
    const port = options.activePort ?? await resolveRelayPort();
    if (!port) return [];
    const baseUrl = `http://127.0.0.1:${port}/v1`;
    const repaired: string[] = [];
    const ledger = this.loadLedger();
    for (const receipt of ledger.receipts.filter((item) => item.harnessId === 'hermes' || item.harnessId === 'opencode')) {
      if (!receipt.path || !(await exists(receipt.path))) continue;
      try {
        const text = await readFile(receipt.path, 'utf8');
        const source = receipt.harnessId === 'hermes' ? parse(text) : JSON.parse(text);
        const relay = receipt.harnessId === 'hermes'
          ? (Array.isArray(record(source).custom_providers)
            ? (record(source).custom_providers as unknown[]).find((item: unknown) => record(item).name === HERMES_PROVIDER_NAME)
            : undefined)
          : record(record(source).provider)[OPENCODE_PROVIDER_ID];
        const key = receipt.harnessId === 'hermes' ? record(relay).api_key : record(record(relay).options).apiKey;
        if (typeof key !== 'string' || !this.tokenRegistry.verify(key)) continue;
        const oldUrl = receipt.harnessId === 'hermes' ? record(relay).base_url : record(record(relay).options).baseURL;
        const protocolNeedsRepair = receipt.harnessId === 'hermes' && record(relay).api_mode !== 'chat_completions';
        if (oldUrl === baseUrl && !protocolNeedsRepair) continue;
        const updated = receipt.harnessId === 'hermes'
          ? upsertHermesRelayConfig(source, baseUrl, key, Object.keys(record(record(relay).models)), record(relay).model as string | undefined)
          : upsertOpenCodeRelayConfig(source, baseUrl, key, Object.keys(record(record(relay).models)).map((id) => ({ id, status: 'ready' })));
        await writeConfigAtomic(receipt.path, receipt.harnessId === 'hermes' ? stringify(updated) : `${JSON.stringify(updated, null, 2)}\n`);
        repaired.push(receipt.harnessId);
      } catch {
        // A malformed or concurrently replaced config is not safe to repair.
      }
    }
    return repaired;
  }

  async launch(harnessId: HarnessId): Promise<HarnessStatus> {
    const status = await this.status(harnessId);
    if (!status.connected) {
      throw new Error(`Connect ${status.label} to the relay before launching it.`);
    }
    if (!status.executable) {
      throw new Error(
        `${status.label} is configured, but its executable was not found in PATH. Install it or launch it from its normal shortcut.`,
      );
    }
    await launchHarness(harnessId, status.executable);
    controlEvents.record({
      scope: 'harness',
      code: 'harness_launched',
      message: `${status.label} was launched in a terminal.`,
      harnessId,
    });
    return status;
  }

  async disconnect(harnessId: HarnessId): Promise<HarnessStatus> {
    const ledger = this.loadLedger();
    const receipt = ledger.receipts.find((item) => item.harnessId === harnessId);
    let configurationError: unknown;
    if (harnessId !== 'generic') {
      const path = receipt?.path ?? (harnessId === 'hermes' ? hermesPath() : openCodePath());
      if (await exists(path)) {
        try {
          const sourceText = await readFile(path, 'utf8');
          const source = harnessId === 'hermes' ? parse(sourceText) : JSON.parse(sourceText);
          const updated = harnessId === 'hermes'
            ? removeHermesRelayConfig(source, receipt?.previousModel)
            : removeOpenCodeRelayConfig(source);
          await writeConfigAtomic(
            path,
            harnessId === 'hermes' ? stringify(updated) : `${JSON.stringify(updated, null, 2)}\n`,
          );
        } catch (error) {
          configurationError = error;
        }
      }
    }
    await this.tokenRegistry.revokeHarness(harnessId);
    ledger.receipts = ledger.receipts.filter((item) => item.harnessId !== harnessId);
    await writeJsonAtomic(this.ledgerPath, ledger);
    controlEvents.record({
      scope: 'harness',
      ...(configurationError ? { level: 'error' as const } : {}),
      code: 'harness_disconnected',
      message: configurationError
        ? `${LABELS[harnessId]} token was revoked, but its configuration needs manual cleanup.`
        : `${LABELS[harnessId]} was disconnected and its token was revoked.`,
      harnessId,
      ...(configurationError ? {
        detail: configurationError instanceof Error
          ? configurationError.message
          : String(configurationError),
      } : {}),
    });
    if (configurationError) {
      throw new Error(
        `${LABELS[harnessId]} token was revoked, but its configuration could not be edited: ${
          configurationError instanceof Error ? configurationError.message : String(configurationError)
        }`,
      );
    }
    return this.status(harnessId);
  }

  async disconnectAll(): Promise<HarnessStatus[]> {
    for (const harnessId of ['hermes', 'opencode', 'generic'] as const) {
      try {
        await this.disconnect(harnessId);
      } catch {
        // Continue so one malformed config cannot prevent other token
        // revocations. The detailed failure is already in the event journal.
      }
    }
    return this.list();
  }

  private loadLedger(): HarnessLedger {
    const value = readJsonFile<unknown>(this.ledgerPath, emptyLedger());
    if (!value || typeof value !== 'object') return emptyLedger();
    const candidate = value as Partial<HarnessLedger>;
    if (candidate.version !== 1 || !Array.isArray(candidate.receipts)) return emptyLedger();
    return {
      version: 1,
      receipts: candidate.receipts.filter((item): item is HarnessReceipt => (
        Boolean(item)
        && isHarnessId(String(item.harnessId))
        && typeof item.tokenId === 'string'
        && typeof item.connectedAt === 'string'
      )),
    };
  }

  private async saveReceipt(receipt: HarnessReceipt): Promise<void> {
    const ledger = this.loadLedger();
    ledger.receipts = ledger.receipts.filter((item) => item.harnessId !== receipt.harnessId);
    ledger.receipts.push(receipt);
    await writeJsonAtomic(this.ledgerPath, ledger);
  }
}

export const harnessManager = new HarnessManager();
