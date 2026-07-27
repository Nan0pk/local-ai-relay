#!/usr/bin/env node
import { NativeHost } from './native-host.js';
import { type BridgeFrame } from './native-protocol.js';
import { createDaemonClient } from '../mcp/daemon-client.js';

const DAEMON_URL = process.env.LOCAL_AI_RELAY_DAEMON_URL || 'http://127.0.0.1:8787';
const API_TOKEN = process.env.LOCAL_AI_RELAY_TOKEN || '';

if (!API_TOKEN) {
  console.error('Missing LOCAL_AI_RELAY_TOKEN');
  process.exit(1);
}

const host = new NativeHost();
const daemon = createDaemonClient(DAEMON_URL, API_TOKEN);

// Map request IDs to active sessions
const sessions = new Map<string, { requests: unknown[] }>();

async function handleFrame(frame: BridgeFrame) {
  const { event_type, request_id, session_id, page_generation, payload } = frame;

  switch (event_type) {
    case 'hello': {
      const session = sessions.get(session_id);
      if (session) {
        host.writeMessage({
          protocol_version: '2.0',
          request_id: `resume-${Date.now()}`,
          session_id,
          page_generation,
          sequence_number: 0,
          event_type: 'resume',
          payload: JSON.stringify({
            active_requests: session.requests,
          }),
          payload_hash: '',
        });
      } else {
        sessions.set(session_id, { requests: [] });
        host.writeMessage({
          protocol_version: '2.0',
          request_id: `ack-${Date.now()}`,
          session_id,
          page_generation,
          sequence_number: 0,
          event_type: 'ack',
          payload: JSON.stringify({ status: 'hello_acknowledged' }),
          payload_hash: '',
        });
      }
      break;
    }

    case 'capabilities': {
      try {
        host.writeMessage({
          protocol_version: '2.0',
          request_id,
          session_id,
          page_generation,
          sequence_number: 0,
          event_type: 'ack',
          payload: JSON.stringify({ status: 'capabilities_received' }),
          payload_hash: '',
        });
      } catch (err: unknown) {
        host.writeMessage({
          protocol_version: '2.0',
          request_id,
          session_id,
          page_generation,
          sequence_number: 0,
          event_type: 'error',
          payload: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          payload_hash: '',
        });
      }
      break;
    }

    case 'append':
    case 'replace':
    case 'snapshot':
    case 'final': {
      try {
        const result = await daemon.delegateRequest('browser-default', payload, []);
        host.writeMessage({
          protocol_version: '2.0',
          request_id,
          session_id,
          page_generation,
          sequence_number: 0,
          event_type: 'ack',
          payload: JSON.stringify(result),
          payload_hash: '',
        });
      } catch (err: unknown) {
        host.writeMessage({
          protocol_version: '2.0',
          request_id,
          session_id,
          page_generation,
          sequence_number: 0,
          event_type: 'error',
          payload: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          payload_hash: '',
        });
      }
      break;
    }

    case 'cancel': {
      host.writeMessage({
        protocol_version: '2.0',
        request_id,
        session_id,
        page_generation,
        sequence_number: 0,
        event_type: 'ack',
        payload: JSON.stringify({ status: 'cancelled' }),
        payload_hash: '',
      });
      break;
    }

    case 'heartbeat': {
      host.writeMessage({
        protocol_version: '2.0',
        request_id,
        session_id,
        page_generation,
        sequence_number: 0,
        event_type: 'ack',
        payload: JSON.stringify({ status: 'alive' }),
        payload_hash: '',
      });
      break;
    }

    default:
      host.writeMessage({
        protocol_version: '2.0',
        request_id,
        session_id,
        page_generation,
        sequence_number: 0,
        event_type: 'error',
        payload: JSON.stringify({ error: `Unknown event type: ${event_type}` }),
        payload_hash: '',
      });
  }
}

async function main() {
  while (true) {
    try {
      const frame = await host.readMessage();
      await handleFrame(frame);
    } catch (err) {
      console.error('Native host error:', err);
    }
  }
}

main().catch(console.error);
