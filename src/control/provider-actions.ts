import { clearPersistedCapability, loadPersistedCapability } from '../capabilities/evidence-store.js';
import { capabilityTracker } from '../capabilities/tracker.js';
import { findBrowserProvider, listBrowserProviders } from '../browser/driver-registry.js';
import { runLiveProbe } from '../cli/live-probe.js';
import { getModelsForProvider } from '../providers/registry.js';
import { controlEvents } from './events.js';

export type ProviderJobStatus = 'running' | 'succeeded' | 'failed';

export interface ProviderJob {
  id: string;
  providerId: string;
  action: 'connect';
  status: ProviderJobStatus;
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
      startedAt: new Date().toISOString(),
    };
    this.jobs.set(job.id, job);
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
      const result = await this.probeRunner(providerName);
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
      const message = error instanceof Error ? error.message : String(error);
      job.status = 'failed';
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
    }
  }
}

export const providerActions = new ProviderActionManager();
