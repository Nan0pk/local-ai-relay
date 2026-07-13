import test from 'node:test';
import { GrokBrowserProvider } from './grok-browser.js';
import { runBrowserProviderTestMatrix } from './browser-provider-test-matrix.js';

runBrowserProviderTestMatrix('Grok', 'browser-grok-free', (driver) => new GrokBrowserProvider(driver));

test('grok provider module loads', () => { /* placeholder */ });
