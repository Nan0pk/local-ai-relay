import { createServer } from 'node:net';
import { spawn } from 'node:child_process';

async function main(): Promise<void> {
  const preferredPort = 20_000 + Math.floor(Math.random() * 20_000);
  const blocker = createServer();
  await new Promise<void>((resolve, reject) => {
    blocker.once('error', reject);
    blocker.listen(preferredPort, '127.0.0.1', resolve);
  });

  const relay = spawn(process.execPath, ['dist/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(preferredPort),
      LOG_LEVEL: 'silent',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  relay.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
  relay.stderr.on('data', (chunk: Buffer) => { output += chunk.toString(); });

  try {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (relay.exitCode !== null) throw new Error(`Relay exited early.\n${output}`);
      for (let offset = 1; offset < 10; offset++) {
        const port = preferredPort + offset;
        try {
          const response = await fetch(`http://127.0.0.1:${port}/health`);
          const body = await response.json() as { service?: string };
          if (body.service === 'local-ai-relay') {
            console.log(`PASS: occupied-port startup selected ${port} and /health responded.`);
            return;
          }
        } catch {
          // The relay may still be starting or this candidate is unused.
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for relay startup.\n${output}`);
  } finally {
    relay.kill('SIGTERM');
    blocker.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
