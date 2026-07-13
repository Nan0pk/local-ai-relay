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
 * The first model in the combined list (always {@link HERMES_MODEL_ID} plus
 * any extras the running relay advertises) is the default. Other models are
 * still selectable in Hermes via `custom:local-ai-relay:<model-id>`.
 *
 * Existing provider entries, the user's other custom providers, and any
 * unrelated top-level config keys are preserved.
 */
export function upsertHermesRelayConfig(
  source: unknown,
  baseUrl: string,
  additionalModelIds: readonly string[] = [],
): ConfigMap {
  const config = { ...record(source) };
  const existingProviders = Array.isArray(config.custom_providers)
    ? config.custom_providers.filter((value): value is ConfigMap => Boolean(value) && typeof value === 'object' && !Array.isArray(value))
    : [];

  // De-duplicate: never list the same model twice even if the caller passes
  // it explicitly in `additionalModelIds`.
  const modelOrder = [HERMES_MODEL_ID];
  for (const id of additionalModelIds) {
    if (id && id !== HERMES_MODEL_ID && !modelOrder.includes(id)) modelOrder.push(id);
  }
  const models: Record<string, ConfigMap> = {};
  for (const id of modelOrder) models[id] = {};

  const relayProvider: ConfigMap = {
    name: HERMES_PROVIDER_NAME,
    base_url: baseUrl,
    model: HERMES_MODEL_ID,
    api_mode: 'chat_completions',
    models,
  };
  const relayIndex = existingProviders.findIndex((provider) => provider.name === HERMES_PROVIDER_NAME);
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
    default: HERMES_MODEL_ID,
    base_url: baseUrl,
    api_mode: 'chat_completions',
  };
  return config;
}
