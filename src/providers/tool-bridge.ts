import { Ajv } from 'ajv';
import { BrowserFailure } from '../browser/types.js';
import type { ChatCompletionRequest, ChatToolCall, ChatToolDefinition } from '../types/openai.js';

const TAG_NAME = 'relay_tool_calls';
// Client-neutral: this text is injected into the prompt of every browser
// provider regardless of which harness (Hermes, OpenCode, a generic client)
// issued the request, so it must not name one of them.
const TOOL_BLOCK_HEADER = 'AVAILABLE TOOLS';
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

// A coding agent's tool description is operational instruction, not filler text —
// truncating it produces a tool the model is confidently wrong about how to use.
// Full descriptions are always sent; see budgetTools() for how an oversized
// overall request is handled instead (drop whole tools, never mangle one).
function serializeTool(tool: ChatToolDefinition): unknown {
  return {
    type: tool.type,
    function: {
      name: tool.function.name,
      description: tool.function.description,
      ...(tool.function.parameters ? { parameters: tool.function.parameters } : {}),
    },
  };
}

// Conservative default; not measured against any real provider's composer limit.
// Step 1 of docs/plans/completion-plan.md is expected to replace this with a
// value derived from an actual per-site measurement.
const DEFAULT_TOOL_BLOCK_MAX_CHARS = 20_000;

interface BudgetedTools {
  readonly kept: readonly ChatToolDefinition[];
  readonly dropped: readonly string[];
}

/**
 * Fits as many tools as possible under a character budget by dropping whole
 * tools from the end of the list, never by truncating a kept tool's schema.
 */
function budgetTools(
  tools: readonly ChatToolDefinition[],
  maxChars = Number(process.env.RELAY_TOOL_BLOCK_MAX_CHARS ?? DEFAULT_TOOL_BLOCK_MAX_CHARS),
): BudgetedTools {
  const kept: ChatToolDefinition[] = [];
  const dropped: string[] = [];
  let size = 2; // '[' + ']'
  for (const tool of tools) {
    const serialized = JSON.stringify(serializeTool(tool));
    const addedSize = serialized.length + (kept.length > 0 ? 1 : 0); // comma
    if (kept.length > 0 && size + addedSize > maxChars) {
      dropped.push(tool.function.name);
      continue;
    }
    size += addedSize;
    kept.push(tool);
  }
  return { kept, dropped };
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
  const { kept, dropped } = budgetTools(context.tools);
  if (kept.length === 0) {
    invalidToolCall(
      'The offered tools do not fit this provider\'s prompt budget even one at a time '
      + `(RELAY_TOOL_BLOCK_MAX_CHARS=${process.env.RELAY_TOOL_BLOCK_MAX_CHARS ?? DEFAULT_TOOL_BLOCK_MAX_CHARS}).`,
    );
  }
  const requiredName = selectedToolName(context.toolChoice);
  if (requiredName && !kept.some((tool) => tool.function.name === requiredName)) {
    invalidToolCall(
      `tool_choice requires ${JSON.stringify(requiredName)}, but it was dropped to fit the prompt budget alongside: `
      + `${dropped.filter((n) => n !== requiredName).join(', ') || 'none'}.`,
    );
  }
  const serialized = kept.map(serializeTool);
  const droppedNotice = dropped.length > 0
    ? `\n\nNOTE: ${dropped.length} tool(s) were omitted to fit this request's size budget and are NOT available: `
      + `${dropped.join(', ')}. Do not attempt to call them.`
    : '';
  const choiceInstruction = requiredName
    ? `You must call only the required tool ${JSON.stringify(requiredName)}.`
    : context.toolChoice === 'required'
      ? 'You must return at least one offered tool call.'
      : 'Use an offered tool only when it is needed.';
  return `\n\n${TOOL_BLOCK_HEADER}\n${JSON.stringify(serialized)}${droppedNotice}\n\n` +
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
  // 1. Identify and strip echoed instruction blocks to avoid content leaks
  let cleanText = text;
  const instructionIndex = text.indexOf(TOOL_BLOCK_HEADER);
  if (instructionIndex >= 0) {
    cleanText = text.slice(0, instructionIndex).trim();
  }

  const openTag = `<${TAG_NAME} nonce="${context.nonce}">`;
  const closeTag = `</${TAG_NAME}>`;
  
  // 2. Search for the tags inside the cleaned text
  const start = cleanText.indexOf(openTag);
  const end = cleanText.indexOf(closeTag, start + openTag.length);
  const requiredName = selectedToolName(context.toolChoice);
  const requiresTool = context.toolChoice === 'required' || requiredName !== undefined;

  if (start >= 0 && end < 0) {
    invalidToolCall('Browser model returned an incomplete request-specific tool-call envelope.');
  }
  
  // Check if the open tag is quoted (e.g. wrapped in backticks or markdown quote prefix)
  const isQuoted = start >= 0 && (
    (start > 0 && cleanText[start - 1] === '`') ||
    (start > 2 && cleanText.slice(start - 3, start) === '```') ||
    (start > 0 && cleanText[start - 1] === '"') ||
    (start > 0 && cleanText[start - 1] === "'")
  );

  if (start < 0 || isQuoted) {
    if (requiresTool) {
      invalidToolCall('Browser model did not return the tool call required by tool_choice.');
    }
    return { content: cleanText || null };
  }
  if (context.toolChoice === 'none') {
    invalidToolCall('Browser model returned a tool call while tool_choice was none.');
  }
  if (context.tools.length === 0) {
    invalidToolCall('Browser model returned a tool call although no tools were offered.');
  }

  // 3. Extract the raw JSON
  const raw = cleanText.slice(start + openTag.length, end).trim()
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
  
  const content = `${cleanText.slice(0, start)}${cleanText.slice(end + closeTag.length)}`.trim();
  return { content: content || null, toolCalls };
}
