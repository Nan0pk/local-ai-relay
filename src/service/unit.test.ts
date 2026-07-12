import assert from 'node:assert/strict';
import test from 'node:test';
import { buildServiceUnit } from './unit.js';

test('systemd unit runs the built relay with its local env file', () => {
  const unit = buildServiceUnit('/home/victus/local-ai-relay', '/usr/bin/node', '/home/victus/local-ai-relay/.env');
  assert.match(unit, /WorkingDirectory=\/home\/victus\/local-ai-relay/);
  assert.match(unit, /EnvironmentFile=-\/home\/victus\/local-ai-relay\/\.env/);
  assert.match(unit, /ExecStart="\/usr\/bin\/node" "\/home\/victus\/local-ai-relay\/dist\/index\.js"/);
  assert.match(unit, /PassEnvironment=DISPLAY WAYLAND_DISPLAY/);
});
