import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { getWritableHome } from '../browser/paths.js';

export type RequestState = 'PREPARED' | 'SUBMITTED' | 'OBSERVING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type ToolState = 'PREPARED' | 'EXECUTING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface LedgerRequestRecord {
  requestId: string;
  provider: string;
  generation: number;
  promptHash: string;
  state: RequestState;
  failureClass?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LedgerToolRecord {
  toolCallId: string;
  requestId: string;
  state: ToolState;
  createdAt: string;
}

export class SqliteLedger {
  private db: DatabaseSync;

  constructor(dbPath?: string) {
    const targetPath = dbPath ?? join(getWritableHome(), '.local-ai-relay', 'ledger.db');
    if (targetPath !== ':memory:') {
      mkdirSync(dirname(targetPath), { recursive: true });
    }
    this.db = new DatabaseSync(targetPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS generations (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        current_generation INTEGER NOT NULL DEFAULT 1
      );

      INSERT OR IGNORE INTO generations (id, current_generation) VALUES (1, 1);

      CREATE TABLE IF NOT EXISTS requests (
        request_id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        generation INTEGER NOT NULL,
        prompt_hash TEXT NOT NULL,
        state TEXT NOT NULL,
        failure_class TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tool_executions (
        tool_call_id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL,
        state TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (request_id) REFERENCES requests(request_id)
      );
    `);
  }

  public getCurrentGeneration(): number {
    const stmt = this.db.prepare('SELECT current_generation FROM generations WHERE id = 1');
    const row = stmt.get() as { current_generation: number } | undefined;
    return row?.current_generation ?? 1;
  }

  public incrementGeneration(): number {
    const nextGen = this.getCurrentGeneration() + 1;
    const stmt = this.db.prepare('UPDATE generations SET current_generation = ? WHERE id = 1');
    stmt.run(nextGen);
    return nextGen;
  }

  public hashPrompt(promptText: string): string {
    return createHash('sha256').update(promptText).digest('hex');
  }

  public createRequest(requestId: string, provider: string, promptTextOrHash: string): LedgerRequestRecord {
    const promptHash = promptTextOrHash.length === 64 && /^[0-9a-f]+$/i.test(promptTextOrHash)
      ? promptTextOrHash
      : this.hashPrompt(promptTextOrHash);

    const generation = this.getCurrentGeneration();
    const now = new Date().toISOString();
    const record: LedgerRequestRecord = {
      requestId,
      provider,
      generation,
      promptHash,
      state: 'PREPARED',
      createdAt: now,
      updatedAt: now,
    };

    const stmt = this.db.prepare(`
      INSERT INTO requests (request_id, provider, generation, prompt_hash, state, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(record.requestId, record.provider, record.generation, record.promptHash, record.state, record.createdAt, record.updatedAt);
    return record;
  }

  public updateRequestState(requestId: string, state: RequestState, failureClass?: string): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE requests SET state = ?, failure_class = ?, updated_at = ? WHERE request_id = ?
    `);
    stmt.run(state, failureClass ?? null, now, requestId);
  }

  public getRequest(requestId: string): LedgerRequestRecord | null {
    const stmt = this.db.prepare('SELECT * FROM requests WHERE request_id = ?');
    const row = stmt.get(requestId) as {
      request_id: string;
      provider: string;
      generation: number;
      prompt_hash: string;
      state: string;
      failure_class?: string | null;
      created_at: string;
      updated_at: string;
    } | undefined;

    if (!row) return null;
    return {
      requestId: row.request_id,
      provider: row.provider,
      generation: row.generation,
      promptHash: row.prompt_hash,
      state: row.state as RequestState,
      failureClass: row.failure_class,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  public registerToolExecution(toolCallId: string, requestId: string): LedgerToolRecord {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO tool_executions (tool_call_id, request_id, state, created_at)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(toolCallId, requestId, 'PREPARED', now);
    return { toolCallId, requestId, state: 'PREPARED', createdAt: now };
  }

  public updateToolState(toolCallId: string, state: ToolState): void {
    const stmt = this.db.prepare('UPDATE tool_executions SET state = ? WHERE tool_call_id = ?');
    stmt.run(state, toolCallId);
  }

  public getToolExecution(toolCallId: string): LedgerToolRecord | null {
    const stmt = this.db.prepare('SELECT * FROM tool_executions WHERE tool_call_id = ?');
    const row = stmt.get(toolCallId) as {
      tool_call_id: string;
      request_id: string;
      state: string;
      created_at: string;
    } | undefined;

    if (!row) return null;
    return {
      toolCallId: row.tool_call_id,
      requestId: row.request_id,
      state: row.state as ToolState,
      createdAt: row.created_at,
    };
  }

  public resolveStaleGenerationsOnRestart(): number {
    const currentGen = this.getCurrentGeneration();
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE requests
      SET state = 'FAILED', failure_class = 'restart_unobservable', updated_at = ?
      WHERE generation < ? AND state IN ('SUBMITTED', 'OBSERVING')
    `);
    const result = stmt.run(now, currentGen);
    return Number(result.changes ?? 0);
  }

  public close(): void {
    this.db.close();
  }
}

let defaultLedgerInstance: SqliteLedger | null = null;
export function getDefaultLedger(dbPath?: string): SqliteLedger {
  if (!defaultLedgerInstance) {
    defaultLedgerInstance = new SqliteLedger(dbPath);
  }
  return defaultLedgerInstance;
}
