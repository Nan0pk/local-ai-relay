import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { activePromptStorage } from '../browser/mock-browser.js';
import { BrowserFailure } from '../browser/types.js';
import type { AppConfig } from '../config.js';
import { findProviderForModel } from '../providers/registry.js';
import {
  browserFailureErrorBody,
  type ChatCompletionRequest,
  type ChatRoleMessage,
  type ErrorResponse,
  type ResponseRequest,
} from '../types/openai.js';

function errorBody(message: string, code: string, param: string | null = null): ErrorResponse {
  return { error: { message, type: 'invalid_request_error', param, code } };
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      const value = part as Record<string, unknown>;
      return typeof value.text === 'string' ? value.text : '';
    })
    .join('');
}

function hasUnsupportedMedia(body: ResponseRequest): boolean {
  if (!Array.isArray(body.input)) return false;
  return body.input.some((item) => {
    if (['input_image', 'input_file', 'computer_screenshot'].includes(String(item.type))) return true;
    if (!Array.isArray(item.content)) return false;
    return item.content.some((part) => {
      if (!part || typeof part !== 'object') return false;
      return ['input_image', 'input_file', 'computer_screenshot'].includes(
        String((part as Record<string, unknown>).type),
      );
    });
  });
}

function toMessages(body: ResponseRequest): ChatRoleMessage[] {
  const messages: ChatRoleMessage[] = [];
  if (body.instructions) messages.push({ role: 'system', content: body.instructions });
  if (typeof body.input === 'string') return [...messages, { role: 'user', content: body.input }];

  for (const item of body.input) {
    if (item.type === 'function_call_output') {
      messages.push({
        role: 'tool',
        tool_call_id: String(item.call_id ?? ''),
        content: textFromContent(item.output),
      });
      continue;
    }
    if (item.type === 'function_call') {
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: String(item.call_id ?? item.id ?? ''),
          type: 'function',
          function: {
            name: String(item.name ?? ''),
            arguments: String(item.arguments ?? '{}'),
          },
        }],
      });
      continue;
    }
    const role = item.role === 'developer' ? 'system' : item.role;
    if (role === 'system' || role === 'user' || role === 'assistant') {
      messages.push({ role, content: textFromContent(item.content) });
    }
  }
  return messages;
}

function toChatRequest(body: ResponseRequest, model: string): ChatCompletionRequest {
  return {
    model,
    messages: toMessages(body),
    temperature: body.temperature,
    top_p: body.top_p,
    max_tokens: body.max_output_tokens,
    tools: body.tools?.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    })),
    tool_choice: body.tool_choice,
  };
}

function responseBody(
  result: Awaited<ReturnType<NonNullable<ReturnType<typeof findProviderForModel>>['complete']>>,
  request: ResponseRequest,
) {
  const choice = result.choices[0];
  const output = choice?.message.tool_calls?.length
    ? choice.message.tool_calls.map((call) => ({
        type: 'function_call' as const,
        id: call.id,
        call_id: call.id,
        name: call.function.name,
        arguments: call.function.arguments,
        status: 'completed',
      }))
    : [{
        type: 'message' as const,
        id: `msg_${crypto.randomUUID()}`,
        status: 'completed',
        role: 'assistant',
        content: [{
          type: 'output_text' as const,
          text: choice?.message.content ?? '',
          annotations: [],
          logprobs: [],
        }],
      }];
  return {
    id: result.id.replace(/^chatcmpl-/, 'resp_'),
    object: 'response',
    created_at: result.created,
    completed_at: result.created,
    status: 'completed',
    error: null,
    incomplete_details: null,
    input: [],
    instructions: request.instructions ?? null,
    max_output_tokens: request.max_output_tokens ?? null,
    model: result.model,
    output,
    output_text: choice?.message.content ?? '',
    metadata: {},
    parallel_tool_calls: true,
    previous_response_id: null,
    store: false,
    temperature: request.temperature ?? 1,
    text: { format: { type: 'text' } },
    tool_choice: request.tool_choice ?? 'auto',
    tools: request.tools ?? [],
    top_p: request.top_p ?? 1,
    truncation: 'disabled',
    usage: {
      input_tokens: result.usage.prompt_tokens,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: result.usage.completion_tokens,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: result.usage.total_tokens,
    },
  };
}

function writeEvent(
  raw: NodeJS.WritableStream & { destroyed?: boolean; writableEnded?: boolean },
  broken: () => boolean,
  type: string,
  data: unknown,
): void {
  if (broken() || raw.destroyed || raw.writableEnded) return;
  try {
    raw.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    // Client disconnected between the state check and write.
  }
}

