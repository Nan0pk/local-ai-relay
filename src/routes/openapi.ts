import type { FastifyInstance } from 'fastify';
import { RELAY_VERSION } from '../version.js';

const json = (schema: Record<string, unknown>, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});

export function generateOpenAPISpec(): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Local AI Relay API',
      version: RELAY_VERSION,
      description: 'Authenticated, OpenAI-compatible loopback API. Browser-provider readiness is runtime-gated.',
      license: { name: 'Apache-2.0' },
    },
    servers: [{ url: 'http://127.0.0.1:8787', description: 'Default loopback endpoint' }],
    security: [{ bearerAuth: [] }],
    paths: {
      '/health': {
        get: {
          operationId: 'getHealth',
          summary: 'Check relay liveness',
          security: [],
          responses: {
            '200': json({ $ref: '#/components/schemas/Health' }, 'Relay is running.'),
          },
        },
      },
      '/openapi.json': {
        get: {
          operationId: 'getOpenApiDocument',
          summary: 'Get this OpenAPI document',
          responses: {
            '200': json({ type: 'object' }, 'OpenAPI 3.1 document.'),
            '401': json({ $ref: '#/components/schemas/ErrorResponse' }, 'Bearer token missing or invalid.'),
          },
        },
      },
      '/v1/models': {
        get: {
          operationId: 'listModels',
          summary: 'List runtime-ready models',
          parameters: [{
            name: 'include',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['all'] },
            description: 'Use all to include registered but unready models and capability metadata.',
          }],
          responses: {
            '200': json({ $ref: '#/components/schemas/ModelList' }, 'Model inventory.'),
            '401': json({ $ref: '#/components/schemas/ErrorResponse' }, 'Bearer token missing or invalid.'),
          },
        },
      },
      '/v1/providers/status': {
        get: {
          operationId: 'listProviderStatus',
          summary: 'List provider readiness evidence',
          responses: {
            '200': json({ type: 'object', required: ['object', 'data'], properties: {
              object: { const: 'list' },
              data: { type: 'array', items: { $ref: '#/components/schemas/ProviderStatus' } },
            } }, 'Provider capability records.'),
            '401': json({ $ref: '#/components/schemas/ErrorResponse' }, 'Bearer token missing or invalid.'),
          },
        },
      },
      '/v1/responses': {
        post: {
          operationId: 'createResponse',
          summary: 'Create a response',
          parameters: [{ $ref: '#/components/parameters/RelaySession' }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ResponseRequest' } } },
          },
          responses: {
            '200': {
              description: 'Completed response or SSE stream.',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Response' } },
                'text/event-stream': { schema: { type: 'string' } },
              },
            },
            '400': json({ $ref: '#/components/schemas/ErrorResponse' }, 'Invalid or unsupported input.'),
            '401': json({ $ref: '#/components/schemas/ErrorResponse' }, 'Bearer token missing or invalid.'),
            '404': json({ $ref: '#/components/schemas/ErrorResponse' }, 'Model is not registered.'),
          },
        },
      },
      '/v1/chat/completions': {
        post: {
          operationId: 'createChatCompletion',
          summary: 'Create an OpenAI-compatible chat completion',
          parameters: [{ $ref: '#/components/parameters/RelaySession' }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ChatCompletionRequest' } } },
          },
          responses: {
            '200': {
              description: 'Chat completion or SSE stream.',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/ChatCompletion' } },
                'text/event-stream': { schema: { type: 'string' } },
              },
            },
            '400': json({ $ref: '#/components/schemas/ErrorResponse' }, 'Invalid request.'),
            '401': json({ $ref: '#/components/schemas/ErrorResponse' }, 'Bearer token missing or invalid.'),
            '404': json({ $ref: '#/components/schemas/ErrorResponse' }, 'Model is not registered.'),
          },
        },
      },
    },
    components: {
      parameters: {
        RelaySession: {
          name: 'x-relay-session',
          in: 'header',
          required: false,
          schema: { type: 'string', minLength: 1 },
          description: 'Optional sticky browser conversation identifier.',
        },
      },
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'opaque' },
      },
      schemas: {
        Health: {
          type: 'object',
          required: ['status', 'service', 'version', 'timestamp'],
          properties: {
            status: { const: 'ok' },
            service: { const: 'local-ai-relay' },
            version: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        RelayMetadata: {
          type: 'object',
          required: ['transport', 'execution_style', 'supports_sessions', 'supports_streaming', 'max_parallel_requests'],
          properties: {
            transport: { type: 'string', enum: ['mock', 'browser', 'api', 'local'] },
            execution_style: { type: 'string', enum: ['direct', 'batch', 'delegate'] },
            supports_sessions: { type: 'boolean' },
            supports_streaming: { type: 'boolean' },
            max_parallel_requests: { type: 'integer', minimum: 1 },
            capability_status: { type: 'string' },
            capability_detail: { type: 'string' },
            capability_evidence: { type: 'string' },
            capability_updated_at: { type: 'string', format: 'date-time' },
          },
        },
        Model: {
          type: 'object',
          required: ['id', 'object', 'created', 'owned_by'],
          properties: {
            id: { type: 'string' },
            object: { const: 'model' },
            created: { type: 'integer' },
            owned_by: { type: 'string' },
            x_relay: { $ref: '#/components/schemas/RelayMetadata' },
          },
        },
        ModelList: {
          type: 'object',
          required: ['object', 'data'],
          properties: {
            object: { const: 'list' },
            data: { type: 'array', items: { $ref: '#/components/schemas/Model' } },
          },
        },
        ProviderStatus: {
          type: 'object',
          required: ['provider_id', 'status', 'ready', 'evidence_expired', 'detail', 'updated_at'],
          properties: {
            provider_id: { type: 'string' },
            status: { type: 'string', enum: ['installed', 'authenticated', 'reachable', 'ready', 'degraded', 'disabled'] },
            ready: { type: 'boolean' },
            evidence: { type: ['object', 'null'] },
            evidence_expired: { type: 'boolean' },
            detail: { type: ['string', 'null'] },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        ChatMessage: {
          type: 'object',
          required: ['role', 'content'],
          properties: {
            role: { type: 'string', enum: ['system', 'user', 'assistant', 'tool'] },
            content: { type: ['string', 'null'] },
            name: { type: 'string' },
            tool_call_id: { type: 'string' },
          },
        },
        FunctionTool: {
          type: 'object',
          required: ['type', 'function'],
          properties: {
            type: { const: 'function' },
            function: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                parameters: { type: 'object' },
              },
            },
          },
        },
        ChatCompletionRequest: {
          type: 'object',
          required: ['messages'],
          properties: {
            model: { type: 'string' },
            messages: { type: 'array', minItems: 1, items: { $ref: '#/components/schemas/ChatMessage' } },
            stream: { type: 'boolean', default: false },
            temperature: { type: 'number' },
            top_p: { type: 'number' },
            max_tokens: { type: 'integer', minimum: 1 },
            tools: { type: 'array', items: { $ref: '#/components/schemas/FunctionTool' } },
          },
        },
        ChatCompletion: {
          type: 'object',
          required: ['id', 'object', 'created', 'model', 'choices', 'usage'],
          properties: {
            id: { type: 'string' },
            object: { const: 'chat.completion' },
            created: { type: 'integer' },
            model: { type: 'string' },
            choices: { type: 'array', items: { type: 'object' } },
            usage: { type: 'object' },
          },
        },
        ResponseRequest: {
          type: 'object',
          required: ['input'],
          properties: {
            model: { type: 'string' },
            input: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'object' } }] },
            instructions: { type: 'string' },
            stream: { type: 'boolean', default: false },
            temperature: { type: 'number' },
            top_p: { type: 'number' },
            max_output_tokens: { type: 'integer', minimum: 1 },
            tools: {
              type: 'array',
              items: { $ref: '#/components/schemas/ResponseFunctionTool' },
            },
            tool_choice: {
              oneOf: [
                { type: 'string', enum: ['auto', 'none', 'required'] },
                { type: 'object' },
              ],
            },
          },
        },
        ResponseFunctionTool: {
          type: 'object',
          required: ['type', 'name'],
          properties: {
            type: { const: 'function' },
            name: { type: 'string', minLength: 1 },
            description: { type: 'string' },
            parameters: { type: 'object' },
          },
        },
        Response: {
          type: 'object',
          required: ['id', 'object', 'status', 'model', 'output', 'output_text'],
          properties: {
            id: { type: 'string' },
            object: { const: 'response' },
            status: { type: 'string', enum: ['completed', 'failed', 'in_progress'] },
            model: { type: 'string' },
            output: { type: 'array', items: { type: 'object' } },
            output_text: { type: 'string' },
          },
        },
        ErrorResponse: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['message', 'type', 'code'],
              properties: {
                message: { type: 'string' },
                type: { type: 'string' },
                param: { type: ['string', 'null'] },
                code: { type: ['string', 'null'] },
              },
            },
          },
        },
      },
    },
  };
}

export function registerOpenApiRoutes(app: FastifyInstance): void {
  app.get('/openapi.json', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store').send(generateOpenAPISpec());
  });
}
