import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import type { Readable } from 'node:stream';

function captureOutput(stream: Readable, append: (text: string) => void): void {
  stream.on('data', (chunk: Buffer) => append(chunk.toString()));
  // Windows can reset child-process stdio pipes when the child is terminated.
  // The pipe is diagnostic-only, so closure during teardown is not a smoke failure.
  stream.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code !== 'ECONNRESET' && error.code !== 'EPIPE') {
      append(`Child output stream error: ${error.message}\n`);
    }
  });
}

async function stopChild(relay: ReturnType<typeof spawn>): Promise<void> {
  if (relay.exitCode !== null) return;
  relay.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 2_000);
    timeout.unref();
    const done = (): void => {
      clearTimeout(timeout);
      resolve();
    };
    relay.once('exit', done);
    relay.once('error', done);
  });
}

async function main(): Promise<void> {
  const preferredPort = 20_000 + Math.floor(Math.random() * 20_000);
  const blocker = createServer((_request, response) => {
    // Answer the relay's health probe normally while identifying as a
    // different service. This keeps the port occupied without raw TCP resets.
    response.writeHead(200, {
      'content-type': 'application/json',
      connection: 'close',
    });
    response.end('{}');
  });
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
      RELAY_API_TOKEN: 'smoke-test-token',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let spawnError: Error | undefined;
  relay.once('error', (error) => { spawnError = error; });
  captureOutput(relay.stdout, (text) => { output += text; });
  captureOutput(relay.stderr, (text) => { output += text; });

  try {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (spawnError) throw new Error(`Relay failed to start: ${spawnError.message}`);
      if (relay.exitCode !== null) throw new Error(`Relay exited early.\n${output}`);
      for (let offset = 1; offset < 10; offset++) {
        const port = preferredPort + offset;
        try {
          const response = await fetch(`http://127.0.0.1:${port}/health`);
          const body = await response.json() as { service?: string };
          if (body.service === 'local-ai-relay') {
            const completion = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'authorization': 'Bearer smoke-test-token',
              },
              body: JSON.stringify({
                model: 'mock-gpt-4o-mini',
                messages: [{ role: 'user', content: 'startup smoke' }],
              }),
            });
            const completionBody = await completion.json() as {
              choices?: Array<{ message?: { content?: string } }>;
            };
            if (!completion.ok || !completionBody.choices?.[0]?.message?.content?.includes('startup smoke')) {
              throw new Error('Relay health passed but its OpenAI chat-completions route failed.');
            }
            console.log(`PASS: occupied-port startup selected ${port}; /health and /v1/chat/completions responded.`);
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
    await Promise.all([
      stopChild(relay),
      new Promise<void>((resolve) => blocker.close(() => resolve())),
    ]);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
