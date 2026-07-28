import { harnessManager } from '../harness/manager.js';

function usage(): void {
  console.log(`Local AI Relay integration removal

This removes only relay-owned Hermes/OpenCode configuration and revokes every
relay-issued harness key. It preserves provider browser profiles, logs, the
relay installation, and all unrelated harness settings.

Preview:
  npm run integrations:remove

Apply:
  npm run integrations:remove -- --yes`);
}

async function main(): Promise<void> {
  const apply = process.argv.slice(2).includes('--yes');
  usage();
  if (!apply) {
    console.log('\nPreview only. Nothing was changed.');
    return;
  }

  const before = await harnessManager.list();
  const connected = before.filter((item) => item.connected);
  if (!connected.length) {
    console.log('\nNo relay harness integrations are currently connected.');
    return;
  }

  console.log(`\nRemoving: ${connected.map((item) => item.label).join(', ')}`);
  const after = await harnessManager.disconnectAll();
  const remaining = after.filter((item) => item.connected);
  if (remaining.length) {
    throw new Error(
      `Some relay configuration still needs manual cleanup: ${remaining.map((item) => item.label).join(', ')}. Open Activity & errors for the exact file and cause.`,
    );
  }
  console.log('PASS: relay-owned harness configuration was removed and harness keys were revoked.');
}

main().catch((error: unknown) => {
  console.error(`REMOVE FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
