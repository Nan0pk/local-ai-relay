const REDACTED = '***REDACTED***';

export function redactSensitive(text: string): string {
  return text
    .replace(/\b(Authorization\s*:\s*)Bearer\s+\S+/gi, `$1Bearer ${REDACTED}`)
    .replace(/\bBearer\s+\S+/gi, `Bearer ${REDACTED}`)
    .replace(/(["']?(?:api[_-]?key|password|token|cookie)["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi, `$1"${REDACTED}"`)
    .replace(/\b(session|__Secure-[^=\s]+)=([^&;\s]+)/gi, `$1=${REDACTED}`);
}
