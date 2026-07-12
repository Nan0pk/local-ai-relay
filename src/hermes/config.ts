export const HERMES_PROVIDER_NAME = 'local-ai-relay';
export const HERMES_MODEL_ID = 'browser-chatgpt-free';

type ConfigMap = Record<string, unknown>;

function record(value: unknown): ConfigMap {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as ConfigMap
    : {};
}

/** Register a named provider so both Hermes runtime and /model can see it. */
export function upsertHermesRelayConfig(source: unknown, baseUrl: string): ConfigMap {
  const config = { ...record(source) };
  const existingProviders = Array.isArray(config.custom_providers)
    ? config.custom_providers.filter((value): value is ConfigMap => Boolean(value) && typeof value === 'object' && !Array.isArray(value))
    : [];
  const relayProvider: ConfigMap = {
    name: HERMES_PROVIDER_NAME,
    base_url: baseUrl,
    model: HERMES_MODEL_ID,
    api_mode: 'chat_completions',
    models: {
      [HERMES_MODEL_ID]: {},
    },
  };
  const relayIndex = existingProviders.findIndex((provider) => provider.name === HERMES_PROVIDER_NAME);
  const customProviders = [...existingProviders];
  if (relayIndex >= 0) customProviders[relayIndex] = { ...existingProviders[relayIndex], ...relayProvider };
  else customProviders.push(relayProvider);

  config.custom_providers = customProviders;
  config.model = {
    ...record(config.model),
    provider: `custom:${HERMES_PROVIDER_NAME}`,
    default: HERMES_MODEL_ID,
    base_url: baseUrl,
    api_mode: 'chat_completions',
  };
  return config;
}
