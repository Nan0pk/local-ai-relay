import test from 'node:test';
import { KimiBrowserProvider } from './kimi-browser.js';
import { runBrowserProviderTestMatrix } from './browser-provider-test-matrix.js';

runBrowserProviderTestMatrix('Kimi', 'browser-kimi-free', (driver) => new KimiBrowserProvider(driver));

test('kimi provider module loads', () => { /* placeholder */ });
