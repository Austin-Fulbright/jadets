// transport/SerialTransport.ts
import { EventEmitter } from 'events'
import { SerialPortOptions, JadeTransport } from '../types'
import { encode, decode } from 'cbor2'

export class SerialTransport extends EventEmitter implements JadeTransport {
  private options: SerialPortOptions
  private port: any = null
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null

  // for .read()
  private rawQueue: Uint8Array[] = []
  private rawResolvers: ((chunk: Uint8Array) => void)[] = []

  // for sendMessage/onMessage
  private rpcBuffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0)

  constructor(options: SerialPortOptions) {
    super()
    this.options = options
  }

  async connect(): Promise<void> {
    const serial = (navigator as any).serial
    if (!serial) throw new Error('Web Serial API not supported')
    const ports = await serial.getPorts()
    this.port = ports[0] || await serial.requestPort()
    if (!this.port) throw new Error('No serial port selected')
    await this.port.open({ baudRate: this.options.baudRate || 115200 })
    this.reader = this.port.readable!.getReader()
    this.readLoop()
  }

  private async readLoop(): Promise<void> {
    if (!this.reader) return
    try {
      while (true) {
        const { value, done } = await this.reader.read()
        if (done) break
        if (value) {
          if (this.rawResolvers.length) {
            this.rawResolvers.shift()!(value)
          } else {
            this.rawQueue.push(value)
          }
          this.rpcBuffer = this.concat(this.rpcBuffer, value)
          this.tryEmitRPC()
        }
      }
    } catch {
      // swallow
    } finally {
      this.reader.releaseLock()
      this.reader = null
    }
  }

  private tryEmitRPC() {
    // keep pulling full CBOR objects off rpcBuffer
    while (this.rpcBuffer.length) {
      try {
        const msg = decode(this.rpcBuffer)
        this.emit('message', msg)
        // drop the bytes that decode() consumed:
        const consumed = encode(msg).length
        this.rpcBuffer = this.rpcBuffer.slice(consumed)
      } catch (err: any) {
        const m = err.message || ''
        if (m.includes('Insufficient data') || m.includes('Unexpected end')) {
          // wait for more bytes
          return
        }
        // some other decode error → drop buffer
        this.rpcBuffer = new Uint8Array(0)
        return
      }
    }
  }

  /** high‐level RPC send */
  async sendMessage(obj: any): Promise<void> {
    const cborReq = encode(obj)
    await this.write(cborReq)
  }

  /** low‐level raw write */
  async write(bytes: Uint8Array): Promise<void> {
    if (!this.port?.writable) throw new Error('Port not available')
    const w = this.port.writable.getWriter()
    await w.write(bytes)
    w.releaseLock()
  }

  /** low‐level raw read */
  async read(): Promise<Uint8Array> {
    if (this.rawQueue.length) {
      return this.rawQueue.shift()!
    }
    return new Promise<Uint8Array>(res => {
      this.rawResolvers.push(res)
    })
  }

  /** RPC subscribe */
  onMessage(cb: (msg: any) => void): void {
    this.on('message', cb)
  }

  async disconnect(): Promise<void> {
    if (this.reader) await this.reader.cancel()
    if (this.port)  await this.port.close()
    this.reader = null
    this.port   = null
  }

  private concat(a: Uint8Array<ArrayBufferLike>, b: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBufferLike> {
    const out = new Uint8Array(a.length + b.length)
    out.set(a, 0)
    out.set(b, a.length)
    return out
  }
}

