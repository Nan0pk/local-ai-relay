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

function streamCompletion(reply: FastifyReply, result: ChatCompletionResponse): void {
  reply.hijack();
  reply.raw.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
  });
  const choice = result.choices[0];
  const message = choice?.message;
  const base = { id: result.id, object: 'chat.completion.chunk', created: result.created, model: result.model };
  reply.raw.write(`data: ${JSON.stringify({ ...base, choices: [{
    index: choice?.index ?? 0,
    delta: {
      role: 'assistant',
      ...(message?.content !== undefined ? { content: message.content } : {}),
      ...(message?.tool_calls ? { tool_calls: message.tool_calls } : {}),
    },
    finish_reason: null,
  }] })}\n\n`);
  reply.raw.write(`data: ${JSON.stringify({ ...base, choices: [{
    index: choice?.index ?? 0,
    delta: {},
    finish_reason: choice?.finish_reason ?? 'stop',
  }] })}\n\n`);
  reply.raw.end('data: [DONE]\n\n');
}

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

      try {
        const rawSessionId = req.headers['x-relay-session'];
        const sessionId = Array.isArray(rawSessionId) ? rawSessionId[0] : rawSessionId;
        const controller = new AbortController();
        req.raw.once('aborted', () => controller.abort());
        const result = await provider.complete(body, model, {
          ...(sessionId ? { sessionId } : {}),
          signal: controller.signal,
        });
        if (body.stream === true) {
          streamCompletion(reply, result);
          return;
        }
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
