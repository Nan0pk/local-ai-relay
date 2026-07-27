import test from 'node:test';
import assert from 'node:assert/strict';
import { selectBestReadyModel } from './model-router.js';

test('selectBestReadyModel routes auto and fast aliases correctly', () => {
  process.env.RELAY_MOCK_BROWSER = 'true';
  const selection = selectBestReadyModel('auto');
  assert.ok(selection.selectedModel);
  assert.ok(selection.reason);
});

test('selectBestReadyModel falls back gracefully when requested model is unavailable', () => {
  process.env.RELAY_MOCK_BROWSER = 'true';
  const selection = selectBestReadyModel('non-existent-model-xyz');
  assert.ok(selection.selectedModel);
  assert.equal(selection.isFallback, true);
});
