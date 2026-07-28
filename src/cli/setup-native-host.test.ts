import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNativeHostInstallPlan } from './setup-native-host.js';

const extensionId = 'abcdefghijklmnopabcdefghijklmnop';

test('native host plan uses an executable launcher and handles paths with spaces', async () => {
  const plan = await buildNativeHostInstallPlan(extensionId, {
    platform: 'linux',
    home: '/tmp/home with spaces',
    nodePath: '/opt/Node Runtime/bin/node',
    hostEntry: '/opt/Local Relay/src/extension/host-main.ts',
    tsxImport: '/opt/Local Relay/node_modules/tsx/dist/loader.mjs',
  });

  assert.equal(plan.manifest.path, plan.launcherPath);
  assert.deepEqual(plan.manifest.allowed_origins, [`chrome-extension://${extensionId}/`]);
  assert.match(plan.launcher, /'\/opt\/Node Runtime\/bin\/node'/);
  assert.match(plan.launcher, /--import '\/opt\/Local Relay\/node_modules\/tsx\/dist\/loader\.mjs'/);
  assert.match(plan.launcher, /'\/opt\/Local Relay\/src\/extension\/host-main\.ts'/);
});

test('native host setup fails fast on Windows until a real executable launcher exists', async () => {
  await assert.rejects(
    () => buildNativeHostInstallPlan(extensionId, { platform: 'win32' }),
    /requires a real executable launcher/,
  );
});
