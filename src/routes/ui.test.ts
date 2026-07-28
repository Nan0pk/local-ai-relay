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
  assert.match(response.headers['content-security-policy'] ?? '', /default-src 'none'/);
  assert.equal(response.headers['referrer-policy'], 'no-referrer');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.ok(response.payload.includes('Local AI Relay Dashboard'));
  assert.ok(response.payload.includes('/v1/providers/status'));
  assert.doesNotMatch(
    response.payload,
    /\/api\/providers|localStorage\.(?:getItem|setItem)|Regenerate/,
  );
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
