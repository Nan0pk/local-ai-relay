import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { getOrGenerateToken } from './token.js';

function isOriginAllowed(origin: string): boolean {
  const normalized = origin.toLowerCase().trim();
  // Allow chrome extensions
  if (normalized.startsWith('chrome-extension://')) {
    return true;
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

export function registerAuthAndCors(app: FastifyInstance): void {
  // Global hook to handle CORS preflight and request validation
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const origin = req.headers.origin;

    // Validate origin if present
    if (origin) {
      if (!isOriginAllowed(origin)) {
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
      reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }

    // Handle CORS preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      return reply.code(204).send();
    }

    // Skip token validation for liveness check
    if (req.url === '/health') {
      return;
    }

    // Validate Bearer Token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({
        error: {
          message: 'Missing or malformed Authorization header. Bearer token required.',
          type: 'invalid_request_error',
          param: null,
          code: 'invalid_api_key'
        }
      });
    }

    const token = authHeader.substring(7).trim();
    const expectedToken = await getOrGenerateToken();

    if (token !== expectedToken) {
      return reply.code(401).send({
        error: {
          message: 'Incorrect API key provided.',
          type: 'invalid_request_error',
          param: null,
          code: 'invalid_api_key'
        }
      });
    }
  });
}
