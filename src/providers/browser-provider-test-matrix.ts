import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import type { BrowserChatDriver, BrowserChatRequest, BrowserChatResult } from '../browser/types.js';
import { BrowserFailure } from '../browser/types.js';
import type { ChatCompletionRequest } from '../types/openai.js';
import type { Provider } from './types.js';

/**
 * Recording fake driver. Captures every send for assertions and lets each
 * test script the response (or failure) the provider should see.
 */
class FakeDriver implements BrowserChatDriver {
  readonly requests: BrowserChatRequest[] = [];
  closed = false;
  private queue: BrowserChatResult[] = [];
  private error: Error | null = null;

  setResults(results: BrowserChatResult[]): void { this.queue = [...results]; }
  setError(error: Error): void { this.error = error; }

  async send(request: BrowserChatRequest): Promise<BrowserChatResult> {
    this.requests.push(request);
    if (this.error) throw this.error;
    const next = this.queue.shift();
    if (!next) return { text: 'Completed the whole batch.' };
    return next;
  }

  async close(): Promise<void> { this.closed = true; }
}

function userMessage(content: string) { return { role: 'user' as const, content }; }
function basicRequest(modelId: string, messages: ChatCompletionRequest['messages']): ChatCompletionRequest {
  return { model: modelId, messages };
}

/**
 * Run the full 8-scenario test matrix against any browser provider
 * implementation. Every provider adapter (Claude, Gemini, DeepSeek, Z.ai,
 * MiniMax, Kimi, Qwen, Grok, Mistral) shares the same ConversationPlanner +
 * tool-bridge + OpenAI-shape backbone, so this function guarantees they
 * all behave identically.
 */
