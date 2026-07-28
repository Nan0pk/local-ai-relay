import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

test('MV3 manifest.json parses and contains required MV3 fields', async () => {
  const path = join(process.cwd(), 'extension', 'manifest.json');
  const content = await readFile(path, 'utf8');
  const manifest = JSON.parse(content);

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, 'Local AI Relay — Use This Browser');
  assert.ok(Array.isArray(manifest.permissions));
  assert.ok(manifest.permissions.includes('scripting'));
  assert.ok(manifest.permissions.includes('tabs'));
  assert.ok(manifest.permissions.includes('storage'));
  assert.ok(!manifest.permissions.includes('nativeMessaging'));
  assert.ok(!manifest.permissions.includes('activeTab'));
  assert.ok(manifest.host_permissions.includes('http://127.0.0.1/*'));
  assert.ok(manifest.host_permissions.includes('https://chatgpt.com/*'));
  assert.ok(manifest.host_permissions.includes('https://arena.ai/*'));
  assert.equal(manifest.content_scripts[0].js[0], 'pair.js');
  assert.equal(manifest.background.service_worker, 'background.js');
  assert.equal(manifest.action.default_popup, 'popup.html');
});

test('background uses scoped loopback polling and relay-owned provider tabs', async () => {
  const path = join(process.cwd(), 'extension', 'background.js');
  const content = await readFile(path, 'utf8');
  assert.doesNotThrow(() => new Function(content));
  assert.match(content, /browser-extension\/poll/);
  assert.match(content, /chrome\.scripting\.executeScript/);
  assert.match(content, /providerTabs/);
  assert.match(content, /chrome\.tabs\.create/);
  assert.doesNotMatch(content, /connectNative/);
});

test('operator popup is CSP-compatible and exposes pair status and revocation', async () => {
  const html = await readFile(join(process.cwd(), 'extension', 'popup.html'), 'utf8');
  const script = await readFile(join(process.cwd(), 'extension', 'popup.js'), 'utf8');
  assert.match(html, /<script src="popup\.js"><\/script>/);
  assert.doesNotMatch(html, /<script(?! src=)/);
  assert.doesNotThrow(() => new Function(script));
  assert.match(script, /GET_RELAY_STATUS/);
  assert.match(script, /FORGET_RELAY/);
});

test('dashboard pairing content script forwards only same-window loopback messages', async () => {
  const script = await readFile(join(process.cwd(), 'extension', 'pair.js'), 'utf8');
  assert.doesNotThrow(() => new Function(script));
  assert.match(script, /event\.source !== window/);
  assert.match(script, /event\.origin !== location\.origin/);
  assert.match(script, /location\.pathname !== '\/ui'/);
  assert.match(script, /\$\{event\.data\.type\}_RESULT/);
});
