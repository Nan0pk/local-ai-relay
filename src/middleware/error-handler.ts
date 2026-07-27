import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { redactSensitive } from '../utils/redact.js';

interface CustomError extends FastifyError {
  kind?: string;
}

const ERROR_MAP: Record<string, { status: number; code: string }> = {
  unauthorized: { status: 401, code: 'invalid_api_key' },
  unsafe_bind_rejected: { status: 403, code: 'binding_not_allowed' },
  login_required: { status: 401, code: 'provider_login_required' },
  rate_limit: { status: 429, code: 'rate_limit_exceeded' },
  captcha: { status: 403, code: 'captcha_challenge_required' },
  composer_disabled: { status: 409, code: 'composer_unavailable' },
  upstream_offline: { status: 503, code: 'local_engine_offline' },
  upstream_oom: { status: 507, code: 'insufficient_memory' },
  invalid_tool_call: { status: 422, code: 'invalid_tool_call' },
  tab_disconnected: { status: 499, code: 'browser_tab_lost' },
};

export function errorHandler(err: CustomError, _req: FastifyRequest, reply: FastifyReply) {
  const redactedMessage = redactSensitive(err.message || 'Internal server error');

  let status = err.statusCode || 500;
  let errorCode = 'internal_error';
  if (err.validation) {
    status = 400;
    errorCode = 'bad_request';
  }

  if (err.kind && ERROR_MAP[err.kind]) {
    const mapping = ERROR_MAP[err.kind];
    status = mapping.status;
    errorCode = mapping.code;
  }

  reply.status(status).send({
    error: {
      message: redactedMessage,
      type: errorCode,
      code: status,
    },
  });
}
