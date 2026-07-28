import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname } from 'node:path';
import type { AppConfig } from '../config.js';
import { browserBinariesDir, findSystemBrowser } from '../browser/paths.js';
import { controlStatePath } from './storage.js';
import { harnessManager } from '../harness/manager.js';
import { capabilityTracker, getAllCapabilityRecords } from '../providers/registry.js';

export type DoctorCheckStatus = 'pass' | 'warning' | 'fail';

export interface DoctorCheck {
  id: string;
  label: string;
  status: DoctorCheckStatus;
  detail: string;
  action?: string;
}

async function managedBrowserPath(): Promise<string | undefined> {
  try {
    process.env.PLAYWRIGHT_BROWSERS_PATH ??= browserBinariesDir();
    const { chromium } = await import('patchright');
    const path = chromium.executablePath();
    await access(path, constants.X_OK);
    return path;
  } catch {
    return undefined;
  }
}

export async function runDoctor(config: AppConfig): Promise<{
  ok: boolean;
  checks: DoctorCheck[];
  diagnosticsDirectory: string;
}> {
  const checks: DoctorCheck[] = [];
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  checks.push({
    id: 'node',
    label: 'Node.js runtime',
    status: nodeMajor >= 22 ? 'pass' : 'fail',
    detail: `Node ${process.versions.node}`,
    ...(nodeMajor >= 22 ? {} : { action: 'Install Node.js 22 or newer, then restart the relay.' }),
  });

  checks.push({
    id: 'relay',
    label: 'Local relay',
    status: 'pass',
    detail: `Healthy on http://${config.host}:${config.port}`,
  });

  const browser = await findSystemBrowser() ?? await managedBrowserPath();
  checks.push({
    id: 'browser',
    label: 'Automation browser',
    status: browser ? 'pass' : 'warning',
    detail: browser ?? 'Chrome, Chromium, or the relay-managed browser was not found.',
    ...(browser ? {} : { action: 'Use Connect on a provider; the relay will install its managed browser on demand.' }),
  });

  const hasGraphicalSession = process.platform === 'win32'
    || Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
  checks.push({
    id: 'desktop',
    label: 'Desktop session',
    status: hasGraphicalSession ? 'pass' : 'warning',
    detail: hasGraphicalSession
      ? 'A graphical login session is available.'
      : 'No DISPLAY or WAYLAND_DISPLAY was detected.',
    ...(hasGraphicalSession ? {} : { action: 'Run provider sign-in from your normal desktop session.' }),
  });

  const capabilityRecords = getAllCapabilityRecords();
  const readyCount = capabilityRecords.filter((item) => capabilityTracker.isReady(item.providerId)).length;
  checks.push({
    id: 'providers',
    label: 'Ready providers',
    status: readyCount > 0 ? 'pass' : 'warning',
    detail: readyCount > 0
      ? `${readyCount} verified provider${readyCount === 1 ? '' : 's'} available.`
      : 'No real provider is verified yet.',
    ...(readyCount > 0 ? {} : { action: 'Connect and verify at least one provider before using a harness.' }),
  });

  const harnesses = await harnessManager.list();
  const installedHarnesses = harnesses.filter((item) => item.id !== 'generic' && item.installed);
  const connectedHarnesses = harnesses.filter((item) => item.connected);
  checks.push({
    id: 'harnesses',
    label: 'Harness integration',
    status: connectedHarnesses.length > 0 ? 'pass' : 'warning',
    detail: connectedHarnesses.length > 0
      ? `${connectedHarnesses.length} harness${connectedHarnesses.length === 1 ? '' : 'es'} connected.`
      : `${installedHarnesses.length} supported harness${installedHarnesses.length === 1 ? '' : 'es'} detected; none connected.`,
    ...(connectedHarnesses.length > 0 ? {} : { action: 'Connect Hermes, OpenCode, or a generic client after a provider is ready.' }),
  });

  return {
    ok: checks.every((check) => check.status !== 'fail'),
    checks,
    diagnosticsDirectory: dirname(controlStatePath('diagnostics/control-events.jsonl')),
  };
}
