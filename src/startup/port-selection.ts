import { createServer } from 'node:net';

export interface PortSelection {
  port: number;
  existingRelay: boolean;
}

export interface PortChecks {
  isRelay(port: number): Promise<boolean>;
  isAvailable(host: string, port: number): Promise<boolean>;
}

async function isRelay(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(750),
    });
    if (!response.ok) return false;
    const body = await response.json() as { service?: string };
    return body.service === 'local-ai-relay';
  } catch {
    return false;
  }
}

async function isAvailable(host: string, port: number): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE' || error.code === 'EACCES') resolve(false);
      else reject(error);
    });
    server.listen({ host, port, exclusive: true }, () => {
      server.close((error) => error ? reject(error) : resolve(true));
    });
  });
}

const defaultChecks: PortChecks = { isRelay, isAvailable };

/** Prefer the configured port, reuse an existing relay, or try nine successors. */
export async function selectPort(
  host: string,
  preferredPort: number,
  checks: PortChecks = defaultChecks,
): Promise<PortSelection> {
  for (let offset = 0; offset < 10; offset++) {
    const port = preferredPort + offset;
    if (await checks.isRelay(port)) return { port, existingRelay: true };
    if (await checks.isAvailable(host, port)) return { port, existingRelay: false };
  }
  throw new Error(
    `No free relay port found in ${preferredPort}-${preferredPort + 9}. Set PORT to another local port.`,
  );
}
