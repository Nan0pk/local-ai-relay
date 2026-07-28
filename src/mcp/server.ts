import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { DaemonClient } from './daemon-client.js';
import { RELAY_VERSION } from '../version.js';

function requiredString(
  args: Record<string, unknown> | undefined,
  name: string,
): string {
  const value = args?.[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`'${name}' must be a non-empty string.`);
  }
  return value;
}

export function createMcpServer(daemonClient: DaemonClient) {
  const server = new Server(
    { name: 'local-ai-relay-mcp', version: RELAY_VERSION },
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
          additionalProperties: false,
        },
      },
      {
        name: 'relay_get_provider_status',
        description: 'Get detailed diagnostic status of a specific provider or all.',
        inputSchema: {
          type: 'object',
          properties: {
            provider_id: { type: 'string', description: 'Optional provider ID (e.g., browser-chatgpt)' },
          },
          additionalProperties: false,
        },
      },
      {
        name: 'relay_delegate_request',
        description: 'Send a completion request to a specific model.',
        inputSchema: {
          type: 'object',
          properties: {
            model: { type: 'string', description: 'Registered model ID (e.g., browser-chatgpt-free)' },
            input: { type: 'string', description: 'User prompt text' },
            tools: { type: 'array', items: { type: 'object' }, description: 'Optional tools array' },
          },
          required: ['model', 'input'],
          additionalProperties: false,
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
          if (args?.include_unready !== undefined && typeof args.include_unready !== 'boolean') {
            throw new Error("'include_unready' must be a boolean.");
          }
          result = await daemonClient.listModels(args?.include_unready);
          break;
        case 'relay_get_provider_status':
          if (args?.provider_id !== undefined && typeof args.provider_id !== 'string') {
            throw new Error("'provider_id' must be a string.");
          }
          result = await daemonClient.getProviderStatus(args?.provider_id);
          break;
        case 'relay_delegate_request': {
          if (args?.tools !== undefined && !Array.isArray(args.tools)) {
            throw new Error("'tools' must be an array.");
          }
          result = await daemonClient.delegateRequest(
            requiredString(args, 'model'),
            requiredString(args, 'input'),
            args?.tools,
          );
          break;
        }
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
