#!/usr/bin/env node
import { createMcpServer } from './server.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createDaemonClient } from './daemon-client.js';
import { getOrGenerateToken } from '../auth/token.js';
import { resolveRelayPort } from '../startup/relay-location.js';

try { process.loadEnvFile?.(); } catch { /* optional .env */ }

const DAEMON_URL = process.env.LOCAL_AI_RELAY_DAEMON_URL
  || `http://127.0.0.1:${await resolveRelayPort()}`;
const API_TOKEN = process.env.LOCAL_AI_RELAY_TOKEN || await getOrGenerateToken();

const daemonClient = createDaemonClient(DAEMON_URL, API_TOKEN);
const server = createMcpServer(daemonClient);

const transport = new StdioServerTransport();
await server.connect(transport);
