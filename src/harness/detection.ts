import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, join } from 'node:path';
import type { HarnessId } from './manager.js';

const COMMANDS: Partial<Record<HarnessId, string[]>> = {
  hermes: ['hermes'],
  opencode: ['opencode'],
};

function pathExtensions(env: NodeJS.ProcessEnv): string[] {
  if (process.platform !== 'win32') return [''];
  const configured = env.PATHEXT?.split(delimiter).filter(Boolean);
  return configured?.length ? configured : ['.EXE', '.CMD', '.BAT', '.COM'];
}

export async function findExecutable(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> {
  const directories = (env.PATH ?? '').split(delimiter).filter(Boolean);
  for (const directory of directories) {
    for (const extension of pathExtensions(env)) {
      const candidate = join(directory, `${command}${extension}`);
      try {
        await access(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
        return candidate;
      } catch {
        // Keep searching PATH.
      }
    }
  }
  return undefined;
}

export async function detectHarnessExecutable(
  harnessId: HarnessId,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> {
  for (const command of COMMANDS[harnessId] ?? []) {
    const executable = await findExecutable(command, env);
    if (executable) return executable;
  }
  return undefined;
}
