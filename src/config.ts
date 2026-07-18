/**
 * Runtime configuration for local-ai-relay.
 *
 * All values come from environment variables with safe defaults.
 * No secrets are read here — provider credentials will live in a
 * separate `providers` registry once non-mock providers land.
 */

export interface AppConfig {
  /** Host the Fastify server binds to. */
  host: string;
  /** Port the Fastify server listens on. */
  port: number;
  /** Log level passed to pino. */
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  /** Default model returned when a request omits the `model` field. */
  defaultModel: string;
}

function parseLogLevel(raw: string | undefined): AppConfig['logLevel'] {
  const allowed: AppConfig['logLevel'][] = [
    'fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'
  ];
  const v = (raw ?? 'info').toLowerCase() as AppConfig['logLevel'];
  return allowed.includes(v) ? v : 'info';
}

export function isLoopback(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1' || normalized === '[::1]';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const host = env.HOST ?? '127.0.0.1';
  if (!isLoopback(host)) {
    if (env.RELAY_UNSAFE_BIND_ACK !== '1') {
      throw new Error(
        `Refusing non-loopback bind to '${host}' without acknowledgement. To bypass, set RELAY_UNSAFE_BIND_ACK=1.`
      );
    }
    if (!env.RELAY_API_TOKEN) {
      throw new Error(
        `Refusing non-loopback bind to '${host}' without explicit authentication. Set RELAY_API_TOKEN in the environment.`
      );
    }
  }
  const port = Number.parseInt(env.PORT ?? '8787', 10);
  return {
    host,
    port: Number.isFinite(port) ? port : 8787,
    logLevel: parseLogLevel(env.LOG_LEVEL),
    defaultModel: env.DEFAULT_MODEL ?? 'mock-gpt-4o-mini',
  };
}
