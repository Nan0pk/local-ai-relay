import test from 'node:test';
import assert from 'node:assert/strict';
import { generateOpenAPISpec } from './openapi.js';

test('generateOpenAPISpec creates valid OpenAPI 3.1 schema', () => {
  const spec = generateOpenAPISpec();
  assert.equal(spec.openapi, '3.1.0');
  const paths = spec.paths as Record<string, unknown>;
  assert.ok(paths['/health']);
  assert.ok(paths['/v1/models']);
  assert.ok(paths['/v1/responses']);
  assert.ok(paths['/v1/chat/completions']);
});
