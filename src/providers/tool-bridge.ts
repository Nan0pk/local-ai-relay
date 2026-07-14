import { Ajv } from 'ajv';
import { BrowserFailure } from '../browser/types.js';
import type { ChatCompletionRequest, ChatToolCall, ChatToolDefinition } from '../types/openai.js';

const TAG_NAME = 'relay_tool_calls';
const ajv = new Ajv({ allErrors: true, strict: false });

export interface ToolBridgeContext {
  readonly tools: readonly ChatToolDefinition[];
  readonly toolChoice: ChatCompletionRequest['tool_choice'];
  readonly nonce: string;
}

export function createToolBridgeContext(
  tools: ChatToolDefinition[] | undefined,
  toolChoice: ChatCompletionRequest['tool_choice'],
): ToolBridgeContext {
  const context = {
    tools: tools ?? [],
    toolChoice: toolChoice ?? 'auto',
    nonce: crypto.randomUUID(),
  };
  const requiredName = selectedToolName(context.toolChoice);
  if ((context.toolChoice === 'required' || requiredName) && context.tools.length === 0) {
    invalidToolCall('tool_choice requires a tool call, but the request offered no tools.');
  }
  if (requiredName && !context.tools.some((tool) => tool.function.name === requiredName)) {
    invalidToolCall(`tool_choice requires unoffered tool ${JSON.stringify(requiredName)}.`);
  }
  return context;
}

function invalidToolCall(message: string): never {
  throw new BrowserFailure('invalid_tool_call', message);
}

function truncate(str: string | undefined, max: number): string | undefined {
  if (!str) return str;
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + '...';
}

function minifyProperties(properties: Record<string, any> | undefined): Record<string, any> | undefined {
  if (!properties) return properties;
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value && typeof value === 'object') {
      result[key] = {
        ...value,
        description: truncate(value.description, 100),
        ...(value.properties ? { properties: minifyProperties(value.properties) } : {}),
        ...(value.items && typeof value.items === 'object' ? {
          items: {
            ...value.items,
            description: truncate(value.items.description, 100),
            ...(value.items.properties ? { properties: minifyProperties(value.items.properties) } : {}),
          }
        } : {}),
      };
    } else {
      result[key] = value;
    }
  }
  return result;
}

function minifyTool(tool: ChatToolDefinition): unknown {
  const params = tool.function.parameters as any;
  return {
    type: tool.type,
    function: {
      name: tool.function.name,
      description: truncate(tool.function.description, 150),
      ...(params ? {
        parameters: {
          ...params,
          properties: minifyProperties(params.properties),
        }
      } : {})
    }
  };
}

function selectedToolName(choice: ChatCompletionRequest['tool_choice']): string | undefined {
  if (!choice || typeof choice === 'string') return undefined;
  const candidate = (choice as { function?: { name?: unknown } }).function?.name;
  return typeof candidate === 'string' && candidate ? candidate : undefined;
}

export function toolInstructions(context: ToolBridgeContext): string {
  const openTag = `<${TAG_NAME} nonce="${context.nonce}">`;
  const closeTag = `</${TAG_NAME}>`;
  if (context.toolChoice === 'none' || context.tools.length === 0) {
    return '\n\nTOOL POLICY\nNo tool calls are allowed for this request. Answer normally without any relay tool-call tags.';
  }
  const minified = context.tools.map(minifyTool);
  const requiredName = selectedToolName(context.toolChoice);
  const choiceInstruction = requiredName
    ? `You must call only the required tool ${JSON.stringify(requiredName)}.`
    : context.toolChoice === 'required'
      ? 'You must return at least one offered tool call.'
      : 'Use an offered tool only when it is needed.';
  return `\n\nAVAILABLE HERMES TOOLS\n${JSON.stringify(minified)}\n\n` +
    `${choiceInstruction} Never pretend to execute a tool. Return calls only inside this request-specific envelope:\n` +
    `${openTag}\n` +
    '[{"id":"call_unique","name":"tool_name","arguments":{}}]\n' +
    `${closeTag}\n` +
    'Arguments must satisfy the supplied JSON schema. You may include a short explanation before the envelope. ' +
    'If no tool is needed and tool choice is auto, answer normally without the envelope.';
}

interface RawToolCall {
  id?: unknown;
  name?: unknown;
  arguments?: unknown;
}

export interface ParsedBrowserResponse {
  content: string | null;
  toolCalls?: ChatToolCall[];
}

export function parseBrowserResponse(text: string, context: ToolBridgeContext): ParsedBrowserResponse {
  const openTag = `<${TAG_NAME} nonce="${context.nonce}">`;
  const closeTag = `</${TAG_NAME}>`;
  const start = text.indexOf(openTag);
  const end = text.indexOf(closeTag, start + openTag.length);
  const requiredName = selectedToolName(context.toolChoice);
  const requiresTool = context.toolChoice === 'required' || requiredName !== undefined;

  if (start >= 0 && end < 0) {
    invalidToolCall('Browser model returned an incomplete request-specific tool-call envelope.');
  }
  if (start < 0) {
    if (requiresTool) invalidToolCall('Browser model did not return the tool call required by tool_choice.');
    return { content: text };
  }
  if (context.toolChoice === 'none') invalidToolCall('Browser model returned a tool call while tool_choice was none.');
  if (context.tools.length === 0) invalidToolCall('Browser model returned a tool call although no tools were offered.');

  const raw = text.slice(start + openTag.length, end).trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    invalidToolCall('Browser model returned malformed JSON in the tool-call envelope.');
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    invalidToolCall('Browser model returned an empty or invalid tool-call envelope.');
  }

  const offered = new Map(context.tools.map((tool) => [tool.function.name, tool]));
  const ids = new Set<string>();
  const toolCalls = parsed.map((candidate: RawToolCall, index): ChatToolCall => {
    if (!candidate || typeof candidate.name !== 'string' || !candidate.name) {
      invalidToolCall('Browser model returned a tool call without a function name.');
    }
    const tool = offered.get(candidate.name);
    if (!tool) invalidToolCall(`Browser model requested unoffered tool ${JSON.stringify(candidate.name)}.`);
    if (requiredName && candidate.name !== requiredName) {
      invalidToolCall(`Browser model violated tool_choice by requesting ${JSON.stringify(candidate.name)} instead of ${JSON.stringify(requiredName)}.`);
    }

    let args: unknown = candidate.arguments ?? {};
    if (typeof args === 'string') {
      try { args = JSON.parse(args); }
      catch { invalidToolCall(`Browser model returned malformed JSON arguments for ${candidate.name}.`); }
    }
    if (tool.function.parameters) {
      let validate;
      try { validate = ajv.compile(tool.function.parameters); }
      catch { invalidToolCall(`Offered tool ${JSON.stringify(candidate.name)} has an invalid JSON Schema.`); }
      if (!validate(args)) {
        const detail = ajv.errorsText(validate.errors, { separator: '; ' });
        invalidToolCall(`Browser model returned invalid arguments for ${candidate.name}: ${detail}`);
      }
    }

    const id = typeof candidate.id === 'string' && candidate.id
      ? candidate.id
      : `call_browser_${index}_${crypto.randomUUID()}`;
    if (ids.has(id)) invalidToolCall(`Browser model returned duplicate tool-call id ${JSON.stringify(id)}.`);
    ids.add(id);
    return {
      id,
      type: 'function',
      function: { name: candidate.name, arguments: JSON.stringify(args) },
    };
  });
  const content = `${text.slice(0, start)}${text.slice(end + closeTag.length)}`.trim();
  return { content: content || null, toolCalls };
}
