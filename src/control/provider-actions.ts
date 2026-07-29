import { clearPersistedCapability, loadPersistedCapability } from '../capabilities/evidence-store.js';
import { capabilityTracker } from '../capabilities/tracker.js';
import { findBrowserProvider, listBrowserProviders } from '../browser/driver-registry.js';
import { runLiveProbe, type LiveProbeStage } from '../cli/live-probe.js';
import { getModelsForProvider } from '../providers/registry.js';
import { controlEvents } from './events.js';
import { isExistingBrowserConnected } from '../browser/extension-driver.js';
import { BrowserFailure, type BrowserFailureKind } from '../browser/types.js';

export type ProviderJobStatus = 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface ProviderJob {
  id: string;
  providerId: string;
  action: 'connect';
  trigger: 'manual' | 'startup';
  status: ProviderJobStatus;
  stage: LiveProbeStage | 'cancelled' | 'failed';
  detail: string;
  startedAt: string;
  finishedAt?: string;
  eventId?: string;
  error?: string;
  failureKind?: BrowserFailureKind;
}

export interface ProviderDiscovery {
  status: 'idle' | 'running' | 'completed';
  attempted: number;
  total: number;
  succeeded: number;
  failed: number;
  startedAt?: string;
  finishedAt?: string;
  currentProviderId?: string;
}

export interface ProviderCatalogEntry {
  id: string;
  name: string;
  label: string;
  url: string;
  authentication: 'dynamic';
  anonymousCandidate: boolean;
  transport: 'browser';
  models: string[];
}

type ProbeRunner = typeof runLiveProbe;

export class ProviderActionManager {
  private readonly jobs = new Map<string, ProviderJob>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly jobPromises = new Map<string, Promise<void>>();
  private discovery: ProviderDiscovery = {
    status: 'idle',
    attempted: 0,
    total: 0,
    succeeded: 0,
    failed: 0,
  };

  constructor(private readonly probeRunner: ProbeRunner = runLiveProbe) {}

  catalog(): ProviderCatalogEntry[] {
    return listBrowserProviders().map((descriptor) => ({
      id: `browser-${descriptor.name}`,
      name: descriptor.name,
      label: descriptor.label,
      url: descriptor.url,
      authentication: descriptor.authentication,
      anonymousCandidate: descriptor.anonymousCandidate,
      transport: 'browser',
      models: getModelsForProvider(`browser-${descriptor.name}`).map((model) => model.id),
    }));
  }

  listJobs(): ProviderJob[] {
    return [...this.jobs.values()]
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .map((job) => ({ ...job }));
  }

  discoveryStatus(): ProviderDiscovery {
    return { ...this.discovery };
  }

  startDiscovery(force = false): ProviderDiscovery {
    if (this.discovery.status === 'running') return this.discoveryStatus();
    if (this.discovery.status === 'completed' && !force) return this.discoveryStatus();
    const catalog = this.catalog();
    const statuses = new Map(
      capabilityTracker.getAllStatuses().map((record) => [record.providerId, record]),
    );
    const candidates = catalog.filter((provider) =>
      provider.anonymousCandidate
      && statuses.get(provider.id)?.status !== 'disabled'
      && !capabilityTracker.isReady(provider.id));
    this.discovery = {
      status: candidates.length ? 'running' : 'completed',
      attempted: 0,
      total: candidates.length,
      succeeded: 0,
      failed: 0,
      startedAt: new Date().toISOString(),
      ...(candidates.length ? {} : { finishedAt: new Date().toISOString() }),
    };
    if (candidates.length) void this.runDiscovery(candidates.map((item) => item.id));
    return this.discoveryStatus();
  }

  startConnect(
    providerId: string,
    options: { trigger?: 'manual' | 'startup' } = {},
  ): ProviderJob {
    const descriptor = findBrowserProvider(providerId.replace(/^browser-/, ''));
    const trigger = options.trigger ?? 'manual';
    const running = [...this.jobs.values()].find(
      (job) => job.providerId === providerId && job.status === 'running',
    );
    if (running) return { ...running };

    const job: ProviderJob = {
      id: crypto.randomUUID(),
      providerId,
      action: 'connect',
      trigger,
      status: 'running',
      stage: 'checking_environment',
      detail: trigger === 'startup'
        ? 'Queued for automatic anonymous-access verification.'
        : 'Preparing the provider connection.',
      startedAt: new Date().toISOString(),
    };
    this.jobs.set(job.id, job);
    this.controllers.set(job.id, new AbortController());
    const existingBrowserConnected = isExistingBrowserConnected();
    const started = controlEvents.record({
      scope: 'provider',
      code: 'provider_connection_started',
      message: trigger === 'startup'
        ? `Checking ${descriptor.label} for login-free access.`
        : `Opened the ${descriptor.label} connection and sign-in flow.`,
      providerId,
      detail: trigger === 'startup'
        ? 'Automatic discovery runs quietly and never starts SSO or account sign-in.'
        : existingBrowserConnected
        ? 'The official provider page uses a relay-owned tab in the paired Chrome profile.'
        : 'The official provider page uses the shared persistent relay-browser fallback.',
    });
    job.eventId = started.id;
    const promise = this.run(job.id, descriptor.name)
      .finally(() => this.jobPromises.delete(job.id));
    this.jobPromises.set(job.id, promise);
    return { ...job };
  }

