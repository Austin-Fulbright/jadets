// transport/SerialTransport.ts
import { EventEmitter } from 'events';
import { SerialPortOptions, JadeTransport } from "../types";
import { encode, decode } from 'cbor2';

export class SerialTransport extends EventEmitter implements JadeTransport {
  private options: SerialPortOptions;
  private port: any | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private receivedBuffer: Uint8Array = new Uint8Array(0);

  constructor(options: SerialPortOptions) {
    super();
    this.options = options;
  }

  drain(): void {
    this.receivedBuffer = new Uint8Array(0);
  }

  async connect(): Promise<void> {
    try {
      const serial = (navigator as any).serial;
      if (!serial) {
        throw new Error('Web Serial API is not supported in this browser.');
      }

      const ports: any[] = await serial.getPorts();
      if (ports.length === 0) {
        this.port = await serial.requestPort();
      } else {
        this.port = ports[0];
      }

      if (!this.port) {
        throw new Error('No serial port selected.');
      }

      await this.port.open({ baudRate: this.options.baudRate || 115200 });
      this.reader = this.port.readable?.getReader() || null;
      if (this.reader) {
        this.readLoop();
      }
    } catch (error) {
      console.error('[WebSerialPort] Failed to connect:', error);
      throw error;
    }
  }

  private async readLoop(): Promise<void> {
    if (!this.reader) return;

    try {
      while (true) {
        const { value, done } = await this.reader.read();
        if (done) {
          break;
        }
        if (value) {
          this.receivedBuffer = this.concatBuffers(this.receivedBuffer, value);
          this.processReceivedData();
        }
      }
    } catch (error) {
      console.error('[WebSerialPort] Read error:', error);
    } finally {
      if (this.reader) {
        this.reader.releaseLock();
        this.reader = null;
      }
    }
  }

  private processReceivedData(): void {
    let index = 1;
    while (index <= this.receivedBuffer.length) {
      try {
        const sliceToTry = this.receivedBuffer.slice(0, index);
        const decoded = decode(sliceToTry);
        if (
          decoded &&
          typeof decoded === 'object' &&
          (('error' in decoded) ||
            ('result' in decoded) ||
            ('log' in decoded) ||
            ('method' in decoded))
        ) {
          this.emit('message', decoded);
        }
        this.receivedBuffer = this.receivedBuffer.slice(index);
        index = 1;
      } catch (error: any) {
        if (
          error.message &&
          (error.message.includes('Offset is outside') ||
            error.message.includes('Insufficient data') ||
            error.message.includes('Unexpected end of stream'))
        ) {
          index++;
          if (index > this.receivedBuffer.length) {
            break;
          }
        } else {
          console.error('[WebSerialPort] CBOR decode error:', error);
          this.receivedBuffer = new Uint8Array(0);
          break;
        }
      }
    }
  }

  private concatBuffers(a: Uint8Array, b: Uint8Array): Uint8Array {
    const result = new Uint8Array(a.length + b.length);
    result.set(a);
    result.set(b, a.length);
    return result;
  }

  async disconnect(): Promise<void> {
    try {
      if (this.reader) {
        await this.reader.cancel();
      }
      if (this.port) {
        await this.port.close();
      }
      this.port = null;
      this.reader = null;
      console.log('[WebSerialPort] Disconnected successfully.');
    } catch (error) {
      console.error('[WebSerialPort] Error during disconnect:', error);
    }
  }

  async sendMessage(message: any): Promise<void> {
    try {
      if (!this.port || !this.port.writable) {
        throw new Error('Port not available');
      }
      const encoded = encode(message);
      const writer = this.port.writable.getWriter();
      await writer.write(encoded);
      writer.releaseLock();
    } catch (error) {
      console.error('[WebSerialPort] Failed to send message:', error);
      throw error;
    }
  }

  onMessage(callback: (message: any) => void): void {
    this.on('message', callback);
  }
}

