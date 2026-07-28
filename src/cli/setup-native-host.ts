#!/usr/bin/env node
import { access, chmod, mkdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir, platform as currentPlatform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST_NAME = 'com.local_ai_relay.host';

export interface NativeHostInstallPlan {
  manifestPath: string;
  launcherPath: string;
  manifest: {
    name: string;
    description: string;
    path: string;
    type: 'stdio';
    allowed_origins: string[];
  };
  launcher: string;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function extensionIdFrom(args: string[]): string {
  const value = args.find((argument) => argument.startsWith('--extension-id='))
    ?.slice('--extension-id='.length);
  if (!value || !/^[a-p]{32}$/.test(value)) {
    throw new Error('Provide a valid Chrome extension ID with --extension-id=<32 lowercase a-p characters>.');
  }
  return value;
}

async function existingHostEntry(): Promise<string> {
  const currentFile = fileURLToPath(import.meta.url);
  const sourceEntry = resolve(dirname(currentFile), '..', 'extension', 'host-main.ts');
  try {
    await access(sourceEntry, constants.R_OK);
    return sourceEntry;
  } catch {
    return resolve(dirname(currentFile), '..', 'extension', 'host-main.js');
  }
}

export async function buildNativeHostInstallPlan(
  extensionId: string,
  options: {
    platform?: NodeJS.Platform;
    home?: string;
    nodePath?: string;
    hostEntry?: string;
    tsxImport?: string;
  } = {},
): Promise<NativeHostInstallPlan> {
  const platform = options.platform ?? currentPlatform();
  if (platform === 'win32') {
    throw new Error(
      'Windows Native Messaging setup is not yet supported: Chrome requires a real executable launcher, not a .js or .cmd path.',
    );
  }
  if (platform !== 'linux' && platform !== 'darwin') {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const home = options.home ?? homedir();
  const installDir = join(home, '.local-ai-relay', 'native-host');
  const launcherPath = join(installDir, HOST_NAME);
  const hostEntry = options.hostEntry ?? await existingHostEntry();
  const nodePath = options.nodePath ?? process.execPath;
  const usesTypeScript = hostEntry.endsWith('.ts');
  const tsxImport = options.tsxImport
    ?? (usesTypeScript ? fileURLToPath(import.meta.resolve('tsx')) : undefined);
  const launcher = [
    '#!/usr/bin/env sh',
    'set -eu',
    `exec ${shellQuote(nodePath)}${tsxImport ? ` --import ${shellQuote(tsxImport)}` : ''} ${shellQuote(hostEntry)}`,
    '',
  ].join('\n');
  const manifestDir = platform === 'darwin'
    ? join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts')
    : join(home, '.config', 'google-chrome', 'NativeMessagingHosts');
  const manifestPath = join(manifestDir, `${HOST_NAME}.json`);

  return {
    manifestPath,
    launcherPath,
    launcher,
    manifest: {
      name: HOST_NAME,
      description: 'Local AI Relay Native Messaging Host (experimental control bridge)',
      path: launcherPath,
      type: 'stdio',
      allowed_origins: [`chrome-extension://${extensionId}/`],
    },
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const extensionId = extensionIdFrom(args);
  const plan = await buildNativeHostInstallPlan(extensionId);
  if (args.includes('--dry-run')) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }
  await mkdir(dirname(plan.launcherPath), { recursive: true, mode: 0o700 });
  await mkdir(dirname(plan.manifestPath), { recursive: true, mode: 0o700 });
  await writeFile(plan.launcherPath, plan.launcher, { mode: 0o700 });
  await chmod(plan.launcherPath, 0o700);
  await writeFile(plan.manifestPath, `${JSON.stringify(plan.manifest, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`Installed Native Messaging host manifest at ${plan.manifestPath}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
