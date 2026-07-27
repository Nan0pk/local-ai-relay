import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkMessage, reassembleMessage, type BridgeFrame } from './native-protocol.js';

test('chunkMessage and reassembleMessage roundtrip', () => {
  const frame: BridgeFrame = {
    protocol_version: '2.0',
    request_id: 'req-1',
    session_id: 'sess-1',
    page_generation: 1,
    sequence_number: 1,
    event_type: 'append',
    payload: 'Hello world! '.repeat(100),
    payload_hash: 'abc',
  };

  const chunks = chunkMessage(frame);
  assert.ok(chunks.length >= 1);
  const result = reassembleMessage(chunks);
  assert.equal(result, frame.payload);
});
