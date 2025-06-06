// transport/SerialTransport.ts
import { EventEmitter } from 'events';
import { SerialPortOptions, JadeTransport } from "../types";
import { encode, decodeSequence } from 'cbor2';

export class SerialTransport extends EventEmitter implements JadeTransport {
  private options: SerialPortOptions;
  private port: any | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private receivedBuffer: Uint8Array = new Uint8Array(0);

  constructor(options: SerialPortOptions) {
    super();
    this.options = options;
    console.log(`[SerialTransport] constructor: options =`, options);
  }

  drain(): void {
    console.log("[SerialTransport] drain(): clearing receivedBuffer");
    this.receivedBuffer = new Uint8Array(0);
  }

  async connect(): Promise<void> {
    console.log("[SerialTransport] → connect()");
    try {
      const serial = (navigator as any).serial;
      if (!serial) {
        throw new Error("Web Serial API is not supported in this browser.");
      }

      const ports: any[] = await serial.getPorts();
      console.log("[SerialTransport] available ports:", ports);
      if (ports.length === 0) {
        console.log("[SerialTransport] no existing port, calling requestPort()");
        this.port = await serial.requestPort();
      } else {
        console.log("[SerialTransport] using existing port:", ports[0]);
        this.port = ports[0];
      }

      if (!this.port) {
        throw new Error("No serial port selected.");
      }

      console.log(`[SerialTransport] opening port with baudRate=${this.options.baudRate || 115200}`);
      await this.port.open({ baudRate: this.options.baudRate || 115200 });
      console.log("[SerialTransport] port.open() succeeded");

      this.reader = this.port.readable?.getReader() || null;
      if (this.reader) {
        console.log("[SerialTransport] reader obtained, starting readLoop()");
        this.readLoop();
      } else {
        console.warn("[SerialTransport] reader is null after port.open()");
      }
    } catch (error) {
      console.error("[SerialTransport] connect failed:", error);
      throw error;
    }
  }

  private async readLoop(): Promise<void> {
    console.log("[SerialTransport] → readLoop()");
    if (!this.reader) {
      console.warn("[SerialTransport] readLoop(): no reader, exiting");
      return;
    }

    try {
      while (true) {
        const { value, done } = await this.reader.read();
        if (done) {
          console.log("[SerialTransport] readLoop: reader signaled done; attempting final decode");
          this.attemptFinalDecode();
          break;
        }
        if (value) {
          console.log(`[SerialTransport] readLoop: got ${value.length} bytes`);
          this.receivedBuffer = this.concatBuffers(this.receivedBuffer, value);
          console.log(`[SerialTransport] readLoop: buffer length now ${this.receivedBuffer.length}`);
          this.processReceivedData();
        }
      }
    } catch (error) {
      console.error("[SerialTransport] Read error (treating as done):", error);
      console.log("[SerialTransport] readLoop: attempting final decode after error");
      this.attemptFinalDecode();
    } finally {
      if (this.reader) {
        console.log("[SerialTransport] readLoop: releasing reader lock");
        this.reader.releaseLock();
        this.reader = null;
      }
      console.log("[SerialTransport] readLoop() ended");
    }
  }

  private processReceivedData(): void {
    console.log(`[SerialTransport] → processReceivedData(): buffer length = ${this.receivedBuffer.length}`);

    let bufferChanged = true;
    while (bufferChanged && this.receivedBuffer.length > 0) {
      bufferChanged = false;
      try {
        // Attempt to decode all complete CBOR items in the buffer
        const items = Array.from(decodeSequence(this.receivedBuffer));
        console.log(`[SerialTransport] decodeSequence yielded ${items.length} item(s)`);

        if (items.length === 0) {
          console.log("[SerialTransport] processReceivedData: no complete items yet, waiting for more bytes");
          break;
        }

        // Emit each decoded object
        let bytesConsumed = 0;
        for (const obj of items) {
          console.log("[SerialTransport] processReceivedData: decoded object →", obj);
          this.emit("message", obj);
          // Re-encode each object to find out how many bytes it occupied
          const reencoded = encode(obj);
          console.log(`[SerialTransport] processReceivedData: this object’s CBOR length = ${reencoded.length} bytes`);
          bytesConsumed += reencoded.length;
        }

        console.log(`[SerialTransport] processReceivedData: total bytes to remove = ${bytesConsumed}`);
        this.receivedBuffer = this.receivedBuffer.slice(bytesConsumed);
        console.log(`[SerialTransport] processReceivedData: buffer length after slicing = ${this.receivedBuffer.length}`);
        bufferChanged = true;
      } catch (err: any) {
        const msg = err.message || "";
        if (
          msg.includes("Insufficient data") ||
          msg.includes("Unexpected end") ||
          msg.includes("premature end")
        ) {
          console.log("[SerialTransport] processReceivedData: need more data to decode next item, breaking");
          break;
        }
        console.error("[SerialTransport] processReceivedData CBOR error (invalid data), clearing buffer:", err);
        this.receivedBuffer = new Uint8Array(0);
        break;
      }
    }

    console.log("[SerialTransport] ← processReceivedData() finished");
  }

