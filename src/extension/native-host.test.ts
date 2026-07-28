import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { NativeHost, NativeMessagingEofError } from './native-host.js';
import type { BridgeFrame } from './native-protocol.js';

const frame: BridgeFrame = {
  protocol_version: '2.0',
  request_id: 'request',
  session_id: 'session',
  page_generation: 1,
  sequence_number: 1,
  event_type: 'heartbeat',
  payload: '{}',
  payload_hash: '',
};

test('NativeHost reads and writes Chrome length-prefixed frames', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const host = new NativeHost(input, output);
  const json = Buffer.from(JSON.stringify(frame));
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32LE(json.length);
  input.end(Buffer.concat([prefix, json]));

  assert.deepEqual(await host.readMessage(), frame);
  host.writeMessage(frame);
  const written = output.read() as Buffer;
  const length = written.readUInt32LE(0);
  const decoded = JSON.parse(written.subarray(4, 4 + length).toString('utf8'));
  assert.equal(decoded.request_id, frame.request_id);
});

test('NativeHost exits cleanly when Chrome closes stdin', async () => {
  const input = new PassThrough();
  input.end();
  const host = new NativeHost(input, new PassThrough());
  await assert.rejects(() => host.readMessage(), NativeMessagingEofError);
});
