/**
 * Fastify server factory.
 *
 * Wires routes, logging, and graceful shutdown. Kept separate from the
 * process entry point so tests can construct an app instance without
 * binding to a port.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { loadConfig, type AppConfig } from './config.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerModelsRoutes } from './routes/models.js';
import { registerChatRoutes } from './routes/chat.js';

export function buildApp(config: AppConfig = loadConfig()): FastifyInstance {
  const app = Fastify({
    logger: { level: config.logLevel },
  });

  registerHealthRoutes(app);
  registerModelsRoutes(app);
  registerChatRoutes(app, config);

  return app;
}
