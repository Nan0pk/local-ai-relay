import test from 'node:test';
import { GeminiBrowserProvider } from './gemini-browser.js';
import { runBrowserProviderTestMatrix } from './browser-provider-test-matrix.js';

runBrowserProviderTestMatrix('Gemini', 'browser-gemini-free', (driver) => new GeminiBrowserProvider(driver));

test('gemini provider module loads', () => { /* placeholder so file is not empty if matrix moves */ });
