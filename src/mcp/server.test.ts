import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { DaemonClient } from './daemon-client.js';
import { createMcpServer } from './server.js';

test('MCP server advertises and executes only verified relay tools', async () => {
  const calls: string[] = [];
  const daemonClient = {
    async listModels(includeUnready?: boolean) {
      calls.push(`models:${String(includeUnready)}`);
      return { data: [{ id: 'mock-gpt-4o-mini' }] };
    },
    async getProviderStatus(providerId?: string) {
      calls.push(`status:${String(providerId)}`);
      return { provider_id: providerId ?? 'all' };
    },
    async delegateRequest(model: string, input: string, tools?: unknown[]) {
      calls.push(`delegate:${model}:${input}:${tools?.length ?? 0}`);
      return { output_text: 'ok' };
    },
  } as DaemonClient;

  const server = createMcpServer(daemonClient);
  const client = new Client({ name: 'relay-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const listed = await client.listTools();
    assert.deepEqual(
      listed.tools.map((tool) => tool.name),
      ['relay_list_models', 'relay_get_provider_status', 'relay_delegate_request'],
    );

    const delegated = await client.callTool({
      name: 'relay_delegate_request',
      arguments: { model: 'mock-gpt-4o-mini', input: 'hello' },
    });
    assert.equal(delegated.isError, undefined);
    const content = delegated.content as Array<{ type: string; text?: string }>;
    assert.match(content[0]?.text ?? '', /"output_text": "ok"/);
    assert.deepEqual(calls, ['delegate:mock-gpt-4o-mini:hello:0']);
  } finally {
    await client.close();
    await server.close();
  }
});

test('MCP delegate rejects missing required values without calling the daemon', async () => {
  let called = false;
  const daemonClient = {
    async listModels() { return {}; },
    async getProviderStatus() { return {}; },
    async delegateRequest() {
      called = true;
      return {};
    },
  } as unknown as DaemonClient;
  const server = createMcpServer(daemonClient);
  const client = new Client({ name: 'relay-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const result = await client.callTool({
      name: 'relay_delegate_request',
      arguments: { model: '', input: 'hello' },
    });
    assert.equal(result.isError, true);
    assert.equal(called, false);
  } finally {
    await client.close();
    await server.close();
  }
});
