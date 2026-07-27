export function generateOpenAPISpec(): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Local AI Relay API',
      version: '0.9.0',
      description: 'Local OpenAI-compatible relay for browser-backed and mock models.',
    },
    servers: [
      {
        url: 'http://127.0.0.1:8787',
        description: 'Local Loopback Relay Server',
      },
    ],
    paths: {
      '/health': {
        get: {
          summary: 'Health Check Endpoint',
          responses: {
            '200': {
              description: 'Relay server health status',
            },
          },
        },
      },
      '/v1/models': {
        get: {
          summary: 'List Ready Models',
          responses: {
            '200': {
              description: 'Array of currently ready models',
            },
          },
        },
      },
      '/v1/responses': {
        post: {
          summary: 'Responses API Endpoint',
          responses: {
            '200': {
              description: 'OpenAI-shaped Response object',
            },
          },
        },
      },
      '/v1/chat/completions': {
        post: {
          summary: 'Chat Completions Endpoint',
          responses: {
            '200': {
              description: 'OpenAI Chat Completion object',
            },
          },
        },
      },
    },
  };
}
