import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { getOrGenerateToken } from './token.js';
import { harnessTokens } from './harness-tokens.js';

function isOriginAllowed(
  origin: string,
  pathname: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const normalized = origin.toLowerCase().trim();
  // The existing-browser bridge accepts any Chrome extension origin only on
  // its narrow, bearer-authenticated endpoints. All other API access retains
  // the explicit extension-ID allowlist.
  if (normalized.startsWith('chrome-extension://')) {
    if (pathname.startsWith('/v1/control/browser-extension/')) return true;
    const extensionId = normalized.slice('chrome-extension://'.length).replace(/\/$/, '');
    const allowedIds = new Set(
      (env.RELAY_EXTENSION_IDS ?? '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    );
    return allowedIds.has(extensionId);
  }
  // Allow loopback origins with optional port
  try {
    const url = new URL(normalized);
    const host = url.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
  } catch {
    return false;
  }
}

function tokensMatch(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length
    && timingSafeEqual(actualBytes, expectedBytes);
}

export function registerAuthAndCors(app: FastifyInstance): void {
  // Global hook to handle CORS preflight and request validation
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const origin = req.headers.origin;
    const pathname = req.url.split('?', 1)[0]!;

    // Validate origin if present
    if (origin) {
      if (!isOriginAllowed(origin, pathname)) {
        req.log.warn({ origin }, 'CORS request blocked from unauthorized origin');
        return reply.code(403).send({
          error: {
            message: `CORS request from origin '${origin}' is blocked.`,
            type: 'cors_error',
            param: null,
            code: 'cors_blocked'
          }
        });
      }

      // Add CORS headers for authorized origins
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, x-relay-session');
      reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    }

    // Handle CORS preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      return reply.code(204).send();
    }

    // Liveness and the dashboard shell contain no secrets. The dashboard asks
    // for the token before making authenticated API calls.
    if (
      pathname === '/health'
      || pathname === '/ui'
      || pathname === '/ui/app.css'
      || pathname === '/ui/app.js'
      || pathname === '/dashboard'
    ) {
      return;
    }

    // Validate Bearer Token
    const authHeader = req.headers.authorization;
    const bearerMatch = authHeader?.match(/^Bearer\s+(.+)$/i);
    if (!bearerMatch?.[1]?.trim()) {
      return reply.code(401).send({
        error: {
          message: 'Missing or malformed Authorization header. Bearer token required.',
          type: 'invalid_request_error',
          param: null,
          code: 'invalid_api_key'
        }
      });
    }

    const token = bearerMatch[1].trim();
    const expectedToken = await getOrGenerateToken();

    const primaryToken = tokensMatch(token, expectedToken);
    const scopedToken = primaryToken ? undefined : harnessTokens.resolve(token);
    if (!primaryToken && !scopedToken) {
      return reply.code(401).send({
        error: {
          message: 'Incorrect API key provided.',
          type: 'invalid_request_error',
          param: null,
          code: 'invalid_api_key'
        }
      });
    }

    if (
      scopedToken?.harnessId === 'browser-extension'
      && !pathname.startsWith('/v1/control/browser-extension/')
    ) {
      return reply.code(403).send({
        error: {
          message: 'This browser-extension key is restricted to browser bridge endpoints.',
          type: 'invalid_request_error',
          param: null,
          code: 'insufficient_scope',
        },
      });
    }
  });
}
