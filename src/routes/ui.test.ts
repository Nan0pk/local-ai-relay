import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerUiRoutes } from './ui.js';

test('UI route serves dashboard HTML', async () => {
  const app = Fastify();
  await registerUiRoutes(app);

  const response = await app.inject({
    method: 'GET',
    url: '/ui',
  });

  assert.equal(response.statusCode, 200);
  assert.ok(response.headers['content-type']?.includes('text/html'));
  assert.ok(response.payload.includes('Local AI Relay Dashboard'));
});

test('Dashboard route redirects to /ui', async () => {
  const app = Fastify();
  await registerUiRoutes(app);

  const response = await app.inject({
    method: 'GET',
    url: '/dashboard',
  });

  assert.equal(response.statusCode, 302);
  assert.equal(response.headers.location, '/ui');
});
