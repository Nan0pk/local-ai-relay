import test from 'node:test';
import { QwenBrowserProvider } from './qwen-browser.js';
import { runBrowserProviderTestMatrix } from './browser-provider-test-matrix.js';

runBrowserProviderTestMatrix('Qwen', 'browser-qwen-free', (driver) => new QwenBrowserProvider(driver));

test('qwen provider module loads', () => { /* placeholder */ });
