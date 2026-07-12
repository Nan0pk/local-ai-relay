import assert from 'node:assert/strict';
import test from 'node:test';
import { ConversationPlanner, batchPacket } from './conversation-planner.js';

test('batchPacket combines related instructions into one mission', () => {
  const packet = batchPacket([
    { role: 'system', content: 'Work carefully.' },
    { role: 'user', content: 'Inspect the repository.' },
    { role: 'user', content: 'Then implement the fix.' },
  ], false);

  assert.match(packet, /^BATCH MISSION/);
  assert.match(packet, /Inspect the repository/);
  assert.match(packet, /Then implement the fix/);
});

test('planner sends only the delta when a sticky session continues', () => {
  const planner = new ConversationPlanner();
  const firstMessages = [{ role: 'user' as const, content: 'Inspect the repository.' }];
  const first = planner.plan(firstMessages, 'task-1');
  first.remember({ role: 'assistant', content: 'Inspection complete.' });

  const second = planner.plan([
    ...firstMessages,
    { role: 'assistant', content: 'Inspection complete.' },
    { role: 'user', content: 'Implement the fix.' },
  ], 'task-1');

  assert.equal(second.resetSession, false);
  assert.match(second.prompt, /^CONTINUE BATCH MISSION/);
  assert.doesNotMatch(second.prompt, /Inspect the repository/);
  assert.match(second.prompt, /Implement the fix/);
});

test('planner resets a session when its history forks', () => {
  const planner = new ConversationPlanner();
  const first = planner.plan([{ role: 'user', content: 'Original task.' }], 'task-1');
  first.remember({ role: 'assistant', content: 'Original answer.' });

  const fork = planner.plan([{ role: 'user', content: 'Different task.' }], 'task-1');
  assert.equal(fork.resetSession, true);
  assert.match(fork.prompt, /^BATCH MISSION/);
});

test('automatically continues matching OpenAI history without a custom header', () => {
  const planner = new ConversationPlanner();
  const first = planner.plan([{ role: 'user', content: 'Unique initial mission.' }]);
  first.remember({ role: 'assistant', content: 'Initial result.' });

  const next = planner.plan([
    { role: 'user', content: 'Unique initial mission.' },
    { role: 'assistant', content: 'Initial result.' },
    { role: 'user', content: 'Continue it.' },
  ]);
  assert.equal(next.sessionId, first.sessionId);
  assert.match(next.prompt, /^CONTINUE BATCH MISSION/);
  assert.doesNotMatch(next.prompt, /Unique initial mission/);
});
