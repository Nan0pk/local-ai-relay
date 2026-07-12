import type { ChatRoleMessage } from '../types/openai.js';

interface SessionState {
  messages: ChatRoleMessage[];
}

export interface ConversationPlan {
  prompt: string;
  resetSession: boolean;
  sessionId: string;
  remember(completion: ChatRoleMessage): void;
}

function sameMessage(a: ChatRoleMessage, b: ChatRoleMessage): boolean {
  return a.role === b.role
    && a.content === b.content
    && a.name === b.name
    && a.tool_call_id === b.tool_call_id
    && JSON.stringify(a.tool_calls ?? []) === JSON.stringify(b.tool_calls ?? []);
}

function beginsWith(messages: ChatRoleMessage[], prefix: ChatRoleMessage[]): boolean {
  return prefix.length <= messages.length && prefix.every((message, index) => sameMessage(message, messages[index]!));
}

function renderMessages(messages: ChatRoleMessage[]): string {
  return messages
    .filter((m) => m.role !== 'system')
    .map((message, index) => {
      const label = message.name ? `${message.role}:${message.name}` : message.role;
      const parts = [`### ${index + 1}. ${label.toUpperCase()}`, message.content ?? ''];
      if (message.tool_calls?.length) parts.push(`TOOL CALLS:\n${JSON.stringify(message.tool_calls, null, 2)}`);
      if (message.tool_call_id) parts.push(`TOOL CALL ID: ${message.tool_call_id}`);
      return parts.join('\n');
    }).join('\n\n');
}

function batchPacket(messages: ChatRoleMessage[], continuation: boolean): string {
  const heading = continuation ? 'CONTINUE BATCH MISSION' : 'BATCH MISSION';
  return `${heading}\n\n` +
    'Work through the related instructions below as one substantial unit of work. ' +
    'Respect their order and dependencies. Return one complete response with decisions, results, ' +
    'and any blockers. Do not ask for confirmation unless an instruction is genuinely unsafe or impossible.\n\n' +
    renderMessages(messages);
}

export class ConversationPlanner {
  private readonly sessions = new Map<string, SessionState>();

  private findContinuation(messages: ChatRoleMessage[]): [string, SessionState] | undefined {
    return [...this.sessions.entries()]
      .filter(([, state]) => beginsWith(messages, state.messages))
      .sort((a, b) => b[1].messages.length - a[1].messages.length)[0];
  }

  plan(messages: ChatRoleMessage[], sessionId?: string): ConversationPlan {
    const matched = sessionId
      ? (this.sessions.has(sessionId) ? [sessionId, this.sessions.get(sessionId)!] as const : undefined)
      : this.findContinuation(messages);
    const resolvedSessionId = matched?.[0] ?? sessionId ?? `auto-${crypto.randomUUID()}`;
    const previous = matched?.[1];
    const canContinue = previous !== undefined && beginsWith(messages, previous.messages);
    const selected = canContinue ? messages.slice(previous.messages.length) : messages;
    const prompt = batchPacket(selected.length > 0 ? selected : messages.slice(-1), canContinue);

    return {
      prompt,
      resetSession: previous !== undefined && !canContinue,
      sessionId: resolvedSessionId,
      remember: (completion: ChatRoleMessage) => {
        this.sessions.delete(resolvedSessionId);
        this.sessions.set(resolvedSessionId, {
          messages: [...messages, completion],
        });
        while (this.sessions.size > 8) this.sessions.delete(this.sessions.keys().next().value!);
      },
    };
  }
}

export { batchPacket };
