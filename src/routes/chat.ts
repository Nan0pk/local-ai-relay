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

      let result;
      try {
        const rawSessionId = req.headers['x-relay-session'];
        const sessionId = Array.isArray(rawSessionId) ? rawSessionId[0] : rawSessionId;
        const controller = new AbortController();
        req.raw.once('aborted', () => controller.abort());
        result = await provider.complete(body, model, {
          ...(sessionId ? { sessionId } : {}),
          signal: controller.signal,
        });
      } catch (err) {
        req.log.error({ err, model }, 'provider.complete failed');
        return reply
          .code(500)
          .send(errorBody('Provider returned an unexpected error.', 'server_error', 'internal_error'));
      }

      if (body.stream === true) {
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });

        const choice = result.choices[0];
        const content = choice?.message?.content;
        const toolCalls = choice?.message?.tool_calls;

        if (content) {
          const words = content.split(/(\s+)/);
          for (const word of words) {
            if (word.length === 0) continue;
            const chunk = {
              id: result.id,
              object: 'chat.completion.chunk',
              created: result.created,
              model: result.model,
              choices: [{
                index: 0,
                delta: { content: word },
                finish_reason: null,
              }],
            };
            reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
            await new Promise((resolve) => setTimeout(resolve, 5));
          }
        }

        if (toolCalls && toolCalls.length > 0) {
          const chunk = {
            id: result.id,
            object: 'chat.completion.chunk',
            created: result.created,
            model: result.model,
            choices: [{
              index: 0,
              delta: { tool_calls: toolCalls },
              finish_reason: null,
            }],
          };
          reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }

        const finalChunk = {
          id: result.id,
          object: 'chat.completion.chunk',
          created: result.created,
          model: result.model,
          choices: [{
            index: 0,
            delta: {},
            finish_reason: choice?.finish_reason || 'stop',
          }],
        };
        reply.raw.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
        reply.raw.write('data: [DONE]\n\n');
        reply.raw.end();
        return reply;
      }

      return reply.send(result);
    },
  );
}
