import { normalizeLoopbackBaseUrl } from '../utils/loopback-url.js';

type FetchImplementation = typeof fetch;

interface ProviderStatusResponse {
  object: 'list';
  data: Array<{ provider_id: string } & Record<string, unknown>>;
}

export function createDaemonClient(
  baseUrl: string,
  token: string,
  fetchImplementation: FetchImplementation = fetch,
) {
  const normalizedBaseUrl = normalizeLoopbackBaseUrl(baseUrl);
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const fetchJson = async (path: string, options?: RequestInit) => {
    const res = await fetchImplementation(`${normalizedBaseUrl}${path}`, {
      ...options,
      headers,
      redirect: 'error',
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Daemon API error (${res.status}): ${text}`);
    }
    return res.json();
  };

  return {
    listModels: (includeUnready?: boolean) =>
      fetchJson(`/v1/models${includeUnready ? '?include=all' : ''}`),

    getProviderStatus: async (providerId?: string) => {
      const result = await fetchJson('/v1/providers/status') as ProviderStatusResponse;
      if (!providerId) return result;
      const record = result.data.find((item) => item.provider_id === providerId);
      if (!record) throw new Error(`Unknown provider: ${providerId}`);
      return record;
    },

    delegateRequest: (model: string, input: string, tools?: unknown[]) =>
      fetchJson('/v1/responses', {
        method: 'POST',
        body: JSON.stringify({ model, input, tools }),
      }),

  };
}

export type DaemonClient = ReturnType<typeof createDaemonClient>;
