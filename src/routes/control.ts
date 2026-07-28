import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AppConfig } from '../config.js';
import { controlEvents } from '../control/events.js';
import { providerActions } from '../control/provider-actions.js';
import {
  routingManager,
  type RoutingConfig,
} from '../control/routing.js';
import { harnessManager } from '../harness/manager.js';
import { getBrowserBridgeStatus } from '../extension/bridge-status.js';
import {
  capabilityTracker,
  getAllCapabilityRecords,
} from '../providers/registry.js';
import { RELAY_VERSION } from '../version.js';
import { runDoctor } from '../control/doctor.js';

function badRequest(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return reply.code(400).send({
    error: {
      message,
      type: 'invalid_request_error',
      param: null,
      code: 'control_action_failed',
    },
  });
}

export function registerControlRoutes(app: FastifyInstance, config: AppConfig): void {
  const startedAt = new Date().toISOString();

  app.get('/v1/control/overview', async () => {
    const statuses = new Map(
      getAllCapabilityRecords().map((record) => [record.providerId, record]),
    );
    const jobs = providerActions.listJobs();
    const providers = providerActions.catalog().map((entry) => {
      const status = statuses.get(entry.id);
      const latestJob = jobs.find((job) => job.providerId === entry.id);
      const latestError = controlEvents
        .list({ providerId: entry.id, limit: 100 })
        .find((event) => event.level === 'error');
      return {
        ...entry,
        status: status?.status ?? 'installed',
        ready: capabilityTracker.isReady(entry.id),
        detail: status?.detail ?? 'Awaiting connection and verification.',
        evidence: status?.evidence ?? null,
        evidence_expired: capabilityTracker.isEvidenceExpired(entry.id),
        updated_at: status?.updatedAt ?? null,
        latest_job: latestJob ?? null,
        latest_event: latestError ?? null,
      };
    });
    return {
      relay: {
        status: 'running',
        api_status: 'healthy',
        version: RELAY_VERSION,
        host: config.host,
        port: config.port,
        started_at: startedAt,
        uptime_seconds: Math.floor(process.uptime()),
        authentication: 'required',
        ready_provider_count: providers.filter((provider) => provider.ready).length,
      },
      routing: routingManager.getConfig(),
      routing_metrics: routingManager.getMetrics(),
      browser_bridge: getBrowserBridgeStatus(),
      providers,
      harnesses: await harnessManager.list(),
      jobs,
    };
  });

  app.get<{
    Querystring: { provider_id?: string; harness_id?: string; limit?: string };
  }>('/v1/control/events', async (request) => ({
    object: 'list',
    data: controlEvents.list({
      ...(request.query.provider_id ? { providerId: request.query.provider_id } : {}),
      ...(request.query.harness_id ? { harnessId: request.query.harness_id } : {}),
      ...(request.query.limit ? { limit: Number(request.query.limit) || 100 } : {}),
    }),
  }));

  app.get('/v1/control/routing', async () => routingManager.getConfig());

  app.get('/v1/control/doctor', async () => runDoctor(config));

  app.put<{ Body: Partial<RoutingConfig> }>(
    '/v1/control/routing',
    async (request, reply) => {
      try {
        return await routingManager.update(request.body ?? {});
      } catch (error) {
        return badRequest(reply, error);
      }
    },
  );

  app.post<{
    Params: { providerId: string };
    Body: { action?: string };
  }>('/v1/control/providers/:providerId/actions', async (request, reply) => {
    try {
      const { providerId } = request.params;
      switch (request.body?.action) {
        case 'connect':
          return reply.code(202).send(providerActions.startConnect(providerId));
        case 'cancel':
          return providerActions.cancel(providerId);
        case 'disable':
          await providerActions.disable(providerId);
          return { ok: true };
        case 'enable':
          await providerActions.enable(providerId);
          return { ok: true };
        default:
          throw new Error('Provider action must be connect, cancel, enable, or disable.');
      }
    } catch (error) {
      return badRequest(reply, error);
    }
  });

  app.get('/v1/control/harnesses', async () => ({
    object: 'list',
    data: await harnessManager.list(),
  }));

  app.post<{
    Params: { harnessId: string };
    Body: { action?: string };
  }>('/v1/control/harnesses/:harnessId/actions', async (request, reply) => {
    try {
      const harnessId = harnessManager.parseHarnessId(request.params.harnessId);
      switch (request.body?.action) {
        case 'connect':
          return await harnessManager.connect(
            harnessId,
            `http://127.0.0.1:${config.port}/v1`,
          );
        case 'disconnect':
          return await harnessManager.disconnect(harnessId);
        case 'launch':
          return await harnessManager.launch(harnessId);
        default:
          throw new Error('Harness action must be connect, disconnect, or launch.');
      }
    } catch (error) {
      return badRequest(reply, error);
    }
  });

  app.post<{ Body: { confirm?: boolean } }>(
    '/v1/control/harnesses/disconnect-all',
    async (request, reply) => {
      if (request.body?.confirm !== true) {
        return badRequest(reply, new Error('Set confirm=true to disconnect all harnesses.'));
      }
      return {
        object: 'list',
        data: await harnessManager.disconnectAll(),
      };
    },
  );
}
