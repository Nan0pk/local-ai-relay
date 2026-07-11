/**
 * GET /v1/models
 *
 * Lists all models from all registered providers. OpenAI-shaped.
 */

import type { FastifyInstance } from 'fastify';
import { listAllModels } from '../providers/registry.js';
import type { ModelListResponse } from '../types/openai.js';

export function registerModelsRoutes(app: FastifyInstance): void {
  app.get('/v1/models', async () => {
    const body: ModelListResponse = {
      object: 'list',
      data: listAllModels(),
    };
    return body;
  });
}