function streamResponse(
  raw: NodeJS.WritableStream & { destroyed?: boolean; writableEnded?: boolean },
  response: ReturnType<typeof responseBody>,
  broken: () => boolean,
): void {
  let sequence = 0;
  writeEvent(raw, broken, 'response.created', {
    type: 'response.created',
    sequence_number: sequence++,
    response: { ...response, status: 'in_progress', output: [] },
  });
  writeEvent(raw, broken, 'response.in_progress', {
    type: 'response.in_progress',
    sequence_number: sequence++,
    response: { ...response, status: 'in_progress', output: [] },
  });
  response.output.forEach((item, outputIndex) => {
    writeEvent(raw, broken, 'response.output_item.added', {
      type: 'response.output_item.added',
      sequence_number: sequence++,
      output_index: outputIndex,
      item: item.type === 'message' ? { ...item, status: 'in_progress', content: [] } : { ...item, status: 'in_progress', arguments: '' },
    });
    if (item.type === 'message') {
      const part = item.content[0]!;
      writeEvent(raw, broken, 'response.content_part.added', {
        type: 'response.content_part.added', sequence_number: sequence++, item_id: item.id,
        output_index: outputIndex, content_index: 0, part: { ...part, text: '' },
      });
      writeEvent(raw, broken, 'response.output_text.delta', {
        type: 'response.output_text.delta', sequence_number: sequence++, item_id: item.id,
        output_index: outputIndex, content_index: 0, delta: part.text, logprobs: [],
      });
      writeEvent(raw, broken, 'response.output_text.done', {
        type: 'response.output_text.done', sequence_number: sequence++, item_id: item.id,
        output_index: outputIndex, content_index: 0, text: part.text, logprobs: [],
      });
      writeEvent(raw, broken, 'response.content_part.done', {
        type: 'response.content_part.done', sequence_number: sequence++, item_id: item.id,
        output_index: outputIndex, content_index: 0, part,
      });
    } else {
      writeEvent(raw, broken, 'response.function_call_arguments.delta', {
        type: 'response.function_call_arguments.delta', sequence_number: sequence++, item_id: item.id,
        output_index: outputIndex, delta: item.arguments,
      });
      writeEvent(raw, broken, 'response.function_call_arguments.done', {
        type: 'response.function_call_arguments.done', sequence_number: sequence++, item_id: item.id,
        output_index: outputIndex, arguments: item.arguments, name: item.name,
      });
    }
    writeEvent(raw, broken, 'response.output_item.done', {
      type: 'response.output_item.done', sequence_number: sequence++, output_index: outputIndex, item,
    });
  });
  writeEvent(raw, broken, 'response.completed', {
    type: 'response.completed', sequence_number: sequence, response,
  });
}

export function registerResponsesRoutes(app: FastifyInstance, config: AppConfig): void {
  app.post<{ Body: ResponseRequest }>(
    '/v1/responses',
    async (req: FastifyRequest<{ Body: ResponseRequest }>, reply: FastifyReply) => {
      const body = req.body ?? ({} as ResponseRequest);
      if (hasUnsupportedMedia(body)) {
        return reply.code(400).send(errorBody(
          'Image and file input are not supported by the current provider contract.',
          'unsupported_input',
          'input',
        ));
      }
      const messages = toMessages(body);
      if (!body.input || messages.length === 0) {
        return reply.code(400).send(errorBody('`input` must contain at least one message.', 'invalid_input', 'input'));
      }
      const model = (body.model ?? config.defaultModel).trim();
      const provider = findProviderForModel(model);
      if (!provider) {
        return reply.code(404).send(errorBody(`Model '${model}' is not registered.`, 'model_not_found', 'model'));
      }

      const prompt = messages.at(-1)?.content ?? '';
      return activePromptStorage.run(prompt, async () => {
        try {
          const rawSessionId = req.headers['x-relay-session'];
          const sessionId = Array.isArray(rawSessionId) ? rawSessionId[0] : rawSessionId;
          const controller = new AbortController();
          req.raw.once('aborted', () => controller.abort());
          const result = await provider.complete(toChatRequest(body, model), model, {
            ...(sessionId ? { sessionId } : {}),
            signal: controller.signal,
          });
          const response = responseBody(result, body);
          if (!body.stream) return reply.send(response);

          reply.raw.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          });
          let streamBroken = false;
          reply.raw.on('error', () => { streamBroken = true; });
          reply.raw.on('close', () => { streamBroken = true; });
          streamResponse(reply.raw, response, () => streamBroken);
          if (!streamBroken && !reply.raw.writableEnded) reply.raw.end();
          return reply;
        } catch (error) {
          if (error instanceof BrowserFailure) {
            const mapped = browserFailureErrorBody(error.kind, error.message);
            if (mapped) return reply.code(mapped.status).send(mapped.body);
          }
          req.log.error({ error, model }, 'responses provider failed');
          return reply.code(500).send({
            error: { message: 'Provider returned an unexpected error.', type: 'server_error', code: 'internal_error' },
          });
        }
      });
    },
  );
}
