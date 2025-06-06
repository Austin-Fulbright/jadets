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
    console.log("[SerialTransport] constructor: options =", this.options);
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
        console.log("[SerialTransport] no ports, calling requestPort()");
        this.port = await serial.requestPort();
      } else {
        console.log("[SerialTransport] using existing port:", ports[0]);
        this.port = ports[0];
      }

      if (!this.port) {
        throw new Error("No serial port selected.");
      }

      console.log(
        `[SerialTransport] opening port with baudRate=${
          this.options.baudRate || 115200
        }`
      );
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
      console.error("[SerialTransport] Failed to connect:", error);
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
          console.log(
            `[SerialTransport] readLoop: got ${value.length} bytes, appending to buffer`
          );
          this.receivedBuffer = this.concatBuffers(this.receivedBuffer, value);
          console.log(
            `[SerialTransport] readLoop: buffer length now ${this.receivedBuffer.length}`
          );
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
    console.log(
      `[SerialTransport] → processReceivedData(): buffer length = ${this.receivedBuffer.length}`
    );
    let index = 1;
    while (index <= this.receivedBuffer.length) {
      try {
        const sliceToTry = this.receivedBuffer.slice(0, index);
        const decoded = decode(sliceToTry);
        if (
          decoded &&
          typeof decoded === "object" &&
          (("error" in decoded) ||
            ("result" in decoded) ||
            ("log" in decoded) ||
            ("method" in decoded))
        ) {
          console.log(
            "[SerialTransport] processReceivedData: decoded full CBOR message:",
            decoded
          );
          this.emit("message", decoded);
        } else {
          console.warn(
            "[SerialTransport] processReceivedData: decoded message missing expected keys:",
            decoded
          );
        }
        this.receivedBuffer = this.receivedBuffer.slice(index);
        console.log(
          `[SerialTransport] processReceivedData: buffer sliced, new length = ${this.receivedBuffer.length}`
        );
        index = 1;
      } catch (error: any) {
        if (
          error.message &&
          (error.message.includes("Offset is outside") ||
            error.message.includes("Insufficient data") ||
            error.message.includes("Unexpected end of stream"))
        ) {
          index++;
          if (index > this.receivedBuffer.length) {
            console.log(
              "[SerialTransport] processReceivedData: need more data, breaking"
            );
            break;
          }
        } else {
          console.error("[SerialTransport] CBOR decode error:", error);
          console.log(
            "[SerialTransport] processReceivedData: clearing entire buffer"
          );
          this.receivedBuffer = new Uint8Array(0);
          break;
        }
      }
    }
    console.log("[SerialTransport] ← processReceivedData() finished");
  }

  /**
   * Try to decode any complete CBOR frames left in receivedBuffer,
   * even if Jade closed mid-stream. Continues until no full frame remains.
   */
  private attemptFinalDecode(): void {
    console.log(
      `[SerialTransport] → attemptFinalDecode(): buffer length = ${this.receivedBuffer.length}`
    );
    let index = 1;
    const totalLen = this.receivedBuffer.length;
    while (index <= totalLen) {
      try {
        const sliceToTry = this.receivedBuffer.slice(0, index);
        const decoded = decode(sliceToTry);
        if (
          decoded &&
          typeof decoded === "object" &&
          (("error" in decoded) ||
            ("result" in decoded) ||
            ("log" in decoded) ||
            ("method" in decoded))
        ) {
          console.log(
            "[SerialTransport] attemptFinalDecode: decoded full CBOR message:",
            decoded
          );
          this.emit("message", decoded);
          this.receivedBuffer = this.receivedBuffer.slice(index);
          console.log(
            `[SerialTransport] attemptFinalDecode: buffer sliced, new length = ${this.receivedBuffer.length}`
          );
          // Reset index and totalLen for next pass
          index = 1;
        } else {
          console.warn(
            "[SerialTransport] attemptFinalDecode: decoded object missing expected keys:",
            decoded
          );
          // Remove bytes to avoid infinite loop, then continue
          this.receivedBuffer = this.receivedBuffer.slice(index);
          index = 1;
        }
      } catch (error: any) {
        if (
          error.message &&
          (error.message.includes("Offset is outside") ||
            error.message.includes("Insufficient data") ||
            error.message.includes("Unexpected end of stream"))
        ) {
          index++;
          if (index > this.receivedBuffer.length) {
            console.log(
              "[SerialTransport] attemptFinalDecode: still need more data, giving up"
            );
            break;
          }
        } else {
          console.error("[SerialTransport] attemptFinalDecode CBOR error:", error);
          this.receivedBuffer = new Uint8Array(0);
          break;
        }
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
    console.log(
      "[SerialTransport] → sendMessage(): encoding and writing message:",
      message
    );
    try {
      if (!this.port || !this.port.writable) {
        throw new Error("Port not available");
      }
      const encoded = encode(message);
      console.log(
        `[SerialTransport] sendMessage: encoded length = ${encoded.length}`
      );
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

