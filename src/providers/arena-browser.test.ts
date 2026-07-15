import test from 'node:test';
import { ArenaBrowserProvider } from './arena-browser.js';
import { runBrowserProviderTestMatrix } from './browser-provider-test-matrix.js';

runBrowserProviderTestMatrix('Arena', 'browser-arena-free', (driver) => new ArenaBrowserProvider(driver));

test('arena provider module loads', () => { /* placeholder so file is not empty if matrix moves */ });
