import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

test('MV3 manifest.json parses and contains required MV3 fields', async () => {
  const path = join(process.cwd(), 'extension', 'manifest.json');
  const content = await readFile(path, 'utf8');
  const manifest = JSON.parse(content);

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, 'Local AI Relay Sidecar');
  assert.ok(Array.isArray(manifest.permissions));
  assert.ok(manifest.permissions.includes('nativeMessaging'));
  assert.ok(!manifest.permissions.includes('activeTab'));
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.background.service_worker, 'background.js');
  assert.equal(manifest.action.default_popup, 'popup.html');
});

test('background uses the native host handshake instead of a dead HTTP sidecar', async () => {
  const path = join(process.cwd(), 'extension', 'background.js');
  const content = await readFile(path, 'utf8');
  assert.doesNotThrow(() => new Function(content));
  assert.match(content, /chrome\.runtime\.connectNative/);
  assert.match(content, /event_type:\s*'hello'/);
  assert.doesNotMatch(content, /relay-sidecar|127\.0\.0\.1/);
});

test('operator popup is CSP-compatible and sends only an internal heartbeat', async () => {
  const html = await readFile(join(process.cwd(), 'extension', 'popup.html'), 'utf8');
  const script = await readFile(join(process.cwd(), 'extension', 'popup.js'), 'utf8');
  assert.match(html, /<script src="popup\.js"><\/script>/);
  assert.doesNotMatch(html, /<script(?! src=)/);
  assert.doesNotThrow(() => new Function(script));
  assert.match(script, /event_type:\s*'heartbeat'/);
});
