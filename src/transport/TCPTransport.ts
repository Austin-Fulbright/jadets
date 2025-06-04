// src/transport/TCPTransport.ts
import { EventEmitter } from 'events';
import net from 'net';
import { encode, decode } from 'cbor2';
import { JadeTransport } from '../types';

export class TCPTransport extends EventEmitter implements JadeTransport {
  private socket: net.Socket | null = null;
  private recvBuffer = Buffer.alloc(0);

  constructor(private host: string, private port: number) {
    super();
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new net.Socket();
      this.socket.once('error', reject);
      this.socket.connect(this.port, this.host, () => {
        this.socket!
          .on('data', this.onData.bind(this))
          .on('error', (err) => this.emit('error', err))
          .on('close', () => this.emit('disconnect'));
        resolve();
      });
    });
  }

  async disconnect(): Promise<void> {
    if (!this.socket) return;
    return new Promise((resolve) => {
      this.socket!.end(() => {
        this.socket = null;
        resolve();
      });
    });
  }

  async sendMessage(msg: any): Promise<void> {
    if (!this.socket) throw new Error('Not connected');
    const chunk = encode(msg);
    this.socket.write(chunk);
  }

  onMessage(callback: (msg: any) => void): void {
    this.on('message', callback);
  }

  private onData(data: Buffer) {
    // 1) Accumulate incoming bytes
    this.recvBuffer = Buffer.concat([this.recvBuffer, data]);

    // 2) Try to decode as many top-level CBOR items as we can
    while (this.recvBuffer.length > 0) {
      try {
        // decode returns the first full CBOR object in the buffer
        const obj = decode(this.recvBuffer);

        // emit it
        this.emit('message', obj);

        // figure out how many bytes that object consumed
        const consumed = encode(obj).length;

        // drop those bytes and loop to decode next
        this.recvBuffer = this.recvBuffer.slice(consumed);
      } catch (e: any) {
        // if it's "Insufficient data", we just break and wait for more bytes
        if (e.message.includes('Insufficient data') || e.message.includes('Unexpected end of stream')) {
          break;
        }
        // otherwise it's a real error — emit and clear buffer
        this.emit('error', e);
        this.recvBuffer = Buffer.alloc(0);
        break;
      }
    }
  }
}