  /**
   * When the reader finishes (done=true) or an error occurs, try one last decode
   * on whatever bytes remain in receivedBuffer. Emit any full CBOR items found.
   */
  private attemptFinalDecode(): void {
    console.log(`[SerialTransport] → attemptFinalDecode(): buffer length = ${this.receivedBuffer.length}`);
    try {
      const items = Array.from(decodeSequence(this.receivedBuffer));
      console.log(`[SerialTransport] attemptFinalDecode: decodeSequence yielded ${items.length} item(s)`);

      let bytesConsumed = 0;
      for (const obj of items) {
        console.log("[SerialTransport] attemptFinalDecode: decoded object →", obj);
        this.emit("message", obj);
        const reencoded = encode(obj);
        console.log(`[SerialTransport] attemptFinalDecode: this object’s CBOR length = ${reencoded.length} bytes`);
        bytesConsumed += reencoded.length;
      }

      console.log(`[SerialTransport] attemptFinalDecode: removing ${bytesConsumed} bytes from buffer`);
      this.receivedBuffer = this.receivedBuffer.slice(bytesConsumed);
      console.log(`[SerialTransport] attemptFinalDecode: buffer length now = ${this.receivedBuffer.length}`);
    } catch (err: any) {
      const msg = err.message || "";
      if (
        msg.includes("Insufficient data") ||
        msg.includes("Unexpected end")
      ) {
        console.log("[SerialTransport] attemptFinalDecode: leftover data not a full CBOR item, dropping it");
        this.receivedBuffer = new Uint8Array(0);
      } else {
        console.error("[SerialTransport] attemptFinalDecode CBOR error, clearing buffer:", err);
        this.receivedBuffer = new Uint8Array(0);
      }
    }
    console.log("[SerialTransport] ← attemptFinalDecode() finished");
  }

  private concatBuffers(a: Uint8Array, b: Uint8Array): Uint8Array {
    const result = new Uint8Array(a.length + b.length);
    result.set(a);
    result.set(b, a.length);
    return result;
  }

  async disconnect(): Promise<void> {
    console.log("[SerialTransport] → disconnect()");
    try {
      if (this.reader) {
        console.log("[SerialTransport] canceling reader");
        await this.reader.cancel();
      }
      if (this.port) {
        console.log("[SerialTransport] closing port");
        await this.port.close();
      }
      this.port = null;
      this.reader = null;
      console.log("[SerialTransport] ← Disconnected successfully");
    } catch (error) {
      console.error("[SerialTransport] Error during disconnect:", error);
    }
  }

  async sendMessage(message: any): Promise<void> {
    console.log("[SerialTransport] → sendMessage(): encoding and writing message:", message);
    try {
      if (!this.port || !this.port.writable) {
        throw new Error("Port not available");
      }
      const encoded = encode(message);
      console.log(`[SerialTransport] sendMessage: CBOR-encoded length = ${encoded.length}`);
      const writer = this.port.writable.getWriter();
      await writer.write(encoded);
      console.log("[SerialTransport] sendMessage: write completed");
      writer.releaseLock();
      console.log("[SerialTransport] sendMessage: writer released");
    } catch (error) {
      console.error("[SerialTransport] Failed to send message:", error);
      throw error;
    }
  }

  onMessage(callback: (message: any) => void): void {
    console.log("[SerialTransport] onMessage(): adding listener");
    this.on("message", callback);
  }
}

