import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listBrowserProviderNames } from '../src/browser/driver-registry.js';
import { runLiveProbe } from '../src/cli/live-probe.js';
import { classifyProbeError, type ProbeStatus } from '../src/browser/probe-utils.js';

export async function probeAllProviders(
  names = listBrowserProviderNames(),
  probe = runLiveProbe,
): Promise<{ passed: string[]; failed: Array<{ provider: string; status: ProbeStatus; error: string }> }> {
  const passed: string[] = [];
  const failed: Array<{ provider: string; status: ProbeStatus; error: string }> = [];

  console.log(`Verifying ${names.length} browser providers sequentially.`);
  console.log('Each provider opens its isolated profile. Sign in normally if prompted; the probe then continues automatically.\n');

  for (const [index, name] of names.entries()) {
    console.log(`\n[${index + 1}/${names.length}] ${name}`);
    try {
      await probe(name);
      passed.push(name);
    } catch (error) {
      const status = classifyProbeError(error);
      const message = error instanceof Error ? error.message : String(error);
      console.error(`FAIL: ${name}: [${status}] ${message}`);
      failed.push({ provider: name, status, error: message });
    }
  }

  console.log('\nBrowser provider verification summary');
  console.log(`PASS (${passed.length}): ${passed.join(', ') || 'none'}`);
  console.log(`FAIL (${failed.length}): ${failed.map(({ provider, status }) => `${provider} [${status}]`).join(', ') || 'none'}`);
  return { passed, failed };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  probeAllProviders()
    .then(({ failed }) => {
      if (failed.length > 0) process.exitCode = 1;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
