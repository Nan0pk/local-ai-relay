const SENSITIVE_PATTERNS = [
  /Bearer [a-f0-9]{32,}/gi,
  /Authorization:\s*Bearer\s+[a-f0-9]{32,}/gi,
  /"api_key":\s*"[^"]+"/g,
  /"password":\s*"[^"]+"/g,
  /"token":\s*"[^"]+"/g,
  /"cookie":\s*"[^"]+"/g,
  /session=[^&\s]+/gi,
  /__Secure-[^=]+=[^&\s]+/gi,
];

export function redactSensitive(text: string): string {
  let result = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, (match) => {
      if (match.length > 8) {
        return match.slice(0, 4) + '***REDACTED***' + match.slice(-4);
      }
      return '***REDACTED***';
    });
  }
  return result;
}
