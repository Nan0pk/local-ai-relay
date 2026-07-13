import test from 'node:test';
import { MinimaxBrowserProvider } from './minimax-browser.js';
import { runBrowserProviderTestMatrix } from './browser-provider-test-matrix.js';

runBrowserProviderTestMatrix('MiniMax', 'browser-minimax-m3', (driver) => new MinimaxBrowserProvider(driver));

test('minimax provider module loads', () => { /* placeholder */ });
