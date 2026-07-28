#!/usr/bin/env node
import { NativeHost, NativeMessagingEofError } from './native-host.js';
import { type BridgeFrame } from './native-protocol.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordBrowserBridgeHeartbeat } from './bridge-status.js';

const sessions = new Map<string, { requestIds: Set<string> }>();

function responseFrame(
  frame: BridgeFrame,
  eventType: BridgeFrame['event_type'],
  payload: Record<string, unknown>,
): BridgeFrame {
  return {
    protocol_version: '2.0',
    request_id: frame.request_id,
    session_id: frame.session_id,
    page_generation: frame.page_generation,
    sequence_number: frame.sequence_number,
    event_type: eventType,
    payload: JSON.stringify(payload),
    payload_hash: '',
  };
}

export function handleFrame(frame: BridgeFrame): BridgeFrame {
  if (frame.event_type === 'hello') {
    recordBrowserBridgeHeartbeat(frame.session_id);
    const existing = sessions.get(frame.session_id);
    if (existing) {
      return responseFrame(frame, 'resume', {
        active_requests: [...existing.requestIds],
      });
    }
    sessions.set(frame.session_id, { requestIds: new Set() });
    return responseFrame(frame, 'ack', { status: 'hello_acknowledged' });
  }

  const session = sessions.get(frame.session_id);
  if (!session) {
    return responseFrame(frame, 'error', { error: 'hello_required' });
  }

  switch (frame.event_type) {
    case 'capabilities':
    case 'append':
    case 'replace':
    case 'snapshot':
      session.requestIds.add(frame.request_id);
      return responseFrame(frame, 'ack', { status: `${frame.event_type}_received` });
    case 'final':
    case 'cancel':
      session.requestIds.delete(frame.request_id);
      return responseFrame(frame, 'ack', { status: frame.event_type === 'final' ? 'final_received' : 'cancelled' });
    case 'heartbeat':
      recordBrowserBridgeHeartbeat(frame.session_id);
      return responseFrame(frame, 'ack', { status: 'alive' });
    case 'ack':
    case 'error':
    case 'resume':
      return responseFrame(frame, 'error', { error: `unexpected_extension_event:${frame.event_type}` });
    default:
      return responseFrame(frame, 'error', { error: `unknown_event:${String(frame.event_type)}` });
  }
}

async function main(): Promise<void> {
  const host = new NativeHost();
  while (true) {
    try {
      const frame = await host.readMessage();
      host.writeMessage(handleFrame(frame));
    } catch (error) {
      if (error instanceof NativeMessagingEofError) return;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Native host rejected a frame: ${message}`);
      return;
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main();
}
