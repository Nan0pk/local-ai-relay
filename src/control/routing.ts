import type { ModelCard } from '../types/openai.js';
import {
  findProviderForModel,
  getAllCapabilityRecords,
  listAllModels,
} from '../providers/registry.js';
import { controlEvents } from './events.js';
import { controlStatePath, readJsonFile, writeJsonAtomic } from './storage.js';

export type RoutingMode = 'manual' | 'automatic' | 'priority';
export type RoutingPreset = 'reliable' | 'fast' | 'custom';

export interface RoutingConfig {
  version: 1;
  enabled: boolean;
  mode: RoutingMode;
  preset: RoutingPreset;
  selectedProviders: string[];
  priorityProviders: string[];
  manualModel: string;
  allowFallbacks: boolean;
  updatedAt: string;
}

export interface RoutingSelection {
  requestedModel: string;
  selectedModel: string;
  providerId: string;
  isFallback: boolean;
  reason: string;
}

export interface ProviderRoutingMetric {
  providerId: string;
  attempts: number;
  successes: number;
  failures: number;
  averageLatencyMs: number;
  lastAttemptAt: string;
}

const ROUTING_ALIASES = new Set(['auto', 'relay-auto', 'fast', 'smart', 'relay-manual']);

export function isRoutingAlias(model: string): boolean {
  return ROUTING_ALIASES.has(model);
}

function defaultRoutingConfig(): RoutingConfig {
  return {
    version: 1,
    enabled: true,
    mode: 'automatic',
    preset: 'reliable',
    selectedProviders: [],
    priorityProviders: [],
    manualModel: 'browser-chatgpt-free',
    allowFallbacks: true,
    updatedAt: new Date().toISOString(),
  };
}

function isRoutingMode(value: unknown): value is RoutingMode {
  return value === 'manual' || value === 'automatic' || value === 'priority';
}

function isRoutingPreset(value: unknown): value is RoutingPreset {
  return ['reliable', 'fast', 'custom'].includes(String(value));
}

function normalizeConfig(value: unknown): RoutingConfig {
  const fallback = defaultRoutingConfig();
  if (!value || typeof value !== 'object') return fallback;
  const input = value as Partial<RoutingConfig>;
  const manualModel = typeof input.manualModel === 'string' && input.manualModel.trim()
    ? input.manualModel.trim()
    : fallback.manualModel;
  return {
    version: 1,
    enabled: input.enabled !== false,
    mode: isRoutingMode(input.mode) ? input.mode : fallback.mode,
    preset: isRoutingPreset(input.preset) ? input.preset : fallback.preset,
    selectedProviders: Array.isArray(input.selectedProviders)
      ? [...new Set(input.selectedProviders.filter((item): item is string => typeof item === 'string' && item.length > 0))]
      : [],
    priorityProviders: Array.isArray(input.priorityProviders)
      ? [...new Set(input.priorityProviders.filter((item): item is string => typeof item === 'string' && item.length > 0))]
      : [],
    manualModel,
    allowFallbacks: input.allowFallbacks !== false,
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : fallback.updatedAt,
  };
}

function providerForModel(card: ModelCard): string {
  return findProviderForModel(card.id)?.id ?? card.owned_by;
}

export class RoutingManager {
  private config: RoutingConfig;
  private readonly metrics = new Map<string, ProviderRoutingMetric>();

  constructor(
    private readonly path = controlStatePath('routing.json', 'RELAY_ROUTING_STORE'),
  ) {
    this.config = normalizeConfig(readJsonFile<unknown>(this.path, defaultRoutingConfig()));
  }

  getConfig(): RoutingConfig {
    return structuredClone(this.config);
  }

  getMetrics(): ProviderRoutingMetric[] {
    return [...this.metrics.values()].map((metric) => ({ ...metric }));
  }

  recordAttempt(providerId: string, latencyMs: number, succeeded: boolean): void {
    const current = this.metrics.get(providerId);
    const boundedLatency = Math.max(0, Math.round(latencyMs));
    const next: ProviderRoutingMetric = current
      ? {
          ...current,
          attempts: current.attempts + 1,
          successes: current.successes + (succeeded ? 1 : 0),
          failures: current.failures + (succeeded ? 0 : 1),
          averageLatencyMs: Math.round((current.averageLatencyMs * 0.7) + (boundedLatency * 0.3)),
          lastAttemptAt: new Date().toISOString(),
        }
      : {
          providerId,
          attempts: 1,
          successes: succeeded ? 1 : 0,
          failures: succeeded ? 0 : 1,
          averageLatencyMs: boundedLatency,
          lastAttemptAt: new Date().toISOString(),
        };
    this.metrics.set(providerId, next);
  }

  async update(patch: Partial<RoutingConfig>): Promise<RoutingConfig> {
    const next = normalizeConfig({
      ...this.config,
      ...patch,
      version: 1,
      updatedAt: new Date().toISOString(),
    });
    const knownProviders = new Set(getAllCapabilityRecords().map((record) => record.providerId));
    for (const providerId of [...next.selectedProviders, ...next.priorityProviders]) {
      if (!knownProviders.has(providerId)) {
        throw new Error(`Unknown provider '${providerId}'.`);
      }
    }
    if (!listAllModels().some((model) => model.id === next.manualModel)) {
      throw new Error(`Unknown manual model '${next.manualModel}'.`);
    }
    await writeJsonAtomic(this.path, next);
    this.config = next;
    controlEvents.record({
      scope: 'routing',
      code: 'routing_configuration_updated',
      message: `Routing changed to ${next.enabled ? next.mode : 'disabled'} mode.`,
      detail: `Preset ${next.preset}; fallbacks ${next.allowFallbacks ? 'enabled' : 'disabled'}.`,
    });
    return this.getConfig();
  }

