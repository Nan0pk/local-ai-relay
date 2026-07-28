import assert from 'node:assert/strict';
import test from 'node:test';
import { handleFrame } from './host-main.js';
import type { BridgeFrame } from './native-protocol.js';

function frame(
  sessionId: string,
  eventType: BridgeFrame['event_type'],
  requestId: string = crypto.randomUUID(),
): BridgeFrame {
  return {
    protocol_version: '2.0',
    request_id: requestId,
    session_id: sessionId,
    page_generation: 0,
    sequence_number: 0,
    event_type: eventType,
    payload: '{}',
    payload_hash: '',
  };
}

test('native host requires hello and acknowledges a live session', () => {
  const sessionId = `session-${crypto.randomUUID()}`;
  assert.equal(handleFrame(frame(sessionId, 'heartbeat')).event_type, 'error');
  assert.equal(handleFrame(frame(sessionId, 'hello')).event_type, 'ack');
  assert.equal(handleFrame(frame(sessionId, 'heartbeat')).event_type, 'ack');
});

test('native host reports active request IDs when a session resumes', () => {
  const sessionId = `session-${crypto.randomUUID()}`;
  const requestId = `request-${crypto.randomUUID()}`;
  handleFrame(frame(sessionId, 'hello'));
  handleFrame(frame(sessionId, 'append', requestId));
  const response = handleFrame(frame(sessionId, 'hello'));
  assert.equal(response.event_type, 'resume');
  assert.deepEqual(JSON.parse(response.payload).active_requests, [requestId]);
  handleFrame(frame(sessionId, 'final', requestId));
});
