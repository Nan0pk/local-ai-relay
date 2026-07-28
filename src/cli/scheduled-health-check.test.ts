import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { runHealthCheck } from './scheduled-health-check.js';

test('runHealthCheck reports unreachable status when server is down', async () => {
  const report = await runHealthCheck('http://127.0.0.1:59999', '/tmp/test-health-audit-down');
  assert.equal(report.status, 'unreachable');
  assert.ok(report.error);
});

test('runHealthCheck reports ok status when /health returns 200', async () => {
  const server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 8787;

  try {
    const report = await runHealthCheck(`http://127.0.0.1:${port}`, '/tmp/test-health-audit-ok');
    assert.equal(report.status, 'ok');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('runHealthCheck authenticates provider diagnostics with the relay token', async () => {
  process.env.RELAY_API_TOKEN = 'health-test-token';
  const server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'local-ai-relay' }));
    } else if (
      req.url === '/v1/providers/status'
      && req.headers.authorization === 'Bearer health-test-token'
    ) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ object: 'list', data: [] }));
    } else {
      res.writeHead(401);
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 8787;

  try {
    const report = await runHealthCheck(
      `http://127.0.0.1:${port}`,
      `/tmp/test-health-audit-auth-${crypto.randomUUID()}`,
    );
    assert.deepEqual(report.providersStatus, { object: 'list', data: [] });
  } finally {
    delete process.env.RELAY_API_TOKEN;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('runHealthCheck rejects a non-loopback destination before making a request', async () => {
  process.env.RELAY_API_TOKEN = 'must-not-leave-loopback';
  let providerStatusRequested = false;
  const server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    providerStatusRequested = true;
    assert.equal(req.headers.authorization, undefined);
    res.writeHead(401);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 8787;

  try {
    const report = await runHealthCheck(
      `http://localhost:${port}`,
      `/tmp/test-health-audit-untrusted-${crypto.randomUUID()}`,
    );
    assert.equal(report.status, 'unreachable');
    assert.match(report.error ?? '', /127\.0\.0\.1 or ::1/);
    assert.equal(providerStatusRequested, false);
  } finally {
    delete process.env.RELAY_API_TOKEN;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
