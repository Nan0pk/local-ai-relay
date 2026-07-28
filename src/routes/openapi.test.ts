import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildApp } from '../server.js';
import { RELAY_VERSION } from '../version.js';
import { generateOpenAPISpec } from './openapi.js';

test('generateOpenAPISpec creates valid OpenAPI 3.1 schema', () => {
  const spec = generateOpenAPISpec();
  assert.equal(spec.openapi, '3.1.0');
  assert.equal((spec.info as { version: string }).version, RELAY_VERSION);
  const paths = spec.paths as Record<string, unknown>;
  assert.ok(paths['/health']);
  assert.ok(paths['/v1/models']);
  assert.ok(paths['/v1/responses']);
  assert.ok(paths['/v1/chat/completions']);
  assert.ok(paths['/v1/providers/status']);
  assert.ok(paths['/openapi.json']);
  const responses = paths['/v1/responses'] as {
    post: { requestBody?: unknown; parameters: Array<{ $ref: string }> };
  };
  assert.ok(responses.post.requestBody);
  assert.equal(
    responses.post.parameters[0]?.$ref,
    '#/components/parameters/RelaySession',
  );
  const components = spec.components as {
    parameters: Record<string, unknown>;
    securitySchemes: Record<string, unknown>;
    schemas: Record<string, unknown>;
  };
  assert.ok(components.parameters.RelaySession);
  assert.ok(components.securitySchemes.bearerAuth);
  assert.ok(components.schemas.ErrorResponse);
  assert.ok(components.schemas.ResponseFunctionTool);
});

test('committed OpenAPI document matches the generator', async () => {
  const committed = JSON.parse(await readFile('docs/openapi.json', 'utf8'));
  assert.deepEqual(committed, generateOpenAPISpec());
});

test('OpenAPI route is authenticated and serves the generated document', async () => {
  process.env.RELAY_API_TOKEN = 'openapi-test-token';
  const app = buildApp({
    host: '127.0.0.1',
    port: 8787,
    logLevel: 'silent',
    defaultModel: 'mock-gpt-4o-mini',
  });
  try {
    assert.equal((await app.inject({ method: 'GET', url: '/openapi.json' })).statusCode, 401);
    const response = await app.inject({
      method: 'GET',
      url: '/openapi.json',
      headers: { authorization: 'Bearer openapi-test-token' },
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), generateOpenAPISpec());
  } finally {
    await app.close();
    delete process.env.RELAY_API_TOKEN;
  }
});
