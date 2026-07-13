import test from 'node:test';
import { MistralBrowserProvider } from './mistral-browser.js';
import { runBrowserProviderTestMatrix } from './browser-provider-test-matrix.js';

runBrowserProviderTestMatrix('Mistral', 'browser-mistral-free', (driver) => new MistralBrowserProvider(driver));

test('mistral provider module loads', () => { /* placeholder */ });
