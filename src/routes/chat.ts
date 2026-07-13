/**
 * POST /v1/chat/completions
 *
 * OpenAI-compatible chat completions endpoint. Routes the requested
 * model to a registered provider; returns an OpenAI-shaped error if the
 * model is unknown or the request is malformed.
 *
 * BrowserFailure errors thrown by browser drivers are mapped to OpenAI-shaped
 * HTTP responses with a stable `code` field so OpenAI-compatible clients
 * (Hermes, generic harnesses) can distinguish failure modes without learning
 * provider internals.
 *
 * SSE streaming writes to the raw response with error handlers so client
 * disconnects during streaming do not surface as unhandled EPIPE/ECONNRESET.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { findProviderForModel } from '../providers/registry.js';
import { BrowserFailure } from '../browser/types.js';
import { browserFailureErrorBody } from '../types/openai.js';
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

/**
 * Write one SSE data frame to the raw response. Returns false if the write
 * failed (client disconnected) so the caller can stop writing without
 * surfacing an unhandled EPIPE. The payload is JSON-encoded unless it is
 * the bare string '[DONE]', which OpenAI SSE sends literally.
 */
function writeSseFrame(raw: NodeJS.WritableStream, payload: unknown): boolean {
  const stream = raw as NodeJS.WritableStream & { destroyed?: boolean; writableEnded?: boolean };
  if (stream.destroyed || stream.writableEnded) return false;
  try {
    const frame = payload === '[DONE]' ? 'data: [DONE]\n\n' : `data: ${JSON.stringify(payload)}\n\n`;
    return stream.write(frame);
  } catch {
    // EPIPE / ECONNRESET during client disconnect — swallow so the request
    // handler does not throw an unhandled error into the process.
    return false;
  }
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
        // Preserve the BrowserFailure taxonomy at the HTTP boundary.
        if (err instanceof BrowserFailure) {
          const mapped = browserFailureErrorBody(err.kind, err.message);
          if (mapped) {
            req.log.warn({ kind: err.kind, model, status: mapped.status }, 'browser provider failure');
            return reply.code(mapped.status).send(mapped.body);
          }
          // Unknown BrowserFailureKind — fall through to generic 500.
          req.log.error({ err, model, kind: err.kind }, 'unmapped BrowserFailure kind');
        } else {
          req.log.error({ err, model }, 'provider.complete failed');
        }
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

        // Attach error handlers so a client disconnect during streaming does
        // not surface as an unhandled EPIPE/ECONNRESET in the process.
        let streamBroken = false;
        reply.raw.on('error', (err: NodeJS.ErrnoException) => {
          if (err.code !== 'EPIPE' && err.code !== 'ECONNRESET') {
            req.log.warn({ err, model }, 'sse stream error');
          }
          streamBroken = true;
        });
        reply.raw.on('close', () => { streamBroken = true; });

        const choice = result.choices[0];
        const content = choice?.message?.content;
        const toolCalls = choice?.message?.tool_calls;

        if (content) {
          const words = content.split(/(\s+)/);
          for (const word of words) {
            if (word.length === 0) continue;
            if (streamBroken) break;
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
            writeSseFrame(reply.raw, chunk);
            await new Promise((resolve) => setTimeout(resolve, 5));
          }
        }

        if (!streamBroken && toolCalls && toolCalls.length > 0) {
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
          writeSseFrame(reply.raw, chunk);
        }

        if (!streamBroken) {
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
          writeSseFrame(reply.raw, finalChunk);
          writeSseFrame(reply.raw, '[DONE]');
        }

        if (!reply.raw.writableEnded) {
          reply.raw.end();
        }
        return reply;
      }

      return reply.send(result);
    },
  );
}