  resolve(requestedModel: string): RoutingSelection | undefined {
    if (!this.config.enabled || !ROUTING_ALIASES.has(requestedModel)) return undefined;
    const allModels = listAllModels();
    const readiness = new Map(
      getAllCapabilityRecords().map((record) => [record.providerId, record.status]),
    );
    const selected = new Set(this.config.selectedProviders);
    const candidates = allModels.filter((model) => {
      const providerId = providerForModel(model);
      const status = readiness.get(providerId);
      return (selected.size === 0 || selected.has(providerId))
        && (status === 'ready' || status === 'degraded');
    });
    if (candidates.length === 0) return undefined;

    if (this.config.mode === 'manual' || requestedModel === 'relay-manual') {
      const manual = candidates.find((model) => model.id === this.config.manualModel);
      if (manual) {
        return this.selection(requestedModel, manual, false, 'Selected by the manual routing policy.');
      }
      if (!this.config.allowFallbacks) return undefined;
      return this.selection(
        requestedModel,
        candidates[0]!,
        true,
        `Manual model ${this.config.manualModel} is unavailable; used the first permitted ready provider.`,
      );
    }

    if (this.config.mode === 'priority' && this.config.priorityProviders.length > 0) {
      for (const providerId of this.config.priorityProviders) {
        const match = candidates.find((model) => providerForModel(model) === providerId);
        if (match) {
          return this.selection(
            requestedModel,
            match,
            providerId !== this.config.priorityProviders[0],
            `Selected the first ready provider in the configured priority order: ${providerId}.`,
          );
        }
      }
      if (!this.config.allowFallbacks) return undefined;
    }

    const ranked = [...candidates].sort((a, b) => {
      const aProvider = providerForModel(a);
      const bProvider = providerForModel(b);
      const preference = (providerId: string) => {
        const index = this.config.priorityProviders.indexOf(providerId);
        return index < 0 ? 20 : index;
      };
      const score = (providerId: string) => {
        const metric = this.metrics.get(providerId);
        const failureRate = metric?.attempts ? metric.failures / metric.attempts : 0.1;
        const latency = metric?.averageLatencyMs ?? 5_000;
        const degraded = readiness.get(providerId) === 'degraded' ? 2_000 : 0;
        const configuredPreference = preference(providerId) * 10;
        switch (this.config.preset) {
          case 'fast':
            return latency + (failureRate * 3_000) + degraded + configuredPreference;
          case 'custom':
            return configuredPreference + (failureRate * 4_000) + degraded + (latency / 10);
          case 'reliable':
          default:
            return (failureRate * 10_000) + degraded + (latency / 20)
              + configuredPreference;
        }
      };
      return score(aProvider) - score(bProvider);
    });
    return this.selection(
      requestedModel,
      ranked[0]!,
      false,
      `Selected a ready provider using the ${this.config.preset} automatic policy.`,
    );
  }

  fallbacks(primary: RoutingSelection): RoutingSelection[] {
    if (!this.config.enabled || !this.config.allowFallbacks) return [];
    const readiness = new Map(
      getAllCapabilityRecords().map((record) => [record.providerId, record.status]),
    );
    const selected = new Set(this.config.selectedProviders);
    const seenProviders = new Set([primary.providerId]);
    return listAllModels()
      .filter((model) => {
        const providerId = providerForModel(model);
        const status = readiness.get(providerId);
        if (
          seenProviders.has(providerId)
          || (selected.size > 0 && !selected.has(providerId))
          || (status !== 'ready' && status !== 'degraded')
        ) {
          return false;
        }
        seenProviders.add(providerId);
        return true;
      })
      .sort((a, b) => {
        const priority = (providerId: string) => {
          const index = this.config.priorityProviders.indexOf(providerId);
          return index < 0 ? 100 : index;
        };
        return priority(providerForModel(a)) - priority(providerForModel(b));
      })
      .map((model) => ({
        requestedModel: primary.requestedModel,
        selectedModel: model.id,
        providerId: providerForModel(model),
        isFallback: true,
        reason: `The previous provider failed; continued with ready provider ${providerForModel(model)}.`,
      }));
  }

  recordFailover(
    failed: RoutingSelection,
    next: RoutingSelection,
    error: unknown,
  ): void {
    controlEvents.record({
      scope: 'routing',
      level: 'warning',
      code: 'routing_fallback',
      message: `${failed.selectedModel} failed; routed the request to ${next.selectedModel}.`,
      providerId: next.providerId,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  private selection(
    requestedModel: string,
    model: ModelCard,
    isFallback: boolean,
    reason: string,
  ): RoutingSelection {
    const selection = {
      requestedModel,
      selectedModel: model.id,
      providerId: providerForModel(model),
      isFallback,
      reason,
    };
    controlEvents.record({
      scope: 'routing',
      code: isFallback ? 'routing_fallback' : 'routing_selection',
      message: `${requestedModel} routed to ${model.id}.`,
      providerId: selection.providerId,
      detail: reason,
    });
    return selection;
  }
}

export const routingManager = new RoutingManager();
