import assert from 'node:assert/strict';
import test from 'node:test';
import type { BrowserChatDriver, BrowserChatRequest, BrowserChatResult } from '../browser/types.js';
import { BrowserFailure } from '../browser/types.js';
import { ClaudeBrowserProvider } from './claude-browser.js';
import type { ChatCompletionRequest } from '../types/openai.js';

/**
 * Recording fake driver. Captures every send for assertions and lets each
 * test script the response (or failure) the provider should see.
 */
class FakeDriver implements BrowserChatDriver {
  readonly requests: BrowserChatRequest[] = [];
  closed = false;
  private queue: BrowserChatResult[] = [];
  private error: Error | null = null;

  setResults(results: BrowserChatResult[]): void {
    this.queue = [...results];
  }

  setError(error: Error): void {
    this.error = error;
  }

  async send(request: BrowserChatRequest): Promise<BrowserChatResult> {
    this.requests.push(request);
    if (this.error) throw this.error;
    const next = this.queue.shift();
    if (!next) return { text: 'Completed the whole batch.' };
    return next;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

function userMessage(content: string) {
  return { role: 'user' as const, content };
}

function basicRequest(messages: ChatCompletionRequest['messages']): ChatCompletionRequest {
  return { model: 'browser-claude-free', messages };
}

// 1. Model metadata
test('claude provider exposes batch transport metadata and the browser-claude-free id', () => {
  const provider = new ClaudeBrowserProvider(new FakeDriver());
  const models = provider.listModels();
  assert.equal(models.length, 1);
  assert.equal(models[0]?.id, 'browser-claude-free');
  assert.equal(models[0]?.owned_by, 'local-ai-relay');
  assert.equal(models[0]?.x_relay?.transport, 'browser');
  assert.equal(models[0]?.x_relay?.execution_style, 'batch');
  assert.equal(models[0]?.x_relay?.supports_sessions, true);
  assert.equal(models[0]?.x_relay?.max_parallel_requests, 1);
});

// 2. Prompt submission
test('claude provider submits a full first-turn batch to the driver', async () => {
  const driver = new FakeDriver();
  const provider = new ClaudeBrowserProvider(driver);
  await provider.complete(basicRequest([
    userMessage('Inspect the repository.'),
    userMessage('Implement the fix.'),
  ]), 'browser-claude-free', { sessionId: 'mission-1' });

  assert.equal(driver.requests.length, 1);
  assert.match(driver.requests[0]!.prompt, /^BATCH MISSION/);
  assert.match(driver.requests[0]!.prompt, /Inspect the repository/);
  assert.match(driver.requests[0]!.prompt, /Implement the fix/);
  assert.equal(driver.requests[0]!.sessionId, 'mission-1');
  assert.equal(driver.requests[0]!.resetSession, false);
});

// 3. Response extraction
test('claude provider returns OpenAI-shaped assistant content from driver text', async () => {
  const driver = new FakeDriver();
  driver.setResults([{ text: 'Claude response: the fix is in src/index.ts.' }]);
  const provider = new ClaudeBrowserProvider(driver);

  const response = await provider.complete(
    basicRequest([userMessage('Where is the fix?')]),
    'browser-claude-free',
    { sessionId: 'extract-1' },
  );

  assert.equal(response.object, 'chat.completion');
  assert.equal(response.model, 'browser-claude-free');
  assert.equal(response.choices[0]?.message.role, 'assistant');
  assert.equal(response.choices[0]?.message.content, 'Claude response: the fix is in src/index.ts.');
  assert.equal(response.choices[0]?.finish_reason, 'stop');
  assert.ok(response.usage.total_tokens > 0);
});

// 4. Session continuation
test('claude provider sends only the delta on a sticky continuation turn', async () => {
  const driver = new FakeDriver();
  driver.setResults([{ text: 'Original answer.' }]);
  const provider = new ClaudeBrowserProvider(driver);

  const firstMessages = [userMessage('Original task.')];
  await provider.complete(basicRequest(firstMessages), 'browser-claude-free', { sessionId: 'cont-1' });

  const second = await provider.complete(
    basicRequest([
      ...firstMessages,
      { role: 'assistant', content: 'Original answer.' },
      userMessage('Continue it.'),
    ]),
    'browser-claude-free',
    { sessionId: 'cont-1' },
  );

  assert.equal(driver.requests.length, 2);
  assert.match(driver.requests[1]!.prompt, /^CONTINUE BATCH MISSION/);
  assert.doesNotMatch(driver.requests[1]!.prompt, /Original task/);
  assert.match(driver.requests[1]!.prompt, /Continue it/);
  assert.equal(driver.requests[1]!.resetSession, false);
  assert.equal(second.choices[0]?.message.content, 'Completed the whole batch.');
});

// 5. Tool-schema omission on continuation turns
test('claude provider includes tool schema on first turn but omits it on continuation', async () => {
  const driver = new FakeDriver();
  const provider = new ClaudeBrowserProvider(driver);
  const tools = [{
    type: 'function' as const,
    function: {
      name: 'terminal',
      description: 'Run a command',
      parameters: { type: 'object', properties: { command: { type: 'string' } } },
    },
  }];

  const firstMessages = [userMessage('Inspect the repo.')];
  await provider.complete({ ...basicRequest(firstMessages), tools }, 'browser-claude-free', { sessionId: 'tools-1' });
  assert.match(driver.requests[0]!.prompt, /AVAILABLE HERMES TOOLS/);
  assert.match(driver.requests[0]!.prompt, /"name"\s*:\s*"terminal"/);

  await provider.complete(
    { ...basicRequest([...firstMessages, { role: 'assistant', content: 'Completed the whole batch.' }, userMessage('Implement.')]), tools },
    'browser-claude-free',
    { sessionId: 'tools-1' },
  );
  assert.match(driver.requests[1]!.prompt, /^CONTINUE BATCH MISSION/);
  assert.doesNotMatch(driver.requests[1]!.prompt, /AVAILABLE HERMES TOOLS/);
});

// 6. Tool-call parsing
test('claude provider translates the relay tool envelope into OpenAI tool_calls', async () => {
  const driver = new FakeDriver();
  driver.setResults([{
    text: 'I will run pwd first.\n<relay_tool_calls>\n'
      + '[{"id":"call_1","name":"terminal","arguments":{"command":"pwd"}}]\n'
      + '</relay_tool_calls>',
  }]);
  const provider = new ClaudeBrowserProvider(driver);

  const response = await provider.complete(
    basicRequest([userMessage('Print the working directory.')]),
    'browser-claude-free',
    { sessionId: 'toolcall-1' },
  );

  const choice = response.choices[0]!;
  assert.equal(choice.finish_reason, 'tool_calls');
  assert.deepEqual(choice.message.tool_calls, [{
    id: 'call_1',
    type: 'function',
    function: { name: 'terminal', arguments: '{"command":"pwd"}' },
  }]);
  assert.equal(choice.message.content, 'I will run pwd first.');
});

test('claude provider parses multiple tool calls in one envelope', async () => {
  const driver = new FakeDriver();
  driver.setResults([{
    text: '<relay_tool_calls>\n'
      + '[{"id":"call_1","name":"terminal","arguments":{"command":"pwd"}},'
      + '{"id":"call_2","name":"terminal","arguments":{"command":"ls"}}]\n'
      + '</relay_tool_calls>',
  }]);
  const provider = new ClaudeBrowserProvider(driver);

  const response = await provider.complete(
    basicRequest([userMessage('Run both.')]),
    'browser-claude-free',
    { sessionId: 'multi-1' },
  );

  assert.equal(response.choices[0]?.message.tool_calls?.length, 2);
  assert.equal(response.choices[0]?.message.tool_calls?.[0]?.function.name, 'terminal');
  assert.equal(response.choices[0]?.message.tool_calls?.[1]?.function.name, 'terminal');
});

// 7. Cleanup and recovery
test('claude provider closes its driver', async () => {
  const driver = new FakeDriver();
  const provider = new ClaudeBrowserProvider(driver);
  await provider.close();
  assert.equal(driver.closed, true);
});

test('claude provider surfaces a typed BrowserFailure instead of silently falling back', async () => {
  const driver = new FakeDriver();
  driver.setError(new BrowserFailure('rate_limit', 'Claude reports a rate limit.'));
  const provider = new ClaudeBrowserProvider(driver);

  await assert.rejects(
    provider.complete(basicRequest([userMessage('Hi.')]), 'browser-claude-free', { sessionId: 'fail-1' }),
    (error: unknown) => {
      assert.ok(error instanceof BrowserFailure, 'expected BrowserFailure');
      assert.equal((error as BrowserFailure).kind, 'rate_limit');
      return true;
    },
  );
});

test('claude provider continues a session after a tool result is supplied', async () => {
  const driver = new FakeDriver();
  driver.setResults([
    { text: '<relay_tool_calls>\n[{"id":"call_1","name":"terminal","arguments":{"command":"pwd"}}]\n</relay_tool_calls>' },
    { text: 'The working directory is /home/z/local-ai-relay.' },
  ]);
  const provider = new ClaudeBrowserProvider(driver);

  const firstMessages = [userMessage('Print the working directory.')];
  const first = await provider.complete(
    basicRequest(firstMessages),
    'browser-claude-free',
    { sessionId: 'recover-1' },
  );
  assert.equal(first.choices[0]?.finish_reason, 'tool_calls');

  const second = await provider.complete(
    basicRequest([
      ...firstMessages,
      { role: 'assistant', content: null, tool_calls: first.choices[0]!.message.tool_calls },
      { role: 'tool', content: '/home/z/local-ai-relay', tool_call_id: 'call_1' },
    ]),
    'browser-claude-free',
    { sessionId: 'recover-1' },
  );

  assert.equal(driver.requests.length, 2);
  assert.match(driver.requests[1]!.prompt, /^CONTINUE BATCH MISSION/);
  assert.match(driver.requests[1]!.prompt, /\/home\/z\/local-ai-relay/);
  assert.equal(second.choices[0]?.message.content, 'The working directory is /home/z/local-ai-relay.');
});

// 8. SSE reconstruction (validated through the route layer; here we verify
//    that the provider returns a single complete response object that the
//    route can split into SSE chunks and terminate with [DONE]).
test('claude provider returns a single complete response that SSE can chunk', async () => {
  const driver = new FakeDriver();
  driver.setResults([{ text: 'One two three.' }]);
  const provider = new ClaudeBrowserProvider(driver);

  const response = await provider.complete(
    basicRequest([userMessage('Count to three.')]),
    'browser-claude-free',
    { sessionId: 'sse-1' },
  );

  assert.equal(response.choices.length, 1);
  assert.equal(response.choices[0]?.message.content, 'One two three.');
  assert.equal(response.choices[0]?.finish_reason, 'stop');
  // The route layer reconstructs SSE by splitting content on whitespace;
  // verify that pattern yields a finite, reassemblable token list.
  const tokens = response.choices[0]!.message.content!.split(/(\s+)/).filter((s) => s.length > 0);
  assert.ok(tokens.length > 0);
  assert.equal(tokens.join(''), 'One two three.');
});
