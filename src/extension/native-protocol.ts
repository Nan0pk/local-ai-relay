import { createHash } from 'node:crypto';

export interface BridgeFrame {
  protocol_version: '2.0';
  request_id: string;
  session_id: string;
  page_generation: number;
  sequence_number: number;
  event_type: 'hello' | 'capabilities' | 'ack' | 'append' | 'replace' | 'snapshot' | 'final' | 'error' | 'cancel' | 'heartbeat' | 'resume';
  part_index?: number;
  total_parts?: number;
  payload: string; // JSON or base64 fragment
  payload_hash: string; // SHA-256
}

// Maximum chunk size (256 KiB) to stay well under Chrome's 1 MB limit
const MAX_CHUNK_SIZE = 256 * 1024;

function payloadHash(payload: string): string {
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

export function chunkMessage(frame: BridgeFrame): BridgeFrame[] {
  const payload = frame.payload;
  const hash = frame.payload_hash || payloadHash(payload);
  if (Buffer.byteLength(payload, 'utf8') <= MAX_CHUNK_SIZE) {
    return [{ ...frame, payload_hash: hash, part_index: 0, total_parts: 1 }];
  }

  const payloadParts: string[] = [];
  let part = '';
  let partBytes = 0;
  for (const character of payload) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (part && partBytes + characterBytes > MAX_CHUNK_SIZE) {
      payloadParts.push(part);
      part = '';
      partBytes = 0;
    }
    part += character;
    partBytes += characterBytes;
  }
  if (part) payloadParts.push(part);

  return payloadParts.map((partPayload, index) => ({
    ...frame,
    payload_hash: hash,
    part_index: index,
    total_parts: payloadParts.length,
    payload: partPayload,
  }));
}

export function reassembleMessage(frames: BridgeFrame[]): string {
  if (frames.length === 0) return '';
  const first = frames[0]!;
  const expectedParts = first.total_parts ?? 1;
  if (frames.length !== expectedParts) {
    throw new Error(`Incomplete multipart message: expected ${expectedParts} parts, received ${frames.length}.`);
  }
  for (const frame of frames) {
    if (
      frame.request_id !== first.request_id
      || frame.session_id !== first.session_id
      || frame.protocol_version !== first.protocol_version
      || frame.page_generation !== first.page_generation
      || frame.sequence_number !== first.sequence_number
      || frame.event_type !== first.event_type
      || frame.total_parts !== expectedParts
      || frame.payload_hash !== first.payload_hash
    ) {
      throw new Error('Multipart message contains frames from different requests.');
    }
  }
  const sorted = [...frames].sort((a, b) => (a.part_index ?? 0) - (b.part_index ?? 0));
  const indexes = sorted.map((frame) => frame.part_index ?? 0);
  if (new Set(indexes).size !== expectedParts || indexes.some((value, index) => value !== index)) {
    throw new Error('Multipart message has duplicate or non-contiguous part indexes.');
  }
  const payload = sorted.map((frame) => frame.payload).join('');
  if (first.payload_hash && payloadHash(payload) !== first.payload_hash) {
    throw new Error('Multipart message payload hash does not match.');
  }
  return payload;
}
