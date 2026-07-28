import { BrowserFailure, type BrowserFailureKind } from '../browser/types.js';
import {
  recordBrowserBridgeDisconnect,
  recordBrowserBridgeHeartbeat,
} from './bridge-status.js';

export interface BrowserAutomationConfig {
  name: string;
  label: string;
  url: string;
  composerSelectors: string[];
  sendButtonSelectors: string[];
  stopButtonSelectors: string[];
  assistantMessageSelectors: string[];
  loginUrlPattern: { source: string; flags: string };
  signInButtonLabels: string[];
  rateLimitPattern?: { source: string; flags: string };
  quotaPattern?: { source: string; flags: string };
  captchaTextPattern?: { source: string; flags: string };
}

export type BrowserBridgeCommand =
  | {
    id: string;
    action: 'open_provider' | 'wait_until_ready';
    provider: string;
    config: BrowserAutomationConfig;
    timeout_ms: number;
  }
  | {
    id: string;
    action: 'send_prompt';
    provider: string;
    config: BrowserAutomationConfig;
    timeout_ms: number;
    prompt: string;
    reset_session: boolean;
    session_id?: string;
  };

export type BrowserBridgeCommandInput =
  BrowserBridgeCommand extends infer Command
    ? Command extends BrowserBridgeCommand
      ? Omit<Command, 'id'>
      : never
    : never;

export interface BrowserBridgeResult {
  command_id: string;
  ok: boolean;
  ready?: boolean;
  text?: string;
  conversation_url?: string;
  error?: {
    kind: BrowserFailureKind;
    message: string;
  };
}

interface PendingCommand {
  command: BrowserBridgeCommand;
  sessionId: string;
  resolve: (result: BrowserBridgeResult) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  signal?: AbortSignal;
  abort?: () => void;
}

interface WaitingPoll {
  resolve: (command: BrowserBridgeCommand | null) => void;
  timeout: NodeJS.Timeout;
}

const ACTIVE_WINDOW_MS = 45_000;
const POLL_TIMEOUT_MS = 20_000;
const SESSION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;

export class BrowserExtensionBridge {
  private readonly sessions = new Map<string, number>();
  private readonly queue: Array<{ sessionId: string; command: BrowserBridgeCommand }> = [];
  private readonly pending = new Map<string, PendingCommand>();
  private readonly polls = new Map<string, WaitingPoll>();

  register(sessionId: string): void {
    if (!SESSION_ID_PATTERN.test(sessionId)) {
      throw new Error('Browser extension session_id is invalid.');
    }
    this.sessions.set(sessionId, Date.now());
    recordBrowserBridgeHeartbeat(sessionId);
  }

  isConnected(now = Date.now()): boolean {
    this.expireSessions(now);
    return this.sessions.size > 0;
  }

  activeSessionId(now = Date.now()): string | undefined {
    this.expireSessions(now);
    return [...this.sessions.entries()]
      .sort((a, b) => b[1] - a[1])[0]?.[0];
  }

  unregister(sessionId: string): void {
    if (!SESSION_ID_PATTERN.test(sessionId)) {
      throw new Error('Browser extension session_id is invalid.');
    }
    this.sessions.delete(sessionId);
    recordBrowserBridgeDisconnect(sessionId);
    const poll = this.polls.get(sessionId);
    if (poll) {
      clearTimeout(poll.timeout);
      this.polls.delete(sessionId);
      poll.resolve(null);
    }
    for (let index = this.queue.length - 1; index >= 0; index--) {
      if (this.queue[index]!.sessionId === sessionId) this.queue.splice(index, 1);
    }
    for (const pending of this.pending.values()) {
      if (pending.sessionId !== sessionId) continue;
      this.finishPending(pending);
      pending.reject(new BrowserFailure('cancelled', 'Existing-browser connection was removed.'));
    }
  }

