import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteLedger } from './sqlite-ledger.js';

test('SqliteLedger initializes schema and generation counter', () => {
  const ledger = new SqliteLedger(':memory:');
  assert.equal(ledger.getCurrentGeneration(), 1);
  assert.equal(ledger.incrementGeneration(), 2);
  assert.equal(ledger.getCurrentGeneration(), 2);
  ledger.close();
});

test('SqliteLedger tracks request state transitions and hashes prompts', () => {
  const ledger = new SqliteLedger(':memory:');
  const req = ledger.createRequest('req-1', 'chatgpt', 'Respond with ORANGE');
  assert.equal(req.requestId, 'req-1');
  assert.equal(req.state, 'PREPARED');
  assert.equal(req.promptHash.length, 64);

  ledger.updateRequestState('req-1', 'SUBMITTED');
  let fetched = ledger.getRequest('req-1');
  assert.equal(fetched?.state, 'SUBMITTED');

  ledger.updateRequestState('req-1', 'COMPLETED');
  fetched = ledger.getRequest('req-1');
  assert.equal(fetched?.state, 'COMPLETED');
  ledger.close();
});

test('SqliteLedger tracks tool executions', () => {
  const ledger = new SqliteLedger(':memory:');
  ledger.createRequest('req-10', 'chatgpt', 'Execute tool prompt');
  const tool = ledger.registerToolExecution('tool-1', 'req-10');
  assert.equal(tool.toolCallId, 'tool-1');
  assert.equal(tool.state, 'PREPARED');

  ledger.updateToolState('tool-1', 'COMPLETED');
  const fetched = ledger.getToolExecution('tool-1');
  assert.equal(fetched?.state, 'COMPLETED');
  ledger.close();
});

test('SqliteLedger resolves unobservable stale generation requests on restart', () => {
  const ledger = new SqliteLedger(':memory:');
  ledger.createRequest('req-old', 'chatgpt', 'Stale prompt');
  ledger.updateRequestState('req-old', 'SUBMITTED');

  // Increment generation to simulate browser/relay cold restart
  ledger.incrementGeneration();

  const resolvedCount = ledger.resolveStaleGenerationsOnRestart();
  assert.equal(resolvedCount, 1);

  const staleReq = ledger.getRequest('req-old');
  assert.equal(staleReq?.state, 'FAILED');
  assert.equal(staleReq?.failureClass, 'restart_unobservable');
  ledger.close();
});
