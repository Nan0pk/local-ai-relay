import test from 'node:test';
import assert from 'node:assert/strict';
import { FaultInjectionServer, runFaultInjectionSuite } from './fault-injection.js';

test('FaultInjectionServer classifies all injected failure paths correctly', async () => {
  const server = new FaultInjectionServer();
  await server.start();

  try {
    const report = await runFaultInjectionSuite(server);
    assert.equal(report.totalMissions, 5);
    assert.equal(report.passedMissions, 5);
    assert.equal(report.correctnessRate, 100);
    assert.equal(report.meetsThreshold, true);
  } finally {
    await server.stop();
  }
});
