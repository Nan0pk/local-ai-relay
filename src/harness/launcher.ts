import { spawn } from 'node:child_process';
import type { HarnessId } from './manager.js';
import { findExecutable } from './detection.js';

interface LaunchCommand {
  command: string;
  args: string[];
}

async function linuxLaunchCommand(
  executable: string,
  env: NodeJS.ProcessEnv,
): Promise<LaunchCommand | undefined> {
  const candidates: Array<[string, string[]]> = [
    ['xdg-terminal-exec', [executable]],
    ['ptyxis', ['--', executable]],
    ['kgx', ['--', executable]],
    ['gnome-terminal', ['--', executable]],
    ['konsole', ['-e', executable]],
    ['xfce4-terminal', ['-x', executable]],
    ['xterm', ['-e', executable]],
  ];
  for (const [name, args] of candidates) {
    const command = await findExecutable(name, env);
    if (command) return { command, args };
  }
  return undefined;
}

export async function getHarnessLaunchCommand(
  harnessId: HarnessId,
  executable: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<LaunchCommand> {
  if (harnessId === 'generic') {
    throw new Error('Generic clients are launched from their own application.');
  }
  if (process.platform === 'win32') {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', 'start', '', `"${executable}"`],
    };
  }
  if (process.platform === 'linux') {
    const command = await linuxLaunchCommand(executable, env);
    if (command) return command;
    throw new Error(
      'No supported terminal application was found. Launch the harness from a terminal; its relay configuration is already saved.',
    );
  }
  throw new Error('One-click harness launch currently supports Windows and Linux.');
}

export async function launchHarness(
  harnessId: HarnessId,
  executable: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const plan = await getHarnessLaunchCommand(harnessId, executable, env);
  const child = spawn(plan.command, plan.args, {
    detached: true,
    stdio: 'ignore',
    env,
    windowsHide: false,
  });
  await new Promise<void>((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  child.unref();
}
