import { type BridgeFrame, chunkMessage } from './native-protocol.js';

export class NativeHost {
  private stdin = process.stdin;
  private stdout = process.stdout;
  private buffer = Buffer.alloc(0);

  private async readBytes(length: number): Promise<Buffer> {
    while (this.buffer.length < length) {
      const chunk = this.stdin.read();
      if (chunk) {
        this.buffer = Buffer.concat([this.buffer, chunk as Buffer]);
      } else {
        await new Promise<void>((resolve) => this.stdin.once('readable', resolve));
      }
    }
    const result = this.buffer.subarray(0, length);
    this.buffer = this.buffer.subarray(length);
    return result;
  }

  async readMessage(): Promise<BridgeFrame> {
    const lengthBuffer = await this.readBytes(4);
    const len = lengthBuffer.readUInt32LE(0);
    if (len > 1024 * 1024) {
      throw new Error(`Frame too large: ${len} bytes`);
    }
    const payloadBuffer = await this.readBytes(len);
    const json = payloadBuffer.toString('utf8');
    return JSON.parse(json) as BridgeFrame;
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
