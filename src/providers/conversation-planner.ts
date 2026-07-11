import type { ChatRoleMessage } from '../types/openai.js';

interface SessionState {
  messages: ChatRoleMessage[];
}

export interface ConversationPlan {
  prompt: string;
  resetSession: boolean;
  remember(completion: string): void;
}

function sameMessage(a: ChatRoleMessage, b: ChatRoleMessage): boolean {
  return a.role === b.role && a.content === b.content && a.name === b.name;
}

function beginsWith(messages: ChatRoleMessage[], prefix: ChatRoleMessage[]): boolean {
  return prefix.length <= messages.length && prefix.every((message, index) => sameMessage(message, messages[index]!));
}

function renderMessages(messages: ChatRoleMessage[]): string {
  return messages.map((message, index) => {
    const label = message.name ? `${message.role}:${message.name}` : message.role;
    return `### ${index + 1}. ${label.toUpperCase()}\n${message.content}`;
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

  plan(messages: ChatRoleMessage[], sessionId?: string): ConversationPlan {
    const previous = sessionId ? this.sessions.get(sessionId) : undefined;
    const canContinue = previous !== undefined && beginsWith(messages, previous.messages);
    const selected = canContinue ? messages.slice(previous.messages.length) : messages;
    const prompt = batchPacket(selected.length > 0 ? selected : messages.slice(-1), canContinue);

    return {
      prompt,
      resetSession: previous !== undefined && !canContinue,
      remember: (completion: string) => {
        if (!sessionId) return;
        this.sessions.set(sessionId, {
          messages: [...messages, { role: 'assistant', content: completion }],
        });
      },
    };
  }
}

export { batchPacket };
