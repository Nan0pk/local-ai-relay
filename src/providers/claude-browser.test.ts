import test from 'node:test';
import { ClaudeBrowserProvider } from './claude-browser.js';
import { runBrowserProviderTestMatrix } from './browser-provider-test-matrix.js';

runBrowserProviderTestMatrix('Claude', 'browser-claude-free', (driver) => new ClaudeBrowserProvider(driver));

test('claude provider module loads', () => { /* placeholder so file is not empty if matrix moves */ });
