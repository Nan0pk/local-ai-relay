import { findBrowserProvider } from '../browser/driver-registry.js';

function parseProvider(argv: string[]): string {
  const idx = argv.indexOf('--provider');
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1]!;
  if (argv[0] && !argv[0].startsWith('-')) return argv[0];
  return 'chatgpt';
}

async function main(): Promise<void> {
  const descriptor = findBrowserProvider(parseProvider(process.argv.slice(2)));
  const driver = descriptor.factory();
  console.log(`Opening the dedicated ${descriptor.label} relay profile.`);
  console.log('Sign in normally. Do not paste cookies or tokens into the relay.');
  console.log(`When the ${descriptor.label} composer is visible, return here and press Ctrl+C.`);

  const shutdown = async () => {
    await driver.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  await driver.openForLogin();
  await new Promise(() => undefined);
}

void main();
