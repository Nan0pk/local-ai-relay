import { type BridgeFrame, chunkMessage } from './native-protocol.js';
import type { Readable, Writable } from 'node:stream';

const EVENT_TYPES = new Set<BridgeFrame['event_type']>([
  'hello', 'capabilities', 'ack', 'append', 'replace', 'snapshot',
  'final', 'error', 'cancel', 'heartbeat', 'resume',
]);

export class NativeMessagingEofError extends Error {
  constructor() {
    super('Native Messaging input closed.');
    this.name = 'NativeMessagingEofError';
  }
}

export class NativeHost {
  private buffer = Buffer.alloc(0);

  constructor(
    private readonly stdin: Readable = process.stdin,
    private readonly stdout: Writable = process.stdout,
  ) {}

  private async readBytes(length: number): Promise<Buffer> {
    while (this.buffer.length < length) {
      const chunk = this.stdin.read();
      if (chunk) {
        this.buffer = Buffer.concat([this.buffer, chunk as Buffer]);
      } else {
        if (this.stdin.readableEnded || this.stdin.destroyed) throw new NativeMessagingEofError();
        await new Promise<void>((resolve, reject) => {
          const onReadable = () => {
            cleanup();
            resolve();
          };
          const onEnd = () => {
            cleanup();
            reject(new NativeMessagingEofError());
          };
          const onError = (error: Error) => {
            cleanup();
            reject(error);
          };
          const cleanup = () => {
            this.stdin.off('readable', onReadable);
            this.stdin.off('end', onEnd);
            this.stdin.off('error', onError);
          };
          this.stdin.once('readable', onReadable);
          this.stdin.once('end', onEnd);
          this.stdin.once('error', onError);
        });
      }
    }
    const result = this.buffer.subarray(0, length);
    this.buffer = this.buffer.subarray(length);
    return result;
  }

  async readMessage(): Promise<BridgeFrame> {
    const lengthBuffer = await this.readBytes(4);
    const len = lengthBuffer.readUInt32LE(0);
    if (len === 0 || len > 1024 * 1024) {
      throw new Error(`Frame too large: ${len} bytes`);
    }
    const payloadBuffer = await this.readBytes(len);
    const json = payloadBuffer.toString('utf8');
    const parsed = JSON.parse(json) as Partial<BridgeFrame>;
    if (
      parsed.protocol_version !== '2.0'
      || typeof parsed.request_id !== 'string'
      || typeof parsed.session_id !== 'string'
      || typeof parsed.page_generation !== 'number'
      || !Number.isSafeInteger(parsed.page_generation)
      || parsed.page_generation < 0
      || typeof parsed.sequence_number !== 'number'
      || !Number.isSafeInteger(parsed.sequence_number)
      || parsed.sequence_number < 0
      || typeof parsed.event_type !== 'string'
      || !EVENT_TYPES.has(parsed.event_type as BridgeFrame['event_type'])
      || typeof parsed.payload !== 'string'
      || typeof parsed.payload_hash !== 'string'
      || (parsed.part_index !== undefined
        && (!Number.isSafeInteger(parsed.part_index) || parsed.part_index < 0))
      || (parsed.total_parts !== undefined
        && (!Number.isSafeInteger(parsed.total_parts) || parsed.total_parts < 1))
    ) {
      throw new Error('Invalid Native Messaging bridge frame.');
    }
    return parsed as BridgeFrame;
  }

  writeMessage(frame: BridgeFrame): void {
    const chunks = chunkMessage(frame);
    for (const chunk of chunks) {
      const json = JSON.stringify(chunk);
      const data = Buffer.from(json, 'utf8');
      const lenBuffer = Buffer.alloc(4);
      lenBuffer.writeUInt32LE(data.length, 0);
      this.stdout.write(Buffer.concat([lenBuffer, data]));
    }
  }
}
