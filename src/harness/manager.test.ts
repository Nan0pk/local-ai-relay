import assert from 'node:assert/strict';
import { readFile, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parse, stringify } from 'yaml';
import { HarnessTokenRegistry } from '../auth/harness-tokens.js';
import { HarnessManager } from './manager.js';

test('harness manager connects and cleanly removes only relay-owned configuration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'relay-harness-manager-'));
  const hermesHome = join(root, 'hermes');
  const openCodePath = join(root, 'opencode.json');
  const previousHermes = process.env.HERMES_HOME;
  const previousOpenCode = process.env.OPENCODE_CONFIG;
  process.env.HERMES_HOME = hermesHome;
  process.env.OPENCODE_CONFIG = openCodePath;
  const manager = new HarnessManager(
    join(root, 'ledger.json'),
    new HarnessTokenRegistry(join(root, 'tokens.json')),
  );
  try {
    await import('node:fs/promises').then(({ mkdir }) => mkdir(hermesHome, { recursive: true }));
    await writeFile(
      join(hermesHome, 'config.yaml'),
      'theme: dark\nmodel:\n  provider: original\n  default: original-model\n',
    );
    await writeFile(
      openCodePath,
      JSON.stringify({ theme: 'dark', provider: { existing: { name: 'Existing' } } }),
    );

    const hermes = await manager.connect('hermes', 'http://127.0.0.1:8787/v1');
    const openCode = await manager.connect('opencode', 'http://127.0.0.1:8787/v1');
    assert.equal(hermes.status.connected, true);
    assert.equal(openCode.status.connected, true);
    assert.ok(hermes.backupPath);
    assert.ok(openCode.backupPath);

    await manager.connect('hermes', 'http://127.0.0.1:8787/v1');
    await manager.connect('hermes', 'http://127.0.0.1:8787/v1');
    await manager.connect('hermes', 'http://127.0.0.1:8787/v1');
    assert.equal(
      (await readdir(hermesHome)).filter((name) => name.startsWith('config.yaml.backup-')).length,
      3,
    );

    await manager.disconnectAll();
    const restoredHermes = parse(await readFile(join(hermesHome, 'config.yaml'), 'utf8'));
    const restoredOpenCode = JSON.parse(await readFile(openCodePath, 'utf8'));
    assert.equal(restoredHermes.theme, 'dark');
    assert.deepEqual(restoredHermes.model, { provider: 'original', default: 'original-model' });
    assert.equal(restoredHermes.custom_providers, undefined);
    assert.equal(restoredOpenCode.theme, 'dark');
    assert.deepEqual(restoredOpenCode.provider, { existing: { name: 'Existing' } });
    assert.ok((await manager.list()).every((status) => !status.connected));
  } finally {
    if (previousHermes === undefined) delete process.env.HERMES_HOME;
    else process.env.HERMES_HOME = previousHermes;
    if (previousOpenCode === undefined) delete process.env.OPENCODE_CONFIG;
    else process.env.OPENCODE_CONFIG = previousOpenCode;
  }
});

