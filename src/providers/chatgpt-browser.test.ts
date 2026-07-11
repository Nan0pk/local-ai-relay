import assert from 'node:assert/strict';
import test from 'node:test';
import type { BrowserChatDriver, BrowserChatRequest } from '../browser/types.js';
import { ChatGptBrowserProvider } from './chatgpt-browser.js';

class FakeDriver implements BrowserChatDriver {
  readonly requests: BrowserChatRequest[] = [];
  closed = false;

  async send(request: BrowserChatRequest) {
    this.requests.push(request);
    return { text: 'Completed the whole batch.' };
  }

  async close() {
    this.closed = true;
  }
}

test('browser provider exposes batch transport metadata and returns OpenAI shape', async () => {
  const driver = new FakeDriver();
  const provider = new ChatGptBrowserProvider(driver);
  const models = provider.listModels();
  assert.equal(models[0]?.id, 'browser-chatgpt-free');
  assert.equal(models[0]?.x_relay?.execution_style, 'batch');

  const response = await provider.complete({
    model: 'browser-chatgpt-free',
    messages: [
      { role: 'user', content: 'Inspect.' },
      { role: 'user', content: 'Implement.' },
    ],
  }, 'browser-chatgpt-free', { sessionId: 'mission-1' });

  assert.equal(driver.requests.length, 1);
  assert.match(driver.requests[0]!.prompt, /Inspect/);
  assert.match(driver.requests[0]!.prompt, /Implement/);
  assert.equal(response.choices[0]?.message.content, 'Completed the whole batch.');
});

test('browser provider closes its driver', async () => {
  const driver = new FakeDriver();
  const provider = new ChatGptBrowserProvider(driver);
  await provider.close();
  assert.equal(driver.closed, true);
});
