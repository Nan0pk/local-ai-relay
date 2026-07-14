import { findBrowserProvider } from '../browser/driver-registry.js';

export function parseProvider(argv: string[]): string {
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

  await driver.openForLogin();
  const keepAlive = setInterval(() => {}, 1000);
  
  const shutdown = async () => {
    clearInterval(keepAlive);
    await driver.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

const isMain = import.meta.url.startsWith('file:') && 
  (process.argv[1] === new URL(import.meta.url).pathname || 
   (process.argv[1] && (process.argv[1].endsWith('browser-login.ts') || process.argv[1].endsWith('browser-login.js'))));

if (isMain) {
  main().catch((err) => {
    console.error('Login script error:', err);
    process.exit(1);
  });
}

