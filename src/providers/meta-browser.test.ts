import { MetaBrowserProvider } from './meta-browser.js';
import { runBrowserProviderTestMatrix } from './browser-provider-test-matrix.js';

runBrowserProviderTestMatrix('Meta AI', 'browser-meta-free', (driver) => new MetaBrowserProvider(driver));
