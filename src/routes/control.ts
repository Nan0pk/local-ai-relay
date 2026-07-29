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
  browserExtensionBridge,
  type BrowserBridgeResult,
} from '../extension/browser-bridge.js';
import { harnessTokens } from '../auth/harness-tokens.js';
import {
  capabilityTracker,
  getAllCapabilityRecords,
} from '../providers/registry.js';
import { RELAY_VERSION } from '../version.js';
import { runDoctor } from '../control/doctor.js';
import type { BrowserFailureKind } from '../browser/types.js';

const BROWSER_FAILURE_KINDS = new Set<BrowserFailureKind>([
  'login_required',
  'captcha',
  'rate_limit',
  'quota_exhausted',
  'composer_disabled',
  'generation_interrupted',
  'layout_changed',
  'timeout',
  'cancelled',
  'empty_response',
  'invalid_tool_call',
]);

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

function currentBrowserBridgeStatus() {
  const persisted = getBrowserBridgeStatus();
  const connected = browserExtensionBridge.isConnected();
  return {
    ...persisted,
    connected,
    mode: connected ? 'existing_browser' as const : 'relay_browser' as const,
    detail: connected
      ? 'Using relay-owned provider tabs in this signed-in Chrome profile.'
      : persisted.installed
        ? 'The Chrome extension was paired before but is offline; connections use the shared relay-browser fallback.'
        : 'Chrome extension not paired; connections use the shared relay-browser fallback.',
  };
}

export function registerControlRoutes(app: FastifyInstance, config: AppConfig): void {
  const startedAt = new Date().toISOString();

  app.get('/v1/control/overview', async () => {
    // Replacement startup may select a successor port while an older relay is
    // still shutting down. Repair relay-owned harness URLs before reporting
    // status so the dashboard and harnesses converge automatically.
    await harnessManager.repairOwnedConfigurations({ activePort: config.port });
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
      browser_bridge: currentBrowserBridgeStatus(),
      providers,
      provider_discovery: providerActions.discoveryStatus(),
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

  app.post('/v1/control/browser-pair', async () => {
    const issued = await harnessTokens.issue('browser-extension', { replaceExisting: false });
    return {
      token_id: issued.id,
      token: issued.token,
      relay_origin: `http://127.0.0.1:${config.port}`,
      activates_after_confirmation: true,
    };
  });

  app.post<{
    Body: { token_id?: string };
  }>('/v1/control/browser-pair-complete', async (request, reply) => {
    try {
      const tokenId = request.body?.token_id?.trim();
      if (!tokenId) throw new Error('token_id is required.');
      await harnessTokens.retainHarnessToken('browser-extension', tokenId);
      return { ok: true };
    } catch (error) {
      return badRequest(reply, error);
    }
  });

  app.post<{
    Body: { token_id?: string };
  }>('/v1/control/browser-pair-cancel', async (request, reply) => {
    const tokenId = request.body?.token_id?.trim();
    if (!tokenId) return badRequest(reply, new Error('token_id is required.'));
    await harnessTokens.revokeToken(tokenId);
    return { ok: true };
  });

  app.post('/v1/control/browser-disconnect', async () => {
    browserExtensionBridge.reset();
    await harnessTokens.revokeHarness('browser-extension');
    return { ok: true };
  });

  app.post<{
    Body: { session_id?: string };
  }>('/v1/control/browser-extension/register', async (request, reply) => {
    try {
      const sessionId = request.body?.session_id?.trim();
      if (!sessionId) throw new Error('session_id is required.');
      browserExtensionBridge.register(sessionId);
      return { ok: true, poll_timeout_ms: 20_000 };
    } catch (error) {
      return badRequest(reply, error);
    }
  });

  app.post<{
    Body: { session_id?: string };
  }>('/v1/control/browser-extension/poll', async (request, reply) => {
    try {
      const sessionId = request.body?.session_id?.trim();
      if (!sessionId) throw new Error('session_id is required.');
      const command = await browserExtensionBridge.poll(sessionId);
      return { command };
    } catch (error) {
      return badRequest(reply, error);
    }
  });

  app.post<{
    Body: { session_id?: string; result?: BrowserBridgeResult };
  }>('/v1/control/browser-extension/result', async (request, reply) => {
    try {
      const sessionId = request.body?.session_id?.trim();
      const result = request.body?.result;
      if (
        !sessionId
        || !result
        || typeof result.command_id !== 'string'
        || typeof result.ok !== 'boolean'
        || (result.ready !== undefined && typeof result.ready !== 'boolean')
        || (result.text !== undefined && (
          typeof result.text !== 'string'
          || result.text.length > 2_000_000
        ))
        || (result.conversation_url !== undefined && (
          typeof result.conversation_url !== 'string'
          || result.conversation_url.length > 5_000
        ))
        || (result.error !== undefined && (
          !BROWSER_FAILURE_KINDS.has(result.error.kind)
          || typeof result.error.message !== 'string'
          || result.error.message.length > 10_000
        ))
      ) {
        throw new Error('session_id and a valid result are required.');
      }
      browserExtensionBridge.complete(sessionId, result);
      return { ok: true };
    } catch (error) {
      return badRequest(reply, error);
    }
  });

  app.post<{
    Body: { session_id?: string };
  }>('/v1/control/browser-extension/disconnect', async (request, reply) => {
    try {
      const sessionId = request.body?.session_id?.trim();
      const token = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
      const resolved = token ? harnessTokens.resolve(token) : undefined;
      if (!sessionId || resolved?.harnessId !== 'browser-extension') {
        throw new Error('A valid browser-extension session is required.');
      }
      browserExtensionBridge.unregister(sessionId);
      await harnessTokens.revokeToken(resolved.id);
      return { ok: true };
    } catch (error) {
      return badRequest(reply, error);
    }
  });

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
    Body: { force?: boolean };
  }>('/v1/control/providers/discover', async (request) =>
    providerActions.startDiscovery(request.body?.force === true));

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
            { verifyCompletion: true },
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
