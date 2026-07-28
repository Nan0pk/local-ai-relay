import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { errorHandler } from './error-handler.js';

test('error handler does not expose internal errors and returns string codes', async () => {
  const app = Fastify({ logger: { level: 'silent' } });
  app.setErrorHandler(errorHandler);
  app.get('/boom', async () => {
    throw new Error('database token=super-secret failed');
  });

  const response = await app.inject({ method: 'GET', url: '/boom' });
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json(), {
    error: {
      message: 'Internal server error.',
      type: 'internal_error',
      code: 'internal_error',
    },
  });
  await app.close();
});
