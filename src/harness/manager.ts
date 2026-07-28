import { access, copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
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
import { listAllModels } from '../providers/registry.js';

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
  connected: boolean;
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
    backupPath = `${path}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    await copyFile(path, backupPath);
  }
  const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, content, isPosix ? { mode: 0o600 } : {});
  await rename(temporary, path);
  return backupPath;
}

function modelCatalog(): HarnessModel[] {
  return [
    { id: 'relay-auto', status: 'ready' },
    ...listAllModels().map((model) => ({ id: model.id })),
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
        connected: Boolean(receipt),
        ...(receipt ? { connectedAt: receipt.connectedAt } : {}),
      };
    }
    const path = harnessId === 'hermes' ? hermesPath() : openCodePath();
    const detected = await exists(path);
    let connected = false;
    if (detected) {
      try {
        const source = await readFile(path, 'utf8');
        const config = harnessId === 'hermes' ? record(parse(source)) : record(JSON.parse(source));
        connected = harnessId === 'hermes'
          ? (Array.isArray(config.custom_providers) && config.custom_providers.some(
              (item) => record(item).name === HERMES_PROVIDER_NAME,
            ))
          : Object.prototype.hasOwnProperty.call(
              record(config.provider),
              OPENCODE_PROVIDER_ID,
            );
      } catch {
        connected = false;
      }
    }
    return {
      id: harnessId,
      label: LABELS[harnessId],
      supported: true,
      detected,
      connected,
      path,
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
