import assert from 'node:assert/strict';
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const bootstrapSource = new URL('../bootstrap.sh', import.meta.url);

async function harness(options: { gitRepo?: boolean; origin?: string; pullFails?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'relay-bootstrap-'));
  const target = join(root, 'local-ai-relay');
  const bin = join(root, 'bin');
  await mkdir(bin);
  await mkdir(target);
  await writeFile(join(target, '.env'), 'SECRET=preserve-me\n');
  if (options.gitRepo) await mkdir(join(target, '.git'));
  await writeFile(join(target, 'setup-linux.sh'), '#!/usr/bin/env bash\nexit 0\n');
  await chmod(join(target, 'setup-linux.sh'), 0o755);
  const git = `#!/usr/bin/env bash
if [[ "$1" == "-C" && "$3" == "remote" ]]; then printf '%s\\n' '${options.origin ?? 'https://github.com/Nan0pk/local-ai-relay.git'}'; exit 0; fi
if [[ "$1" == "-C" && "$3" == "pull" ]]; then exit ${options.pullFails ? 1 : 0}; fi
if [[ "$1" == "clone" ]]; then
  mkdir -p "$3/.git"
  printf '#!/usr/bin/env bash\\nexit 0\\n' > "$3/setup-linux.sh"
  chmod +x "$3/setup-linux.sh"
  exit 0
fi
exit 1
`;
  await writeFile(join(bin, 'git'), git);
  await chmod(join(bin, 'git'), 0o755);
  const script = join(root, 'bootstrap.sh');
  await cp(bootstrapSource, script);
  const run = (args: string[] = []) => spawnSync('bash', [script, '--no-browser', ...args], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, RELAY_DIR: target },
  });
  return { root, target, run };
}

test('pull failure preserves the checkout and local environment', async () => {
  const { target, run } = await harness({ gitRepo: true, pullFails: true });
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /preserving the current checkout/i);
  assert.equal(await readFile(join(target, '.env'), 'utf8'), 'SECRET=preserve-me\n');
});

test('non-git target is renamed to a timestamped backup before cloning', async () => {
  const { root, target, run } = await harness();
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const backup = result.stdout.match(/Preserving existing directory as (.+\.backup-[^\s]+)/)?.[1];
  assert.ok(backup?.startsWith(`${target}.backup-`));
  assert.equal(await readFile(join(backup!, '.env'), 'utf8'), 'SECRET=preserve-me\n');
  assert.ok((await readFile(join(root, 'local-ai-relay', 'setup-linux.sh'), 'utf8')).includes('exit 0'));
});

test('--fresh refuses deletion unless --yes is also supplied', async () => {
  const { target, run } = await harness({ gitRepo: true });
  const result = run(['--fresh']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /also requires --yes/);
  assert.equal(await readFile(join(target, '.env'), 'utf8'), 'SECRET=preserve-me\n');
});

test('--fresh --yes is the only path that deletes instead of backing up', async () => {
  const { root, run } = await harness({ gitRepo: true });
  const result = run(['--fresh', '--yes']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--fresh --yes requested: deleting/i);
  assert.equal((await readdir(root)).some((name) => name.startsWith('local-ai-relay.backup-')), false);
});

test('unexpected origin is preserved and never pulled', async () => {
  const { target, run } = await harness({ gitRepo: true, origin: 'https://github.com/attacker/lookalike.git' });
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /unexpected origin/i);
  assert.match(result.stdout, new RegExp(`${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.backup-`));
});
