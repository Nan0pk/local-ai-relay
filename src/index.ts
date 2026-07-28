/**
 * Process entry point. Builds the Fastify app, binds to the configured
 * host/port, and wires graceful shutdown on SIGINT/SIGTERM.
 */

import { loadConfig } from './config.js';
import { selectPort } from './startup/port-selection.js';
import { getOrGenerateToken, getTokenPath } from './auth/token.js';
import { clearActivePort, recordActivePort } from './startup/relay-location.js';

async function main(): Promise<void> {
  const requestedConfig = loadConfig();
  const { buildApp } = await import('./server.js');
  const portSelection = await selectPort(requestedConfig.host, requestedConfig.port);
  if (portSelection.existingRelay) {
    console.log(
      `local-ai-relay is already running at http://127.0.0.1:${portSelection.port}`,
    );
    return;
  }
  const config = { ...requestedConfig, port: portSelection.port };
  const app = buildApp(config);
  await getOrGenerateToken();

  if (config.port !== requestedConfig.port) {
    app.log.warn(
      { requestedPort: requestedConfig.port, selectedPort: config.port },
      `port ${requestedConfig.port} is occupied; using http://${config.host}:${config.port}`,
    );
  }

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    try {
      await clearActivePort(config.port);
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
    await recordActivePort(config.port).catch((error: unknown) => {
      app.log.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'could not persist active relay port; explicit PORT clients remain available',
      );
    });
    app.log.info(
      { host: config.host, port: config.port },
      'local-ai-relay listening',
    );
    app.log.info(
      { tokenSource: process.env.RELAY_API_TOKEN ? 'RELAY_API_TOKEN' : getTokenPath() },
      'relay bearer token ready',
    );
    if (config.autoConfigureHarnesses) {
      void import('./cli/configure-harnesses.js')
        .then(({ runHarnessConfiguration }) => runHarnessConfiguration(config.port, true))
        .catch((err) => {
          app.log.warn(
            { err: err instanceof Error ? err.message : String(err) },
            'harness auto-configuration failed',
          );
        });
    }
  } catch (err) {
    app.log.error({ err }, 'failed to start');
    process.exit(1);
  }
}

void main().catch((error: unknown) => {
  console.error(`local-ai-relay failed to start: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
