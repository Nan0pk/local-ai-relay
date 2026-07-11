import assert from 'node:assert/strict';
import test from 'node:test';
import { selectPort, type PortChecks } from './port-selection.js';

function checks(relays: number[], occupied: number[]): PortChecks {
  return {
    isRelay: async (port) => relays.includes(port),
    isAvailable: async (_host, port) => !occupied.includes(port),
  };
}

test('uses the preferred port when it is available', async () => {
  assert.deepEqual(
    await selectPort('127.0.0.1', 8787, checks([], [])),
    { port: 8787, existingRelay: false },
  );
});

test('recognizes an already-running relay', async () => {
  assert.deepEqual(
    await selectPort('127.0.0.1', 8787, checks([8787], [8787])),
    { port: 8787, existingRelay: true },
  );
});

test('moves to the next port when another program owns the preferred port', async () => {
  assert.deepEqual(
    await selectPort('127.0.0.1', 8787, checks([], [8787])),
    { port: 8788, existingRelay: false },
  );
});
