import { listBrowserProviderNames, findBrowserProvider } from '../src/browser/driver-registry.js';
import { BrowserFailure } from '../src/browser/types.js';

import { classifyProbeError, type ProbeStatus } from '../src/browser/probe-utils.js';

async function probeProvider(name: string): Promise<ProbeStatus> {
  const descriptor = findBrowserProvider(name);
  // Respect user choice or default to headful for bot-sensitive ones (except gemini which is tested headless)
  const isHeadless = process.env.RELAY_BROWSER_HEADLESS === '1' || name === 'gemini';
  const driver = descriptor.factory({
    headless: isHeadless,
    timeoutMs: 15_000,
  });

  try {
    await driver.openForLogin();
    // Wait up to 10 seconds for the composer to be visible
    await driver.waitUntilReady(10_000);
    
    // Try sending a harmless prompt
    const result = await driver.send({
      prompt: 'Reply with exactly: LOCAL AI RELAY READY',
      sessionId: `probe-${name}`,
      resetSession: true,
    });
    
    if (result.text.toUpperCase().includes('READY')) {
      return 'operational';
    }
    return 'layout_changed';
  } catch (error) {
    return classifyProbeError(error);
  } finally {
    await driver.close().catch(() => {});
  }
}

async function main() {
  const names = listBrowserProviderNames();
  console.log(`Probing all ${names.length} providers...\n`);
  
  for (const name of names) {
    console.log(`Probing ${name}...`);
    try {
      const status = await probeProvider(name);
      console.log(`RESULT: ${name} -> ${status}\n`);
    } catch (e) {
      console.log(`RESULT: ${name} -> failed with unexpected error: ${e}\n`);
    }
  }
}

const isMain = import.meta.url.startsWith('file:') && 
  (process.argv[1] === new URL(import.meta.url).pathname || 
   (process.argv[1] && (process.argv[1].endsWith('probe-all.ts') || process.argv[1].endsWith('probe-all.js'))));

if (isMain) {
  main().catch(console.error);
}
