#!/usr/bin/env node
import { createMcpServer } from './server.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createDaemonClient } from './daemon-client.js';

const DAEMON_URL = process.env.LOCAL_AI_RELAY_DAEMON_URL || 'http://127.0.0.1:8787';
const API_TOKEN = process.env.LOCAL_AI_RELAY_TOKEN || '';

if (!API_TOKEN) {
  console.error('Missing LOCAL_AI_RELAY_TOKEN environment variable');
  process.exit(1);
}

const daemonClient = createDaemonClient(DAEMON_URL, API_TOKEN);
const server = createMcpServer(daemonClient);

const transport = new StdioServerTransport();
await server.connect(transport);
