/**
 * GET /v1/models
 *
 * OpenAI-compatible model listing. By default, only advertises models
 * from providers that are currently ready (verified usable). The
 * `include=all` query parameter returns the full inventory with
 * diagnostic capability metadata for operators.
 *
 * GET /v1/providers/status
 *
 * Diagnostic endpoint exposing the full capability state of every
 * registered provider. Not OpenAI-shaped; intended for operator dashboards.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  listReadyModels,
  getAllCapabilityRecords,
  getModelsForProvider,
  capabilityTracker,
} from '../providers/registry.js';
import type { ModelListResponse, ModelCard } from '../types/openai.js';

interface ModelsQuerystring {
  include?: string;
}

/**
 * Enrich a ModelCard with capability metadata when the caller requests
 * the full diagnostic view. OpenAI clients safely ignore extra fields.
 */
function enrichWithCapability(
  card: ModelCard,
  providerId: string,
): ModelCard {
  const record = capabilityTracker.getStatus(providerId);
  if (!record) return card;
  return {
    ...card,
    x_relay: {
      ...(card.x_relay ?? {
        transport: 'browser' as const,
        execution_style: 'batch' as const,
        supports_sessions: true,
        supports_streaming: false,
        max_parallel_requests: 1,
      }),
      capability_status: record.status,
      capability_detail: record.detail ?? undefined,
      capability_evidence: record.evidence?.reference ?? undefined,
      capability_updated_at: record.updatedAt,
    },
  };
}

export function registerModelsRoutes(app: FastifyInstance): void {
  // GET /v1/models — gated on readiness by default
  app.get<{ Querystring: ModelsQuerystring }>(
    '/v1/models',
    async (request: FastifyRequest<{ Querystring: ModelsQuerystring }>) => {
      if (request.query.include === 'all') {
        // Full diagnostic view: every registered model with capability metadata.
        const records = getAllCapabilityRecords();
        const allCards: ModelCard[] = [];
        for (const record of records) {
          const models = getModelsForProvider(record.providerId);
          for (const card of models) {
            allCards.push(enrichWithCapability(card, record.providerId));
          }
        }
        const body: ModelListResponse = {
          object: 'list',
          data: allCards,
        };
        return body;
      }

      // Default: only ready models.
      const body: ModelListResponse = {
        object: 'list',
        data: listReadyModels(),
      };
      return body;
    },
  );

  // GET /v1/providers/status — diagnostic endpoint
  app.get('/v1/providers/status', async () => {
    const statuses = capabilityTracker.getAllStatuses();
    return {
      object: 'list',
      data: statuses.map((record) => ({
        provider_id: record.providerId,
        status: record.status,
        ready: capabilityTracker.isReady(record.providerId),
        evidence: record.evidence,
        evidence_expired: capabilityTracker.isEvidenceExpired(record.providerId),
        detail: record.detail,
        updated_at: record.updatedAt,
      })),
    };
  });
}
