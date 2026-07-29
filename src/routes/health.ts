/**
 * GET /health
 *
 * Liveness probe. No auth, no secrets. Returns 200 + JSON status.
 */

import type { FastifyInstance } from 'fastify';
import { RELAY_VERSION } from '../version.js';

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get('/health', async () => {
    return {
      status: 'ok',
      service: 'local-ai-relay',
      version: RELAY_VERSION,
      source_revision: process.env.RELAY_SOURCE_REVISION ?? null,
      timestamp: new Date().toISOString(),
    };
  });
}