export function runBrowserProviderTestMatrix(
  providerName: string,
  modelId: string,
  providerFactory: (driver: BrowserChatDriver) => Provider,
): void {
  describe(`${providerName} provider`, () => {
    test('exposes batch transport metadata and the correct model id', () => {
      const provider = providerFactory(new FakeDriver());
      const models = provider.listModels();
      assert.equal(models.length, 1);
      assert.equal(models[0]?.id, modelId);
      assert.equal(models[0]?.owned_by, 'local-ai-relay');
      assert.equal(models[0]?.x_relay?.transport, 'browser');
      assert.equal(models[0]?.x_relay?.execution_style, 'batch');
      assert.equal(models[0]?.x_relay?.supports_sessions, true);
      assert.equal(models[0]?.x_relay?.max_parallel_requests, 1);
    });

    test('submits a full first-turn batch to the driver', async () => {
      const driver = new FakeDriver();
      const provider = providerFactory(driver);
      await provider.complete(basicRequest(modelId, [
        userMessage('Inspect the repository.'),
        userMessage('Implement the fix.'),
      ]), modelId, { sessionId: 'mission-1' });

      assert.equal(driver.requests.length, 1);
      assert.match(driver.requests[0]!.prompt, /^BATCH MISSION/);
      assert.match(driver.requests[0]!.prompt, /Inspect the repository/);
      assert.match(driver.requests[0]!.prompt, /Implement the fix/);
      assert.equal(driver.requests[0]!.sessionId, 'mission-1');
      assert.equal(driver.requests[0]!.resetSession, false);
    });

    test('returns OpenAI-shaped assistant content from driver text', async () => {
      const driver = new FakeDriver();
      driver.setResults([{ text: 'The fix is in src/index.ts.' }]);
      const provider = providerFactory(driver);
      const response = await provider.complete(basicRequest(modelId, [userMessage('Where?')]), modelId, { sessionId: 'extract-1' });
      assert.equal(response.object, 'chat.completion');
      assert.equal(response.model, modelId);
      assert.equal(response.choices[0]?.message.role, 'assistant');
      assert.equal(response.choices[0]?.message.content, 'The fix is in src/index.ts.');
      assert.equal(response.choices[0]?.finish_reason, 'stop');
      assert.ok(response.usage.total_tokens > 0);
    });

    test('sends only the delta on a sticky continuation turn', async () => {
      const driver = new FakeDriver();
      driver.setResults([{ text: 'Original answer.' }]);
      const provider = providerFactory(driver);
      const firstMessages = [userMessage('Original task.')];
      await provider.complete(basicRequest(modelId, firstMessages), modelId, { sessionId: 'cont-1' });
      const second = await provider.complete(
        basicRequest(modelId, [...firstMessages, { role: 'assistant', content: 'Original answer.' }, userMessage('Continue it.')]),
        modelId, { sessionId: 'cont-1' },
      );
      assert.equal(driver.requests.length, 2);
      assert.match(driver.requests[1]!.prompt, /^CONTINUE BATCH MISSION/);
      assert.doesNotMatch(driver.requests[1]!.prompt, /Original task/);
      assert.match(driver.requests[1]!.prompt, /Continue it/);
      assert.equal(driver.requests[1]!.resetSession, false);
      assert.equal(second.choices[0]?.message.content, 'Completed the whole batch.');
    });

    test('includes tool schema on first turn but omits it on continuation', async () => {
      const driver = new FakeDriver();
      const provider = providerFactory(driver);
      const tools = [{
        type: 'function' as const,
        function: { name: 'terminal', description: 'Run a command',
          parameters: { type: 'object', properties: { command: { type: 'string' } } } },
      }];
      const firstMessages = [userMessage('Inspect the repo.')];
      await provider.complete({ ...basicRequest(modelId, firstMessages), tools }, modelId, { sessionId: 'tools-1' });
      assert.match(driver.requests[0]!.prompt, /AVAILABLE HERMES TOOLS/);
      assert.match(driver.requests[0]!.prompt, /"name"\s*:\s*"terminal"/);
      await provider.complete(
        { ...basicRequest(modelId, [...firstMessages, { role: 'assistant', content: 'Completed the whole batch.' }, userMessage('Implement.')]), tools },
        modelId, { sessionId: 'tools-1' },
      );
      assert.match(driver.requests[1]!.prompt, /^CONTINUE BATCH MISSION/);
      assert.doesNotMatch(driver.requests[1]!.prompt, /AVAILABLE HERMES TOOLS/);
    });

    test('translates the relay tool envelope into OpenAI tool_calls', async () => {
      const driver = new FakeDriver();
      driver.setResults([{
        text: 'I will run pwd first.\n<relay_tool_calls>\n[{"id":"call_1","name":"terminal","arguments":{"command":"pwd"}}]\n</relay_tool_calls>',
      }]);
      const provider = providerFactory(driver);
      const response = await provider.complete(basicRequest(modelId, [userMessage('Print pwd.')]), modelId, { sessionId: 'toolcall-1' });
      const choice = response.choices[0]!;
      assert.equal(choice.finish_reason, 'tool_calls');
      assert.deepEqual(choice.message.tool_calls, [{
        id: 'call_1', type: 'function', function: { name: 'terminal', arguments: '{"command":"pwd"}' },
      }]);
      assert.equal(choice.message.content, 'I will run pwd first.');
    });

    test('parses multiple tool calls in one envelope', async () => {
      const driver = new FakeDriver();
      driver.setResults([{
        text: '<relay_tool_calls>\n[{"id":"call_1","name":"terminal","arguments":{"command":"pwd"}},{"id":"call_2","name":"terminal","arguments":{"command":"ls"}}]\n</relay_tool_calls>',
      }]);
      const provider = providerFactory(driver);
      const response = await provider.complete(basicRequest(modelId, [userMessage('Run both.')]), modelId, { sessionId: 'multi-1' });
      assert.equal(response.choices[0]?.message.tool_calls?.length, 2);
      assert.equal(response.choices[0]?.message.tool_calls?.[0]?.function.name, 'terminal');
      assert.equal(response.choices[0]?.message.tool_calls?.[1]?.function.name, 'terminal');
    });

    test('closes its driver and surfaces typed BrowserFailure instead of falling back', async () => {
      const driver = new FakeDriver();
      const provider = providerFactory(driver);
      await provider.close?.();
      assert.equal(driver.closed, true);

      const failingDriver = new FakeDriver();
      failingDriver.setError(new BrowserFailure('rate_limit', `${providerName} reports a rate limit.`));
      const failingProvider = providerFactory(failingDriver);
      await assert.rejects(
        failingProvider.complete(basicRequest(modelId, [userMessage('Hi.')]), modelId, { sessionId: 'fail-1' }),
        (error: unknown) => {
          assert.ok(error instanceof BrowserFailure, 'expected BrowserFailure');
          assert.equal((error as BrowserFailure).kind, 'rate_limit');
          return true;
        },
      );
    });

    test('continues a session after a tool result is supplied', async () => {
      const driver = new FakeDriver();
      driver.setResults([
        { text: '<relay_tool_calls>\n[{"id":"call_1","name":"terminal","arguments":{"command":"pwd"}}]\n</relay_tool_calls>' },
        { text: 'The working directory is /home/z/local-ai-relay.' },
      ]);
      const provider = providerFactory(driver);
      const firstMessages = [userMessage('Print the working directory.')];
      const first = await provider.complete(basicRequest(modelId, firstMessages), modelId, { sessionId: 'recover-1' });
      assert.equal(first.choices[0]?.finish_reason, 'tool_calls');
      const second = await provider.complete(
        basicRequest(modelId, [
          ...firstMessages,
          { role: 'assistant', content: null, tool_calls: first.choices[0]!.message.tool_calls },
          { role: 'tool', content: '/home/z/local-ai-relay', tool_call_id: 'call_1' },
        ]),
        modelId, { sessionId: 'recover-1' },
      );
      assert.equal(driver.requests.length, 2);
      assert.match(driver.requests[1]!.prompt, /^CONTINUE BATCH MISSION/);
      assert.match(driver.requests[1]!.prompt, /\/home\/z\/local-ai-relay/);
      assert.equal(second.choices[0]?.message.content, 'The working directory is /home/z/local-ai-relay.');
    });

    test('returns a single complete response that SSE can chunk', async () => {
      const driver = new FakeDriver();
      driver.setResults([{ text: 'One two three.' }]);
      const provider = providerFactory(driver);
      const response = await provider.complete(basicRequest(modelId, [userMessage('Count to three.')]), modelId, { sessionId: 'sse-1' });
      assert.equal(response.choices.length, 1);
      assert.equal(response.choices[0]?.message.content, 'One two three.');
      assert.equal(response.choices[0]?.finish_reason, 'stop');
      const tokens = response.choices[0]!.message.content!.split(/(\s+)/).filter((s) => s.length > 0);
      assert.ok(tokens.length > 0);
      assert.equal(tokens.join(''), 'One two three.');
    });
  });
}
