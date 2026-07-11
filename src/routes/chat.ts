/**
 * POST /v1/chat/completions
 *
 * OpenAI-compatible chat completions endpoint. Routes the requested
 * model to a registered provider; returns an OpenAI-shaped error if the
 * model is unknown or the request is malformed.
 *
 * Milestone 1: only the mock provider is registered, so every supported
 * model returns a deterministic mock response. No streaming yet.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { findProviderForModel } from '../providers/registry.js';
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ErrorResponse,
} from '../types/openai.js';
import type { AppConfig } from '../config.js';

function errorBody(
  message: string,
  type: string,
  code: string | null = null,
  param: string | null = null,
): ErrorResponse {
  return { error: { message, type, param, code } };
}

export function registerChatRoutes(app: FastifyInstance, config: AppConfig): void {
  app.post<{
    Body: ChatCompletionRequest;
    Reply: ChatCompletionResponse | ErrorResponse;
  }>(
    '/v1/chat/completions',
    async (req: FastifyRequest<{ Body: ChatCompletionRequest }>, reply: FastifyReply) => {
      const body = req.body ?? ({} as ChatCompletionRequest);

      if (!Array.isArray(body.messages) || body.messages.length === 0) {
        return reply
          .code(400)
          .send(errorBody('`messages` must be a non-empty array.', 'invalid_request_error', null, 'messages'));
      }

      const model = (body.model ?? config.defaultModel).trim();
      const provider = findProviderForModel(model);
      if (!provider) {
        return reply
          .code(404)
          .send(errorBody(`Model '${model}' is not registered.`, 'invalid_request_error', 'model_not_found', 'model'));
      }

      if (body.stream === true) {
        // Streaming lands in a later milestone. Reject explicitly so
        // clients don't silently get a non-streaming response.
        return reply
          .code(400)
          .send(errorBody('Streaming is not supported in milestone 1.', 'invalid_request_error', 'streaming_not_supported', 'stream'));
      }

      try {
        const result = await provider.complete(body, model);
        return reply.send(result);
      } catch (err) {
        req.log.error({ err, model }, 'provider.complete failed');
        return reply
          .code(500)
          .send(errorBody('Provider returned an unexpected error.', 'server_error', 'internal_error'));
      }
    },
  );
}
