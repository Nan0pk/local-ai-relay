import test from 'node:test';
import { ZaiBrowserProvider } from './zai-browser.js';
import { runBrowserProviderTestMatrix } from './browser-provider-test-matrix.js';

runBrowserProviderTestMatrix('Z.ai', 'browser-zai-glm-5.2', (driver) => new ZaiBrowserProvider(driver));

test('zai provider module loads', () => { /* placeholder */ });
