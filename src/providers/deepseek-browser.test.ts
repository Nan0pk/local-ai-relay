import test from 'node:test';
import { DeepSeekBrowserProvider } from './deepseek-browser.js';
import { runBrowserProviderTestMatrix } from './browser-provider-test-matrix.js';

runBrowserProviderTestMatrix('DeepSeek', 'browser-deepseek-free', (driver) => new DeepSeekBrowserProvider(driver));

test('deepseek provider module loads', () => { /* placeholder */ });