  cancel(providerId: string): ProviderJob {
    findBrowserProvider(providerId.replace(/^browser-/, ''));
    const job = [...this.jobs.values()].find(
      (candidate) => candidate.providerId === providerId && candidate.status === 'running',
    );
    if (!job) throw new Error(`No active ${providerId} connection is running.`);
    this.controllers.get(job.id)?.abort();
    job.status = 'cancelled';
    job.stage = 'cancelled';
    job.detail = 'Connection cancelled by the operator.';
    job.finishedAt = new Date().toISOString();
    controlEvents.record({
      scope: 'provider',
      level: 'warning',
      code: 'provider_connection_cancelled',
      message: `${providerId} connection was cancelled.`,
      providerId,
    });
    return { ...job };
  }

  async disable(providerId: string): Promise<void> {
    findBrowserProvider(providerId.replace(/^browser-/, ''));
    capabilityTracker.setStatus(providerId, 'disabled', undefined, 'Disabled by the operator.');
    await clearPersistedCapability(providerId);
    controlEvents.record({
      scope: 'provider',
      code: 'provider_disabled',
      message: `${providerId} was removed from the ready routing pool.`,
      providerId,
    });
  }

  async enable(providerId: string): Promise<void> {
    findBrowserProvider(providerId.replace(/^browser-/, ''));
    const persisted = loadPersistedCapability(providerId);
    if (persisted) {
      capabilityTracker.setStatus(
        providerId,
        persisted.status,
        persisted.evidence ?? undefined,
        persisted.detail ?? undefined,
      );
    } else {
      capabilityTracker.setStatus(
        providerId,
        'installed',
        undefined,
        'Enabled; awaiting sign-in and live verification.',
      );
    }
    controlEvents.record({
      scope: 'provider',
      code: 'provider_enabled',
      message: `${providerId} was enabled.`,
      providerId,
    });
  }

  private async run(jobId: string, providerName: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;
    try {
      const controller = this.controllers.get(jobId);
      const result = await this.probeRunner(providerName, {
        signal: controller?.signal,
        automatic: job.trigger === 'startup',
        ...(job.trigger === 'startup'
          ? { readinessTimeoutMs: 12_000, verificationTimeoutMs: 45_000 }
          : {}),
        onStage: (stage, detail) => {
          if (job.status !== 'running') return;
          job.stage = stage;
          job.detail = detail;
        },
      });
      if (job.status === 'cancelled') return;
      const persisted = loadPersistedCapability(result.providerId);
      if (persisted) {
        capabilityTracker.setStatus(
          result.providerId,
          persisted.status,
          persisted.evidence ?? undefined,
          persisted.detail ?? undefined,
        );
      }
      job.status = 'succeeded';
      job.stage = 'ready';
      job.detail = 'Connected and verified for real requests.';
      job.finishedAt = new Date().toISOString();
      const event = controlEvents.record({
        scope: 'provider',
        code: 'provider_connection_verified',
        message: `${result.providerId} completed a live verification and is ready.`,
        providerId: result.providerId,
        ...(result.conversationUrl ? { detail: `Verification conversation: ${result.conversationUrl}` } : {}),
      });
      job.eventId = event.id;
    } catch (error) {
      if (job.status === 'cancelled') return;
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof BrowserFailure) job.failureKind = error.kind;
      job.status = 'failed';
      job.stage = 'failed';
      job.detail = message;
      job.finishedAt = new Date().toISOString();
      job.error = message;
      const event = controlEvents.record({
        scope: 'provider',
        level: 'error',
        code: 'provider_connection_failed',
        message: `${job.providerId} could not be verified.`,
        providerId: job.providerId,
        detail: message,
      });
      job.eventId = event.id;
    } finally {
      this.controllers.delete(jobId);
    }
  }

  private async runDiscovery(providerIds: string[]): Promise<void> {
    controlEvents.record({
      scope: 'provider',
      code: 'provider_discovery_started',
      message: `Checking ${providerIds.length} likely login-free provider${providerIds.length === 1 ? '' : 's'} in the background.`,
      detail: 'Providers are checked one at a time. Sign-in flows are not started automatically.',
    });
    for (const providerId of providerIds) {
      this.discovery.currentProviderId = providerId;
      const job = this.startConnect(providerId, { trigger: 'startup' });
      await this.jobPromises.get(job.id);
      const finished = this.jobs.get(job.id);
      this.discovery.attempted += 1;
      if (finished?.status === 'succeeded') this.discovery.succeeded += 1;
      else this.discovery.failed += 1;
    }
    const finishedDiscovery: ProviderDiscovery = {
      ...this.discovery,
      status: 'completed',
      finishedAt: new Date().toISOString(),
    };
    delete finishedDiscovery.currentProviderId;
    this.discovery = finishedDiscovery;
    controlEvents.record({
      scope: 'provider',
      code: 'provider_discovery_completed',
      message: `Automatic provider check completed: ${this.discovery.succeeded} ready, ${this.discovery.failed} unavailable or needing attention.`,
    });
  }
}

export const providerActions = new ProviderActionManager();
