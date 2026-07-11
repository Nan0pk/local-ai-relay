import { ChatGptPlaywrightDriver } from '../browser/chatgpt-driver.js';

async function main(): Promise<void> {
  const driver = new ChatGptPlaywrightDriver({ headless: false });
  console.log('Opening the dedicated ChatGPT relay profile.');
  console.log('Sign in normally. Do not paste cookies or tokens into the relay.');
  console.log('When the ChatGPT composer is visible, return here and press Ctrl+C.');

  const shutdown = async () => {
    await driver.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  // An intentionally harmless prompt opens the browser and also verifies
  // that sign-in has completed. It is not submitted until the user invokes
  // the relay; login mode only keeps the profile window open.
  await driver.openForLogin();
  await new Promise(() => undefined);
}

void main();
