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

export function chunkMessage(frame: BridgeFrame): BridgeFrame[] {
  const payload = frame.payload;
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  if (data.length <= MAX_CHUNK_SIZE) {
    return [{ ...frame, part_index: 0, total_parts: 1 }];
  }
  const chunks: BridgeFrame[] = [];
  const totalParts = Math.ceil(data.length / MAX_CHUNK_SIZE);
  const decoder = new TextDecoder();
  for (let i = 0; i < totalParts; i++) {
    const start = i * MAX_CHUNK_SIZE;
    const end = Math.min(start + MAX_CHUNK_SIZE, data.length);
    const partPayload = decoder.decode(data.subarray(start, end));
    chunks.push({
      ...frame,
      part_index: i,
      total_parts: totalParts,
      payload: partPayload,
    });
  }
  return chunks;
}

export function reassembleMessage(frames: BridgeFrame[]): string {
  if (frames.length === 0) return '';
  if (frames.length === 1) return frames[0].payload;
  const sorted = [...frames].sort((a, b) => (a.part_index ?? 0) - (b.part_index ?? 0));
  return sorted.map((f) => f.payload).join('');
}
