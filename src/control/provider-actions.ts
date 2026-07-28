import { clearPersistedCapability, loadPersistedCapability } from '../capabilities/evidence-store.js';
import { capabilityTracker } from '../capabilities/tracker.js';
import { findBrowserProvider, listBrowserProviders } from '../browser/driver-registry.js';
import { runLiveProbe, type LiveProbeStage } from '../cli/live-probe.js';
import { getModelsForProvider } from '../providers/registry.js';
import { controlEvents } from './events.js';

export type ProviderJobStatus = 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface ProviderJob {
  id: string;
  providerId: string;
  action: 'connect';
  status: ProviderJobStatus;
  stage: LiveProbeStage | 'cancelled' | 'failed';
  detail: string;
  startedAt: string;
  finishedAt?: string;
  eventId?: string;
  error?: string;
}

export interface ProviderCatalogEntry {
  id: string;
  name: string;
  label: string;
  url: string;
  authentication: 'required' | 'optional';
  transport: 'browser';
  models: string[];
}

type ProbeRunner = typeof runLiveProbe;

export class ProviderActionManager {
  private readonly jobs = new Map<string, ProviderJob>();
  private readonly controllers = new Map<string, AbortController>();

  constructor(private readonly probeRunner: ProbeRunner = runLiveProbe) {}

  catalog(): ProviderCatalogEntry[] {
    return listBrowserProviders().map((descriptor) => ({
      id: `browser-${descriptor.name}`,
      name: descriptor.name,
      label: descriptor.label,
      url: descriptor.url,
      authentication: descriptor.authentication,
      transport: 'browser',
      models: getModelsForProvider(`browser-${descriptor.name}`).map((model) => model.id),
    }));
  }

  listJobs(): ProviderJob[] {
    return [...this.jobs.values()]
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .map((job) => ({ ...job }));
  }

  startConnect(providerId: string): ProviderJob {
    const descriptor = findBrowserProvider(providerId.replace(/^browser-/, ''));
    const running = [...this.jobs.values()].find(
      (job) => job.providerId === providerId && job.status === 'running',
    );
    if (running) return { ...running };

    const job: ProviderJob = {
      id: crypto.randomUUID(),
      providerId,
      action: 'connect',
      status: 'running',
      stage: 'checking_environment',
      detail: 'Preparing the provider connection.',
      startedAt: new Date().toISOString(),
    };
    this.jobs.set(job.id, job);
    this.controllers.set(job.id, new AbortController());
    const started = controlEvents.record({
      scope: 'provider',
      code: 'provider_connection_started',
      message: `Opened the ${descriptor.label} connection and sign-in flow.`,
      providerId,
      detail: 'The official provider page uses the dedicated persistent relay browser profile.',
    });
    job.eventId = started.id;
    void this.run(job.id, descriptor.name);
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
}

export const providerActions = new ProviderActionManager();
