/**
 * GET /health
 *
 * Liveness probe. No auth, no secrets. Returns 200 + JSON status.
 */

import type { FastifyInstance } from 'fastify';

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get('/health', async () => {
    return {
      status: 'ok',
      service: 'local-ai-relay',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    };
  });
}
