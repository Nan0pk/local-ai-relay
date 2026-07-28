const LOOPBACK_HOSTS = new Set(['127.0.0.1', '[::1]', '::1']);

export function normalizeLoopbackBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Relay URL must be a valid loopback HTTP URL');
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:')
    || !LOOPBACK_HOSTS.has(url.hostname.toLowerCase())
    || url.username
    || url.password
    || (url.pathname !== '/' && url.pathname !== '')
    || url.search
    || url.hash
  ) {
    throw new Error('Relay URL must target 127.0.0.1 or ::1 without credentials, a path, query, or fragment');
  }

  return url.origin;
}
