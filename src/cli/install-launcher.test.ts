import assert from 'node:assert/strict';
import test from 'node:test';
import { linuxLauncherScript, windowsLauncherScript } from './install-launcher.js';

test('generated launchers resolve the authenticated current release at click time', () => {
  const linux = linuxLauncherScript('/opt/local relay');
  assert.match(linux, /current/);
  assert.match(linux, /npm run dashboard/);
  assert.ok(linux.includes("install_root='/opt/local relay'"));

  const windows = windowsLauncherScript("C:\\Users\\O'Brien\\Local AI Relay");
  assert.match(windows, /current-version/);
  assert.match(windows, /npm\.cmd run dashboard/);
  assert.match(windows, /O''Brien/);
});
