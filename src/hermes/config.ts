export const HERMES_PROVIDER_NAME = 'local-ai-relay';
export const HERMES_MODEL_ID = 'browser-chatgpt-free';

type ConfigMap = Record<string, unknown>;

function record(value: unknown): ConfigMap {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as ConfigMap
    : {};
}

/**
 * Register the named relay provider and all of its advertised models.
 *
 * Every supplied model is selectable through
 * `custom:local-ai-relay:<model-id>`. The caller chooses the default.
 *
 * Existing provider entries, the user's other custom providers, and any
 * unrelated top-level config keys are preserved.
 */
export function upsertHermesRelayConfig(
  source: unknown,
  baseUrl: string,
  apiKey: string,
  modelIds: readonly string[],
  defaultModel = modelIds[0] ?? HERMES_MODEL_ID,
): ConfigMap {
  const config = { ...record(source) };
  const existingProviders = Array.isArray(config.custom_providers)
    ? config.custom_providers.filter((value): value is ConfigMap => Boolean(value) && typeof value === 'object' && !Array.isArray(value))
    : [];
  const relayIndex = existingProviders.findIndex((provider) => provider.name === HERMES_PROVIDER_NAME);
  const existingRelay = relayIndex >= 0 ? existingProviders[relayIndex]! : {};
  const existingModels = record(existingRelay.models);

  // De-duplicate model discovery without changing its stable order.
  const modelOrder: string[] = [];
  for (const id of modelIds) {
    if (id && !modelOrder.includes(id)) modelOrder.push(id);
  }
  if (!modelOrder.includes(defaultModel)) modelOrder.unshift(defaultModel);
  const models: Record<string, ConfigMap> = {};
  for (const id of modelOrder) models[id] = { ...record(existingModels[id]) };

  const relayProvider: ConfigMap = {
    name: HERMES_PROVIDER_NAME,
    base_url: baseUrl,
    api_key: apiKey,
    model: defaultModel,
    api_mode: 'codex_responses',
    models,
  };
  const customProviders = [...existingProviders];
  if (relayIndex >= 0) {
    customProviders[relayIndex] = {
      ...existingProviders[relayIndex],
      ...relayProvider,
      // Preserve any provider-level extras the user previously added.
      extra_body: existingProviders[relayIndex]!.extra_body,
    };
  } else {
    customProviders.push(relayProvider);
  }

  config.custom_providers = customProviders;
  config.model = {
    ...record(config.model),
    provider: `custom:${HERMES_PROVIDER_NAME}`,
    default: defaultModel,
    base_url: baseUrl,
    api_key: apiKey,
    api_mode: 'codex_responses',
  };
  return config;
}
