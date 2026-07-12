import type { ChatToolCall, ChatToolDefinition } from '../types/openai.js';

const OPEN_TAG = '<relay_tool_calls>';
const CLOSE_TAG = '</relay_tool_calls>';

export function toolInstructions(tools: ChatToolDefinition[] | undefined): string {
  if (!tools?.length) return '';
  return `\n\nAVAILABLE HERMES TOOLS\n${JSON.stringify(tools, null, 2)}\n\n` +
    'If tools are needed, do not pretend to execute them. Return the calls inside these exact tags:\n' +
    `${OPEN_TAG}\n` +
    '[{"id":"call_unique","name":"tool_name","arguments":{}}]\n' +
    `${CLOSE_TAG}\n` +
    'Arguments must satisfy the supplied JSON schema. You may include a short explanation before the tags. ' +
    'If no tool is needed, answer normally without the tags.';
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

export function parseBrowserResponse(text: string): ParsedBrowserResponse {
  const start = text.indexOf(OPEN_TAG);
  const end = text.indexOf(CLOSE_TAG, start + OPEN_TAG.length);
  if (start < 0 || end < 0) return { content: text };

  const raw = text.slice(start + OPEN_TAG.length, end).trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Browser model returned an invalid tool-call envelope.');
  const toolCalls = parsed.map((candidate: RawToolCall, index): ChatToolCall => {
    if (!candidate || typeof candidate.name !== 'string' || !candidate.name) {
      throw new Error('Browser model returned a tool call without a function name.');
    }
    return {
      id: typeof candidate.id === 'string' && candidate.id ? candidate.id : `call_browser_${index}_${crypto.randomUUID()}`,
      type: 'function',
      function: {
        name: candidate.name,
        arguments: typeof candidate.arguments === 'string'
          ? candidate.arguments
          : JSON.stringify(candidate.arguments ?? {}),
      },
    };
  });
  const content = `${text.slice(0, start)}${text.slice(end + CLOSE_TAG.length)}`.trim();
  return { content: content || null, toolCalls };
}
