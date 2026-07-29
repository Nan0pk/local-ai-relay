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
  assert.ok(response.payload.includes('Local AI Relay'));
  assert.ok(response.payload.includes('/ui/app.js'));
  assert.doesNotMatch(response.headers['content-security-policy'] ?? '', /unsafe-inline/);
  assert.doesNotMatch(
    response.payload,
    /\/api\/providers|localStorage\.(?:getItem|setItem)|Regenerate/,
  );

  const script = await app.inject({ method: 'GET', url: '/ui/app.js' });
  assert.equal(script.statusCode, 200);
  assert.ok(script.headers['content-type']?.includes('application/javascript'));
  assert.doesNotThrow(() => new Function(script.payload));
  assert.ok(script.payload.includes('/v1/control/overview'));
  assert.ok(script.payload.includes('/v1/control/browser-pair'));
  assert.ok(script.payload.includes('/v1/control/browser-disconnect'));
  assert.ok(script.payload.includes('/v1/control/providers/discover'));
  assert.ok(response.payload.includes('Providers connect automatically'));
  assert.ok(response.payload.includes('cat ~/.local-ai-relay/token'));
  assert.doesNotMatch(script.payload, /localStorage\.(?:getItem|setItem)/);
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