  async poll(sessionId: string, timeoutMs = POLL_TIMEOUT_MS): Promise<BrowserBridgeCommand | null> {
    this.register(sessionId);
    const queuedIndex = this.queue.findIndex((item) => item.sessionId === sessionId);
    if (queuedIndex >= 0) return this.queue.splice(queuedIndex, 1)[0]!.command;

    const existing = this.polls.get(sessionId);
    if (existing) {
      clearTimeout(existing.timeout);
      existing.resolve(null);
    }
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.polls.delete(sessionId);
        resolve(null);
      }, Math.min(Math.max(timeoutMs, 0), POLL_TIMEOUT_MS));
      this.polls.set(sessionId, { resolve, timeout });
    });
  }

  complete(sessionId: string, result: BrowserBridgeResult): void {
    this.register(sessionId);
    const pending = this.pending.get(result.command_id);
    if (!pending || pending.sessionId !== sessionId) {
      throw new Error('Browser extension result does not match an active command.');
    }
    this.finishPending(pending);
    pending.resolve(result);
  }

  async dispatch(
    command: BrowserBridgeCommandInput,
    options: { signal?: AbortSignal } = {},
  ): Promise<BrowserBridgeResult> {
    if (options.signal?.aborted) {
      throw new BrowserFailure('cancelled', 'Existing-browser request was cancelled.');
    }
    const sessionId = this.activeSessionId();
    if (!sessionId) {
      throw new BrowserFailure(
        'layout_changed',
        'The existing-browser extension is not connected. Open the Control Center and choose “Use this Chrome”, or use the relay-browser fallback.',
      );
    }
    const fullCommand = { ...command, id: crypto.randomUUID() } as BrowserBridgeCommand;
    return new Promise<BrowserBridgeResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const pending = this.pending.get(fullCommand.id);
        if (!pending) return;
        this.finishPending(pending);
        reject(new BrowserFailure('timeout', `${fullCommand.provider} did not finish in the existing browser before timeout.`));
      }, fullCommand.timeout_ms + 5_000);
      const pending: PendingCommand = {
        command: fullCommand,
        sessionId,
        resolve,
        reject,
        timeout,
      };
      if (options.signal) {
        pending.signal = options.signal;
        pending.abort = () => {
          this.finishPending(pending);
          reject(new BrowserFailure('cancelled', 'Existing-browser request was cancelled.'));
        };
        options.signal.addEventListener('abort', pending.abort, { once: true });
      }
      this.pending.set(fullCommand.id, pending);
      const poll = this.polls.get(sessionId);
      if (poll) {
        clearTimeout(poll.timeout);
        this.polls.delete(sessionId);
        poll.resolve(fullCommand);
      } else {
        this.queue.push({ sessionId, command: fullCommand });
      }
    });
  }

  reset(): void {
    for (const sessionId of this.sessions.keys()) recordBrowserBridgeDisconnect(sessionId);
    for (const poll of this.polls.values()) {
      clearTimeout(poll.timeout);
      poll.resolve(null);
    }
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new BrowserFailure('cancelled', 'Existing-browser connection was removed.'));
    }
    this.sessions.clear();
    this.queue.length = 0;
    this.pending.clear();
    this.polls.clear();
  }

  private expireSessions(now: number): void {
    for (const [sessionId, lastSeen] of this.sessions) {
      if (now - lastSeen > ACTIVE_WINDOW_MS) this.sessions.delete(sessionId);
    }
  }

  private finishPending(pending: PendingCommand): void {
    clearTimeout(pending.timeout);
    if (pending.signal && pending.abort) pending.signal.removeEventListener('abort', pending.abort);
    this.pending.delete(pending.command.id);
    const queuedIndex = this.queue.findIndex(
      (item) => item.command.id === pending.command.id,
    );
    if (queuedIndex >= 0) this.queue.splice(queuedIndex, 1);
  }
}

export const browserExtensionBridge = new BrowserExtensionBridge();
