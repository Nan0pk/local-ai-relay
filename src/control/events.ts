import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { redactSensitive } from '../utils/redact.js';
import { controlStatePath } from './storage.js';

export type ControlEventLevel = 'info' | 'warning' | 'error';
export type ControlEventScope = 'relay' | 'provider' | 'routing' | 'harness' | 'browser';

export interface ControlEvent {
  id: string;
  timestamp: string;
  level: ControlEventLevel;
  scope: ControlEventScope;
  code: string;
  message: string;
  providerId?: string;
  harnessId?: string;
  detail?: string;
}

export interface ControlEventInput {
  level?: ControlEventLevel;
  scope: ControlEventScope;
  code: string;
  message: string;
  providerId?: string;
  harnessId?: string;
  detail?: string;
}

const MAX_MEMORY_EVENTS = 300;

export class ControlEventJournal {
  private readonly events: ControlEvent[] = [];

  constructor(
    private readonly path = controlStatePath(
      'diagnostics/control-events.jsonl',
      'RELAY_CONTROL_EVENT_LOG',
    ),
  ) {}

  record(input: ControlEventInput): ControlEvent {
    const event: ControlEvent = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      level: input.level ?? 'info',
      scope: input.scope,
      code: input.code,
      message: redactSensitive(input.message),
      ...(input.providerId ? { providerId: input.providerId } : {}),
      ...(input.harnessId ? { harnessId: input.harnessId } : {}),
      ...(input.detail ? { detail: redactSensitive(input.detail) } : {}),
    };
    this.events.unshift(event);
    if (this.events.length > MAX_MEMORY_EVENTS) this.events.length = MAX_MEMORY_EVENTS;
    void this.persist(event);
    return event;
  }

  list(filters: { providerId?: string; harnessId?: string; limit?: number } = {}): ControlEvent[] {
    const limit = Math.max(1, Math.min(filters.limit ?? 100, 300));
    return this.events
      .filter((event) => !filters.providerId || event.providerId === filters.providerId)
      .filter((event) => !filters.harnessId || event.harnessId === filters.harnessId)
      .slice(0, limit)
      .map((event) => ({ ...event }));
  }

  async hydrate(): Promise<void> {
    try {
      const source = await readFile(this.path, 'utf8');
      const recovered = source
        .trim()
        .split('\n')
        .filter(Boolean)
        .slice(-MAX_MEMORY_EVENTS)
        .map((line) => JSON.parse(line) as ControlEvent)
        .reverse();
      const existingIds = new Set(this.events.map((event) => event.id));
      const merged = [
        ...this.events,
        ...recovered.filter((event) => !existingIds.has(event.id)),
      ]
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, MAX_MEMORY_EVENTS);
      this.events.splice(0, this.events.length, ...merged);
    } catch {
      // A missing or malformed optional diagnostic journal starts empty.
    }
  }

  private async persist(event: ControlEvent): Promise<void> {
    try {
      const isPosix = process.platform !== 'win32';
      await mkdir(dirname(this.path), { recursive: true, ...(isPosix ? { mode: 0o700 } : {}) });
      await appendFile(
        this.path,
        `${JSON.stringify(event)}\n`,
        isPosix ? { mode: 0o600 } : {},
      );
    } catch {
      // Diagnostics must never make the relay unavailable.
    }
  }
}

export const controlEvents = new ControlEventJournal();
void controlEvents.hydrate();
