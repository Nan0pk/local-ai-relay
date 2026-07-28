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
import { activePromptStorage } from '../browser/mock-browser.js';
import { BrowserFailure } from '../browser/types.js';
import { browserFailureErrorBody } from '../types/openai.js';
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ErrorResponse,
} from '../types/openai.js';
import type { AppConfig } from '../config.js';
import { redactSensitive } from '../utils/redact.js';
import { controlEvents } from '../control/events.js';
import { isRoutingAlias, routingManager } from '../control/routing.js';

function errorBody(
  message: string,
  type: string,
  code: string | null = null,
  param: string | null = null,
): ErrorResponse {
  return { error: { message, type, param, code } };
}

function validateRequest(body: ChatCompletionRequest): { message: string; param: string } | null {
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return { message: '`messages` must be a non-empty array.', param: 'messages' };
  }
  const roles = new Set(['system', 'user', 'assistant', 'tool']);
  for (const message of body.messages as unknown[]) {
    if (
      typeof message !== 'object'
      || message === null
      || !roles.has(String((message as { role?: unknown }).role))
      || !['string', 'object'].includes(typeof (message as { content?: unknown }).content)
      || (
        (message as { content?: unknown }).content !== null
        && typeof (message as { content?: unknown }).content !== 'string'
      )
    ) {
      return {
        message: 'Each message must have a supported role and string or null content.',
        param: 'messages',
      };
    }
  }
  if (body.model !== undefined && (typeof body.model !== 'string' || body.model.trim() === '')) {
    return { message: '`model` must be a non-empty string.', param: 'model' };
  }
  if (
    body.tools !== undefined
    && (
      !Array.isArray(body.tools)
      || body.tools.some((tool) => (
        typeof tool !== 'object'
        || tool === null
        || tool.type !== 'function'
        || typeof tool.function !== 'object'
        || tool.function === null
        || typeof tool.function.name !== 'string'
        || tool.function.name.trim() === ''
      ))
    )
  ) {
    return { message: '`tools` must contain valid function definitions.', param: 'tools' };
  }
  if (body.stream !== undefined && typeof body.stream !== 'boolean') {
    return { message: '`stream` must be a boolean.', param: 'stream' };
  }
  for (const name of ['temperature', 'top_p'] as const) {
    if (body[name] !== undefined && (typeof body[name] !== 'number' || !Number.isFinite(body[name]))) {
      return { message: `\`${name}\` must be a finite number.`, param: name };
    }
  }
  if (body.max_tokens !== undefined && (!Number.isInteger(body.max_tokens) || body.max_tokens < 1)) {
    return { message: '`max_tokens` must be a positive integer.', param: 'max_tokens' };
  }
  return null;
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

      const promptTrigger = body.messages?.[body.messages.length - 1]?.content || '';
      return activePromptStorage.run(promptTrigger, async () => {
        const invalid = validateRequest(body);
        if (invalid) {
          return reply
            .code(400)
            .send(errorBody(invalid.message, 'invalid_request_error', null, invalid.param));
        }

      const requestedModel = (body.model ?? config.defaultModel).trim();
      const routing = routingManager.resolve(requestedModel);
      if (isRoutingAlias(requestedModel) && !routing) {
        return reply
          .code(503)
          .send(errorBody(
            'No permitted provider is currently ready for routing.',
            'server_error',
            'no_ready_provider',
            'model',
          ));
      }
      let selectedRoute = routing;
      let model = routing?.selectedModel ?? requestedModel;
      let provider = findProviderForModel(model);
      if (!provider) {
        return reply
          .code(404)
          .send(errorBody(`Model '${model}' is not registered.`, 'invalid_request_error', 'model_not_found', 'model'));
      }

      let result: ChatCompletionResponse | undefined;
      let providerError: unknown;
      const rawSessionId = req.headers['x-relay-session'];
      const sessionId = Array.isArray(rawSessionId) ? rawSessionId[0] : rawSessionId;
      const controller = new AbortController();
      req.raw.once('aborted', () => controller.abort());
      const fallbacks = routing ? routingManager.fallbacks(routing) : [];
      for (let attempt = 0; attempt <= fallbacks.length; attempt += 1) {
        const attemptStartedAt = Date.now();
        try {
          result = await provider.complete(body, model, {
            ...(sessionId ? { sessionId } : {}),
            signal: controller.signal,
          });
          routingManager.recordAttempt(provider.id, Date.now() - attemptStartedAt, true);
          providerError = undefined;
          break;
        } catch (error) {
          routingManager.recordAttempt(provider.id, Date.now() - attemptStartedAt, false);
          providerError = error;
          const next = fallbacks[attempt];
          if (!next || controller.signal.aborted) break;
          routingManager.recordFailover(selectedRoute!, next, error);
          const nextProvider = findProviderForModel(next.selectedModel);
          if (!nextProvider) break;
          selectedRoute = next;
          model = next.selectedModel;
          provider = nextProvider;
        }
      }
      if (providerError || !result) {
        const err = providerError;
        // Preserve the BrowserFailure taxonomy at the HTTP boundary.
        if (err instanceof BrowserFailure) {
          const mapped = browserFailureErrorBody(err.kind, err.message);
          if (mapped) {
            controlEvents.record({
              scope: 'provider',
              level: 'error',
              code: err.kind,
              message: `${provider.id} failed while serving ${model}.`,
              providerId: provider.id,
              detail: err.message,
            });
            req.log.warn({ kind: err.kind, model, status: mapped.status }, 'browser provider failure');
            return reply.code(mapped.status).send(mapped.body);
          }
          // Unknown BrowserFailureKind — fall through to generic 500.
          req.log.error({ err, model, kind: err.kind }, 'unmapped BrowserFailure kind');
        } else {
          controlEvents.record({
            scope: 'provider',
            level: 'error',
            code: 'provider_unexpected_error',
            message: `${provider.id} returned an unexpected error.`,
            providerId: provider.id,
            detail: err instanceof Error ? err.message : String(err),
          });
          req.log.error({
            error: redactSensitive(err instanceof Error ? err.message : String(err)),
            model,
          }, 'provider.complete failed');
        }
        return reply
          .code(500)
          .send(errorBody('Provider returned an unexpected error.', 'server_error', 'internal_error'));
      }
      if (selectedRoute) {
        reply
          .header('x-relay-selected-model', selectedRoute.selectedModel)
          .header('x-relay-provider', selectedRoute.providerId)
          .header('x-relay-routing-reason', selectedRoute.reason);
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
      });
    },
  );
}
