import { listBrowserProviderNames, findBrowserProvider } from '../src/browser/driver-registry.js';
import { BrowserFailure } from '../src/browser/types.js';

async function probeProvider(name: string): Promise<string> {
  const descriptor = findBrowserProvider(name);
  const driver = descriptor.factory();
  // Set to headless to probe fast and silently
  Object.assign(driver, {
    options: {
      ...driver['options'],
      headless: true,
      timeoutMs: 15_000,
    }
  });

  try {
    await driver.openForLogin();
    // Wait up to 10 seconds for the composer to be visible
    await driver.waitUntilReady(10_000);
    // If we reach here, the composer was detected!
    // Try sending a harmless prompt
    const result = await driver.send({
      prompt: 'Reply with exactly: LOCAL AI RELAY READY',
      sessionId: `probe-${name}`,
      resetSession: true,
    });
    if (result.text.toUpperCase().includes('READY')) {
      return 'operational';
    }
    return 'incomplete'; // or layout changed
  } catch (error) {
    if (error instanceof BrowserFailure) {
      if (error.kind === 'login_required') {
        return 'login required';
      }
      if (error.kind === 'captcha') {
        return 'blocked by anti-bot protection';
      }
      if (error.kind === 'rate_limit') {
        return 'temporarily unavailable (rate limited)';
      }
      if (error.kind === 'quota_exhausted') {
        return 'temporarily unavailable (quota exhausted)';
      }
      return `incomplete (BrowserFailure: ${error.kind})`;
    }
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('timeout') || message.includes('Timeout')) {
      return 'login required (composer timeout)';
    }
    return `unsupported (Error: ${message.split('\n')[0]})`;
  } finally {
    await driver.close().catch(() => {});
  }
}

async function main() {
  const names = listBrowserProviderNames();
  console.log(`Probing all ${names.length} providers...\n`);
  
  for (const name of names) {
    console.log(`Probing ${name}...`);
    const status = await probeProvider(name);
    console.log(`RESULT: ${name} -> ${status}\n`);
  }
}

main().catch(console.error);
