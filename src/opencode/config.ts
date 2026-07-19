export const OPENCODE_PROVIDER_ID = 'local-ai-relay';

type ConfigMap = Record<string, unknown>;

function record(value: unknown): ConfigMap {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as ConfigMap
    : {};
}

export interface HarnessModel {
  id: string;
  status?: string;
}

export function upsertOpenCodeRelayConfig(
  source: unknown,
  baseUrl: string,
  apiKey: string,
  models: readonly HarnessModel[],
): ConfigMap {
  const config = { ...record(source) };
  const providers = { ...record(config.provider) };
  const existing = record(providers[OPENCODE_PROVIDER_ID]);
  const existingModels = record(existing.models);
  const modelMap: ConfigMap = {};
  for (const model of models) {
    const suffix = model.status && !['ready', 'degraded'].includes(model.status)
      ? ` (${model.status})`
      : '';
    modelMap[model.id] = {
      ...record(existingModels[model.id]),
      name: `${model.id}${suffix}`,
    };
  }
  providers[OPENCODE_PROVIDER_ID] = {
    ...existing,
    npm: '@ai-sdk/openai',
    name: 'Local AI Relay',
    options: {
      ...record(existing.options),
      baseURL: baseUrl,
      apiKey,
    },
    models: modelMap,
  };
  config.$schema ??= 'https://opencode.ai/config.json';
  config.provider = providers;
  return config;
}
