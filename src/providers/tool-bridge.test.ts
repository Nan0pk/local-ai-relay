import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBrowserResponse, toolInstructions } from './tool-bridge.js';

test('tool instructions include the real Hermes schema and strict envelope', () => {
  const prompt = toolInstructions([{
    type: 'function',
    function: {
      name: 'terminal',
      description: 'Run a command',
      parameters: { type: 'object', properties: { command: { type: 'string' } } },
    },
  }]);
  assert.match(prompt, /"name": "terminal"/);
  assert.match(prompt, /<relay_tool_calls>/);
});

test('browser tool envelope becomes OpenAI tool calls', () => {
  const parsed = parseBrowserResponse(
    'I will inspect it.\n<relay_tool_calls>\n' +
    '[{"id":"call_1","name":"terminal","arguments":{"command":"pwd"}}]\n' +
    '</relay_tool_calls>',
  );
  assert.equal(parsed.content, 'I will inspect it.');
  assert.deepEqual(parsed.toolCalls, [{
    id: 'call_1',
    type: 'function',
    function: { name: 'terminal', arguments: '{"command":"pwd"}' },
  }]);
});

test('ordinary browser text remains ordinary assistant content', () => {
  assert.deepEqual(parseBrowserResponse('Done.'), { content: 'Done.' });
});