test('repairs relay-owned Hermes and OpenCode configs to the active port while preserving unrelated entries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'relay-harness-repair-'));
  const hermesHome = join(root, 'hermes');
  const openCodePath = join(root, 'opencode.json');
  const oldHermes = process.env.HERMES_HOME;
  const oldOpenCode = process.env.OPENCODE_CONFIG;
  process.env.HERMES_HOME = hermesHome;
  process.env.OPENCODE_CONFIG = openCodePath;
  const tokens = new HarnessTokenRegistry(join(root, 'tokens.json'));
  const manager = new HarnessManager(join(root, 'ledger.json'), tokens);
  try {
    await import('node:fs/promises').then(({ mkdir }) => mkdir(hermesHome, { recursive: true }));
    await writeFile(join(hermesHome, 'config.yaml'), 'custom_providers:\n  - name: local-ai-relay\n    base_url: http://127.0.0.1:8787/v1\n    api_key: placeholder\n    api_mode: codex_responses\n    models: {}\n  - name: unrelated\n    base_url: http://other/v1\n');
    await writeFile(openCodePath, JSON.stringify({ provider: { unrelated: { options: { baseURL: 'http://other/v1' } } } }));
    await manager.connect('hermes', 'http://127.0.0.1:8787/v1');
    await manager.connect('opencode', 'http://127.0.0.1:8787/v1');
    const hermesConfig = parse(await readFile(join(hermesHome, 'config.yaml'), 'utf8'));
    const openConfig = JSON.parse(await readFile(openCodePath, 'utf8'));
    hermesConfig.custom_providers[0].base_url = 'http://127.0.0.1:8787/v1';
    hermesConfig.custom_providers[0].api_mode = 'codex_responses';
    await writeFile(join(hermesHome, 'config.yaml'), stringify(hermesConfig));
    openConfig.provider['local-ai-relay'].options.baseURL = 'http://127.0.0.1:8787/v1';
    await writeFile(openCodePath, JSON.stringify(openConfig));
    const repaired = await manager.repairOwnedConfigurations({ activePort: 8788 });
    assert.deepEqual(repaired.sort(), ['hermes', 'opencode']);
    const repairedHermes = parse(await readFile(join(hermesHome, 'config.yaml'), 'utf8'));
    const repairedOpen = JSON.parse(await readFile(openCodePath, 'utf8'));
    assert.equal(repairedHermes.custom_providers.find((p: Record<string, unknown>) => p.name === 'local-ai-relay').base_url, 'http://127.0.0.1:8788/v1');
    assert.equal(repairedHermes.custom_providers.find((p: Record<string, unknown>) => p.name === 'local-ai-relay').api_mode, 'chat_completions');
    assert.equal(repairedHermes.custom_providers.find((p: Record<string, unknown>) => p.name === 'unrelated').base_url, 'http://other/v1');
    assert.equal(repairedOpen.provider['local-ai-relay'].options.baseURL, 'http://127.0.0.1:8788/v1');
    assert.equal(repairedOpen.provider.unrelated.options.baseURL, 'http://other/v1');
    assert.equal(tokens.verify(repairedHermes.custom_providers.find((p: Record<string, unknown>) => p.name === 'local-ai-relay').api_key as string), true);
    assert.equal(tokens.verify(repairedOpen.provider['local-ai-relay'].options.apiKey as string), true);
  } finally {
    if (oldHermes === undefined) delete process.env.HERMES_HOME; else process.env.HERMES_HOME = oldHermes;
    if (oldOpenCode === undefined) delete process.env.OPENCODE_CONFIG; else process.env.OPENCODE_CONFIG = oldOpenCode;
  }
});

test('generic harness receives a dedicated token which is revoked on disconnect', async () => {
  const root = await mkdtemp(join(tmpdir(), 'relay-generic-manager-'));
  const tokens = new HarnessTokenRegistry(join(root, 'tokens.json'));
  const manager = new HarnessManager(join(root, 'ledger.json'), tokens);
  const result = await manager.connect('generic', 'http://127.0.0.1:8787/v1');
  assert.equal(result.status.connected, true);
  assert.equal(tokens.verify(result.token!), true);
  await manager.disconnect('generic');
  assert.equal(tokens.verify(result.token!), false);
});

test('a failed reconnect preserves the previously working harness token', async () => {
  const root = await mkdtemp(join(tmpdir(), 'relay-harness-transaction-'));
  const openCodePath = join(root, 'opencode.json');
  const previousOpenCode = process.env.OPENCODE_CONFIG;
  process.env.OPENCODE_CONFIG = openCodePath;
  const tokens = new HarnessTokenRegistry(join(root, 'tokens.json'));
  const manager = new HarnessManager(join(root, 'ledger.json'), tokens);
  try {
    await writeFile(openCodePath, '{}');
    await manager.connect('opencode', 'http://127.0.0.1:8787/v1');
    const connected = JSON.parse(await readFile(openCodePath, 'utf8'));
    const oldToken = connected.provider['local-ai-relay'].options.apiKey;
    assert.equal(tokens.verify(oldToken), true);

    await writeFile(openCodePath, '{ invalid json');
    await assert.rejects(
      manager.connect('opencode', 'http://127.0.0.1:8787/v1'),
      /JSON/,
    );
    assert.equal(tokens.verify(oldToken), true);
  } finally {
    if (previousOpenCode === undefined) delete process.env.OPENCODE_CONFIG;
    else process.env.OPENCODE_CONFIG = previousOpenCode;
  }
});
