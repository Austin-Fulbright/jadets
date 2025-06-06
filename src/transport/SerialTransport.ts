// transport/SerialTransport.ts
import { EventEmitter } from 'events';
import { SerialPortOptions, JadeTransport } from "../types";
import { encode, decodeSequence } from 'cbor2'; // (Assumes decodeSequence is exported by your CBOR library)

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
    // Clear out any queued bytes
    this.receivedBuffer = new Uint8Array(0);
  }

  async connect(): Promise<void> {
    try {
      const serial = (navigator as any).serial;
      if (!serial) {
        throw new Error('Web Serial API is not supported in this browser.');
      }

      // Either grab an existing port or ask the user to pick one
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
          // Stream closed; attempt one final decode of whatever’s left
          this.attemptFinalDecode();
          break;
        }
        if (value) {
          this.receivedBuffer = this.concatBuffers(this.receivedBuffer, value);
          this.processReceivedData();
        }
      }
    } catch (error) {
      console.error('[WebSerialPort] Read error (treating as done):', error);
      this.attemptFinalDecode();
    } finally {
      if (this.reader) {
        this.reader.releaseLock();
        this.reader = null;
      }
    }
  }

  private processReceivedData(): void {
    // Try decoding as many full CBOR items from receivedBuffer as possible
    let bufferChanged = true;
    while (bufferChanged && this.receivedBuffer.length > 0) {
      bufferChanged = false;
      try {
        // decodeSequence yields each complete CBOR value at a time
        const items = Array.from(decodeSequence(this.receivedBuffer));
        if (items.length === 0) {
          // No complete items yet; wait for more bytes
          break;
        }

        // For each decoded item, emit it
        for (const obj of items) {
          this.emit('message', obj);
        }

        // Now remove exactly the bytes that correspond to all items we just emitted.
        // decodeSequence consumed each complete item in order, so the last cursor position
        // equals the sum of encoded lengths of those items. We can find that by re-encoding
        // each object back to CBOR, but a faster (and safer) way is to use the
        // internal length information from decodeSequence. Unfortunately cbor2’s decodeSequence
        // does not give us “consumed-byte count” directly. Instead, we’ll slice off exactly the
        // total length of every encoded item in sequence, by incrementally re-encoding each
        // decoded object and reducing the buffer length.

        let bytesConsumed = 0;
        for (const obj of items) {
          const reencoded = encode(obj);
          bytesConsumed += reencoded.length;
        }
        this.receivedBuffer = this.receivedBuffer.slice(bytesConsumed);
        bufferChanged = true;
      } catch (err: any) {
        // If decodeSequence threw “insufficient data” or “unexpected end”, break and wait for more
        if (
          err.message.includes('Insufficient data') ||
          err.message.includes('Unexpected end') ||
          err.message.includes('premature end')
        ) {
          break;
        }
        // Any other error means invalid CBOR; throw it away entirely
        console.error('[WebSerialPort] CBOR decodeSequence error:', err);
        this.receivedBuffer = new Uint8Array(0);
        break;
      }
    }
  }

  /**
   * When the stream closes (done) or errors, attempt one final pass over
   * whatever leftover bytes remain. If they form one or more full CBOR items,
   * decode & emit them; otherwise drop them.
   */
  private attemptFinalDecode(): void {
    try {
      const items = Array.from(decodeSequence(this.receivedBuffer));
      let bytesConsumed = 0;
      for (const obj of items) {
        this.emit('message', obj);
        const reencoded = encode(obj);
        bytesConsumed += reencoded.length;
      }
      this.receivedBuffer = this.receivedBuffer.slice(bytesConsumed);
    } catch (err: any) {
      // If there isn’t a full item left, ignore
      if (
        err.message.includes('Insufficient data') ||
        err.message.includes('Unexpected end')
      ) {
        // simply drop whatever cannot decode
        this.receivedBuffer = new Uint8Array(0);
      } else {
        console.error('[WebSerialPort] attemptFinalDecode CBOR error:', err);
        this.receivedBuffer = new Uint8Array(0);
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

