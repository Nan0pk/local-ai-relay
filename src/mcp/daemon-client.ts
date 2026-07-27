export function createDaemonClient(baseUrl: string, token: string) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const fetchJson = async (path: string, options?: RequestInit) => {
    const res = await fetch(`${baseUrl}${path}`, { ...options, headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Daemon API error (${res.status}): ${text}`);
    }
    return res.json();
  };

  return {
    listModels: (includeUnready?: boolean) =>
      fetchJson(`/v1/models${includeUnready ? '?include=all' : ''}`),

    getProviderStatus: (providerId?: string) =>
      fetchJson(`/api/providers/${providerId || ''}`),

    delegateRequest: (model: string, input: string, tools?: unknown[]) =>
      fetchJson('/v1/responses', {
        method: 'POST',
        body: JSON.stringify({ model, input, tools }),
      }),

    openProviderLogin: (provider: string) =>
      fetchJson(`/api/providers/${provider}/login`, { method: 'POST' }),

    triggerProbe: (provider: string) =>
      fetchJson(`/api/providers/${provider}/probe`, { method: 'POST' }),

    clearEvidence: (provider: string) =>
      fetchJson(`/api/providers/${provider}/evidence`, { method: 'DELETE' }),

    getDiagnostics: (redacted: boolean = true) =>
      fetchJson(`/api/diagnostics?redacted=${redacted}`),
  };
}

export type DaemonClient = ReturnType<typeof createDaemonClient>;
