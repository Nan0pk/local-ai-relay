import assert from 'node:assert/strict';
import test from 'node:test';
import { hermesConfigCommands } from './config.js';

test('Hermes configuration uses its documented custom OpenAI-compatible provider shape', () => {
  assert.deepEqual(hermesConfigCommands('http://127.0.0.1:8788/v1'), [
    { path: 'model.provider', value: 'custom' },
    { path: 'model.default', value: 'browser-chatgpt-free' },
    { path: 'model.base_url', value: 'http://127.0.0.1:8788/v1' },
    { path: 'model.api_mode', value: 'chat_completions' },
  ]);
});
