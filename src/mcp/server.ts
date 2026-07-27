import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { DaemonClient } from './daemon-client.js';

export function createMcpServer(daemonClient: DaemonClient) {
  const server = new Server(
    { name: 'local-ai-relay-mcp', version: '0.2.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'relay_list_models',
        description: 'Get all available AI models and their current readiness status.',
        inputSchema: {
          type: 'object',
          properties: {
            include_unready: { type: 'boolean', description: 'Include unready/disabled models' },
          },
        },
      },
      {
        name: 'relay_get_provider_status',
        description: 'Get detailed diagnostic status of a specific provider or all.',
        inputSchema: {
          type: 'object',
          properties: {
            provider_id: { type: 'string', description: 'Optional provider ID (e.g., chatgpt, ollama)' },
          },
        },
      },
      {
        name: 'relay_delegate_request',
        description: 'Send a completion request to a specific model.',
        inputSchema: {
          type: 'object',
          properties: {
            model: { type: 'string', description: 'Model ID (e.g., browser-chatgpt-free, ollama-llama3:8b)' },
            input: { type: 'string', description: 'User prompt text' },
            tools: { type: 'array', description: 'Optional tools array' },
          },
          required: ['model', 'input'],
        },
      },
      {
        name: 'relay_open_provider_login',
        description: 'Launch a browser window for manual login to a web provider.',
        inputSchema: {
          type: 'object',
          properties: {
            provider: { type: 'string', description: 'Provider ID (e.g., chatgpt, claude, gemini)' },
          },
          required: ['provider'],
        },
      },
      {
        name: 'relay_trigger_probe',
        description: "Force a live probe to refresh a provider's capability evidence.",
        inputSchema: {
          type: 'object',
          properties: {
            provider: { type: 'string', description: 'Provider ID' },
          },
          required: ['provider'],
        },
      },
      {
        name: 'relay_clear_evidence',
        description: "Reset a provider's evidence store, setting status to installed.",
        inputSchema: {
          type: 'object',
          properties: {
            provider: { type: 'string', description: 'Provider ID' },
          },
          required: ['provider'],
        },
      },
      {
        name: 'relay_get_diagnostics',
        description: 'Export system diagnostics (logs, systemd status, ledger stats).',
        inputSchema: {
          type: 'object',
          properties: {
            redacted: { type: 'boolean', description: 'Redact sensitive info (default true)' },
          },
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: unknown;
      switch (name) {
        case 'relay_list_models':
          result = await daemonClient.listModels(args?.include_unready as boolean | undefined);
          break;
        case 'relay_get_provider_status':
          result = await daemonClient.getProviderStatus(args?.provider_id as string | undefined);
          break;
        case 'relay_delegate_request':
          result = await daemonClient.delegateRequest(
            args?.model as string,
            args?.input as string,
            args?.tools as unknown[] | undefined,
          );
          break;
        case 'relay_open_provider_login':
          result = await daemonClient.openProviderLogin(args?.provider as string);
          break;
        case 'relay_trigger_probe':
          result = await daemonClient.triggerProbe(args?.provider as string);
          break;
        case 'relay_clear_evidence':
          result = await daemonClient.clearEvidence(args?.provider as string);
          break;
        case 'relay_get_diagnostics':
          result = await daemonClient.getDiagnostics(args?.redacted !== false);
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: unknown) {
      return {
        content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  });

  return server;
}
