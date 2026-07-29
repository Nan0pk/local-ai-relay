import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

function validPort(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value.trim())) return undefined;
  const port = Number(value.trim());
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : undefined;
}

export function activePortPath(root = process.cwd()): string {
  return join(root, '.relay-browser', 'active-port');
}

export async function readActivePort(root = process.cwd()): Promise<number | undefined> {
  try {
    return validPort(await readFile(activePortPath(root), 'utf8'));
  } catch {
    return undefined;
  }
}

async function configuredPort(
  env: NodeJS.ProcessEnv,
  root: string,
): Promise<number> {
  const fromEnvironment = validPort(env.PORT);
  if (fromEnvironment) return fromEnvironment;
  try {
    const source = await readFile(join(root, '.env'), 'utf8');
    return validPort(source.match(/^PORT=(.+)$/m)?.[1]) ?? 8787;
  } catch {
    return 8787;
  }
}

async function recordedPorts(env: NodeJS.ProcessEnv, root: string): Promise<number[]> {
  const paths = [activePortPath(root)];
  if (env.RELAY_INSTALL_ROOT) {
    paths.push(join(env.RELAY_INSTALL_ROOT, 'runtime', 'active-port'));
  }
  const ports = await Promise.all(paths.map(async (path) => {
    try {
      return validPort(await readFile(path, 'utf8'));
    } catch {
      return undefined;
    }
  }));
  return ports.filter((port): port is number => port !== undefined);
}

async function isRelay(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(750),
    });
    if (!response.ok) return false;
    const body = await response.json() as { service?: unknown };
    return body.service === 'local-ai-relay';
  } catch {
    return false;
  }
}

export async function resolveRelayPort(
  options: {
    env?: NodeJS.ProcessEnv;
    root?: string;
    probe?: (port: number) => Promise<boolean>;
  } = {},
): Promise<number> {
  const env = options.env ?? process.env;
  const root = options.root ?? process.cwd();
  const preferred = await configuredPort(env, root);
  const candidates = [
    ...await recordedPorts(env, root),
    ...Array.from({ length: 10 }, (_, offset) => preferred + offset)
      .filter((port) => port <= 65535),
  ];
  const unique = [...new Set(candidates)];
  const probe = options.probe ?? isRelay;
  for (const port of unique) {
    if (await probe(port)) return port;
  }
  return preferred;
}

export async function recordActivePort(
  port: number,
  root = process.cwd(),
): Promise<void> {
  const path = activePortPath(root);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${port}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

export async function clearActivePort(
  port: number,
  root = process.cwd(),
): Promise<void> {
  const path = activePortPath(root);
  try {
    if (validPort(await readFile(path, 'utf8')) === port) {
      await rm(path, { force: true });
    }
  } catch {
    // Missing or replaced state requires no cleanup.
  }
}
