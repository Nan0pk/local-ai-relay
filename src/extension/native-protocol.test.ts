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
    payload_hash: '',
  };

  const chunks = chunkMessage(frame);
  assert.ok(chunks.length >= 1);
  const result = reassembleMessage(chunks);
  assert.equal(result, frame.payload);
  assert.match(chunks[0]!.payload_hash, /^[a-f0-9]{64}$/);
});

test('chunkMessage preserves multi-byte Unicode across chunk boundaries', () => {
  const payload = '🙂漢字'.repeat(100_000);
  const frame: BridgeFrame = {
    protocol_version: '2.0',
    request_id: 'req-unicode',
    session_id: 'sess-1',
    page_generation: 1,
    sequence_number: 2,
    event_type: 'snapshot',
    payload,
    payload_hash: '',
  };
  const chunks = chunkMessage(frame);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => Buffer.byteLength(chunk.payload, 'utf8') <= 256 * 1024));
  assert.equal(reassembleMessage(chunks), payload);
  assert.ok(!chunks.some((chunk) => chunk.payload.includes('\uFFFD')));
});

test('reassembleMessage rejects incomplete or mixed multipart frames', () => {
  const frame: BridgeFrame = {
    protocol_version: '2.0',
    request_id: 'req-large',
    session_id: 'sess-1',
    page_generation: 1,
    sequence_number: 3,
    event_type: 'append',
    payload: 'x'.repeat(300_000),
    payload_hash: '',
  };
  const chunks = chunkMessage(frame);
  assert.throws(() => reassembleMessage(chunks.slice(1)), /Incomplete multipart/);
  assert.throws(
    () => reassembleMessage([chunks[0]!, { ...chunks[1]!, request_id: 'other' }]),
    /different requests/,
  );
  assert.throws(
    () => reassembleMessage([chunks[0]!, { ...chunks[1]!, sequence_number: 99 }]),
    /different requests/,
  );
  assert.throws(
    () => reassembleMessage([chunks[0]!, { ...chunks[1]!, payload_hash: '0'.repeat(64) }]),
    /different requests/,
  );
});
