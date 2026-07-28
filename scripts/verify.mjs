#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const checks = [
  [npm, ['audit', '--omit=dev', '--audit-level=high'], 'production dependency audit'],
  [npm, ['run', 'typecheck'], 'TypeScript'],
  [npm, ['test'], 'unit and integration tests'],
  [npm, ['run', 'test:e2e'], 'deterministic E2E'],
  [npm, ['run', 'build'], 'production build'],
  [npm, ['run', 'smoke:startup'], 'startup smoke'],
  [npm, ['run', 'test:delivery'], 'delivery tests'],
  [process.execPath, ['scripts/validate-release.mjs'], 'release contract'],
];

for (const [command, args, label] of checks) {
  process.stdout.write(`\n==> ${label}\n`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(`FAIL: ${label}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`FAIL: ${label} exited with code ${result.status ?? 'unknown'}.`);
    process.exit(result.status ?? 1);
  }
}

process.stdout.write('\nPASS: all deterministic verification checks completed.\n');
