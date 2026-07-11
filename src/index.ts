/**
 * Process entry point. Builds the Fastify app, binds to the configured
 * host/port, and wires graceful shutdown on SIGINT/SIGTERM.
 */

import { buildApp } from './server.js';
import { loadConfig } from './config.js';
import { selectPort } from './startup/port-selection.js';

async function main(): Promise<void> {
  const requestedConfig = loadConfig();
  const portSelection = await selectPort(requestedConfig.host, requestedConfig.port);
  if (portSelection.existingRelay) {
    console.log(
      `local-ai-relay is already running at http://127.0.0.1:${portSelection.port}`,
    );
    return;
  }
  const config = { ...requestedConfig, port: portSelection.port };
  const app = buildApp(config);

  if (config.port !== requestedConfig.port) {
    app.log.warn(
      { requestedPort: requestedConfig.port, selectedPort: config.port },
      `port ${requestedConfig.port} is occupied; using http://${config.host}:${config.port}`,
    );
  }

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ host: config.host, port: config.port });
    app.log.info(
      { host: config.host, port: config.port },
      'local-ai-relay listening',
    );
  } catch (err) {
    app.log.error({ err }, 'failed to start');
    process.exit(1);
  }
}

void main();
