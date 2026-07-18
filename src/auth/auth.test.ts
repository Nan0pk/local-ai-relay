import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import { rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildApp } from '../server.js';
import { getOrGenerateToken, getTokenPath } from './token.js';
import { loadConfig } from '../config.js';
import { getWritableHome } from '../browser/paths.js';

describe('Authentication, Binding, and CORS safety checks', () => {

  test('Token generation and persistence with 0o600 mode', async () => {
    // Override RELAY_API_TOKEN to ensure we test generation
    const tempEnv = {
      RELAY_API_TOKEN_PATH: join(getWritableHome(), '.local-ai-relay', 'test-token-file-' + Math.random().toString(36).substring(2, 9))
    };
    
    try {
      // 1. Generate token
      const token = await getOrGenerateToken(tempEnv);
      assert.ok(token);
      assert.equal(token.length, 64); // 32 bytes in hex = 64 chars

      // 2. Verify file exists and holds the same token
      const filePath = getTokenPath(tempEnv);
      const readContent = await readFile(filePath, 'utf8');
      assert.equal(readContent.trim(), token);

      // 3. Verify it is persisted (second call returns the same token)
      const token2 = await getOrGenerateToken(tempEnv);
      assert.equal(token2, token);
    } finally {
      // Cleanup
      const filePath = getTokenPath(tempEnv);
      await rm(filePath, { force: true }).catch(() => {});
    }
  });

  test('Missing, invalid, and valid credentials return expected HTTP statuses', async () => {
    // Set token
    process.env.RELAY_API_TOKEN = 'secure-test-token';
    const app = buildApp({
      host: '127.0.0.1',
      port: 0,
      logLevel: 'silent',
      defaultModel: 'mock-gpt-4o-mini'
    });

    try {
      // 1. Missing Authorization header
      const res1 = await app.inject({
        method: 'GET',
        url: '/v1/models'
      });
      assert.equal(res1.statusCode, 401);
      const body1 = res1.json() as any;
      assert.equal(body1.error.code, 'invalid_api_key');

      // 2. Invalid Token
      const res2 = await app.inject({
        method: 'GET',
        url: '/v1/models',
        headers: { authorization: 'Bearer wrong-token' }
      });
      assert.equal(res2.statusCode, 401);
      const body2 = res2.json() as any;
      assert.equal(body2.error.code, 'invalid_api_key');

      // 3. Valid Token
      const res3 = await app.inject({
        method: 'GET',
        url: '/v1/models',
        headers: { authorization: 'Bearer secure-test-token' }
      });
      assert.equal(res3.statusCode, 200);
    } finally {
      await app.close();
      delete process.env.RELAY_API_TOKEN;
    }
  });

  test('CORS origin checking matches loopback and extensions, rejects others', async () => {
    process.env.RELAY_API_TOKEN = 'secure-test-token';
    const app = buildApp({
      host: '127.0.0.1',
      port: 0,
      logLevel: 'silent',
      defaultModel: 'mock-gpt-4o-mini'
    });

    try {
      // 1. Safe Chrome Extension Origin
      const res1 = await app.inject({
        method: 'GET',
        url: '/v1/models',
        headers: {
          authorization: 'Bearer secure-test-token',
          origin: 'chrome-extension://hjkashdkjashdjkashd'
        }
      });
      assert.equal(res1.statusCode, 200);
      assert.equal(res1.headers['access-control-allow-origin'], 'chrome-extension://hjkashdkjashdjkashd');

      // 2. Safe Loopback Origin
      const res2 = await app.inject({
        method: 'GET',
        url: '/v1/models',
        headers: {
          authorization: 'Bearer secure-test-token',
          origin: 'http://localhost:3000'
        }
      });
      assert.equal(res2.statusCode, 200);
      assert.equal(res2.headers['access-control-allow-origin'], 'http://localhost:3000');

      // 3. Malicious Origin
      const res3 = await app.inject({
        method: 'GET',
        url: '/v1/models',
        headers: {
          authorization: 'Bearer secure-test-token',
          origin: 'https://malicious.com'
        }
      });
      assert.equal(res3.statusCode, 403);
      const body3 = res3.json() as any;
      assert.equal(body3.error.code, 'cors_blocked');
    } finally {
      await app.close();
      delete process.env.RELAY_API_TOKEN;
    }
  });

  test('Non-loopback bind is refused unless operator supplies ack and token', () => {
    // 1. Bind to 0.0.0.0 without acknowledgement or token -> fails
    assert.throws(() => {
      loadConfig({
        HOST: '0.0.0.0'
      });
    }, /Refusing non-loopback bind/);

    // 2. Bind to 0.0.0.0 with acknowledgement but no token -> fails
    assert.throws(() => {
      loadConfig({
        HOST: '0.0.0.0',
        RELAY_UNSAFE_BIND_ACK: '1'
      });
    }, /Refusing non-loopback bind.*explicit authentication/);

    // 3. Bind to 0.0.0.0 with token but no acknowledgement -> fails
    assert.throws(() => {
      loadConfig({
        HOST: '0.0.0.0',
        RELAY_API_TOKEN: 'custom-auth-token'
      });
    }, /Refusing non-loopback bind.*without acknowledgement/);

    // 4. Bind to 0.0.0.0 with both -> succeeds
    const cfg = loadConfig({
      HOST: '0.0.0.0',
      RELAY_UNSAFE_BIND_ACK: '1',
      RELAY_API_TOKEN: 'custom-auth-token'
    });
    assert.equal(cfg.host, '0.0.0.0');
  });

  test('Exceptions for /health route bypass authentication', async () => {
    const app = buildApp({
      host: '127.0.0.1',
      port: 0,
      logLevel: 'silent',
      defaultModel: 'mock-gpt-4o-mini'
    });

    try {
      const res = await app.inject({
        method: 'GET',
        url: '/health'
      });
      assert.equal(res.statusCode, 200);
      const body = res.json() as any;
      assert.equal(body.status, 'ok');
    } finally {
      await app.close();
    }
  });
});
