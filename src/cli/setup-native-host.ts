#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

const MANIFEST_TEMPLATE = {
  name: 'com.local_ai_relay.host',
  description: 'Local AI Relay Native Messaging Host',
  path: '',
  type: 'stdio',
  allowed_origins: [] as string[],
};

async function getManifestPath(): Promise<string> {
  const platform = os.platform();
  const home = os.homedir();
  let dir: string;
  switch (platform) {
    case 'linux':
      dir = path.join(home, '.config', 'google-chrome', 'NativeMessagingHosts');
      break;
    case 'darwin':
      dir = path.join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts');
      break;
    case 'win32':
      return 'registry';
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, 'com.local_ai_relay.host.json');
}

async function installOnWindows(extensionId: string, hostPath: string) {
  const regKey = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.local_ai_relay.host`;
  const manifestPath = path.join(os.tmpdir(), 'com.local_ai_relay.host.json');
  const manifest = {
    ...MANIFEST_TEMPLATE,
    path: hostPath,
    allowed_origins: [`chrome-extension://${extensionId}/`],
  };
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  execSync(`reg add "${regKey}" /ve /t REG_SZ /d "${manifestPath}" /f`);
  console.log(`Installed Windows registry key: ${regKey}`);
}

async function installPosix(extensionId: string, hostPath: string) {
  const manifestPath = await getManifestPath();
  const manifest = {
    ...MANIFEST_TEMPLATE,
    path: hostPath,
    allowed_origins: [`chrome-extension://${extensionId}/`],
  };
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Installed manifest at ${manifestPath}`);
}

async function main() {
  const args = process.argv.slice(2);
  const extensionIdArg = args.find((a) => a.startsWith('--extension-id='));
  if (!extensionIdArg) {
    console.error('Usage: node setup-native-host.js --extension-id=<CHROME_EXTENSION_ID>');
    process.exit(1);
  }
  const extensionId = extensionIdArg.split('=')[1];
  if (!extensionId) {
    console.error('Extension ID must be provided.');
    process.exit(1);
  }

  const hostPath = process.argv[1].replace('setup-native-host.js', 'host-main.js');
  const absoluteHostPath = path.resolve(hostPath);

  const platform = os.platform();
  if (platform === 'win32') {
    await installOnWindows(extensionId, absoluteHostPath);
  } else {
    await installPosix(extensionId, absoluteHostPath);
  }
  console.log('Native messaging host installed successfully.');
}

main().catch(console.error);
