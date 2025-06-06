// interface/JadeInterface.ts
import { decode, encode } from 'cbor-x';
import { JadeTransport, IJadeInterface, RPCRequest, RPCResponse } from "../types";
import { Logger, LogLevel } from "../logger";

export class JadeInterface implements IJadeInterface {
  private logger: Logger;

  constructor(
    private transport: JadeTransport,
    logLevel: LogLevel | keyof typeof LogLevel = LogLevel.INFO
  ) {
    this.logger = new Logger(logLevel);
    this.logger.debug("JadeInterface initialized", { logLevel });
  }

  async connect() {
    this.logger.debug("connect(): calling transport.connect()");
    await this.transport.connect();
    this.logger.debug("connect(): transport connected");
  }

  async disconnect() {
    this.logger.debug("disconnect(): calling transport.disconnect()");
    await this.transport.disconnect();
    this.logger.debug("disconnect(): transport disconnected");
  }

  buildRequest(id: string, method: string, params?: any): RPCRequest {
    this.logger.debug("buildRequest()", { id, method, params });
    return { id, method, params };
  }

  async makeRPCCall(request: RPCRequest, long_timeout: boolean = false): Promise<RPCResponse> {
    this.logger.debug("makeRPCCall(): validating request", request);
    if (!request.id || request.id.length > 16) {
      this.logger.error("makeRPCCall(): invalid request.id", request.id);
      throw new Error('Request id must be non-empty and less than 16 characters');
    }
    if (!request.method || request.method.length > 32) {
      this.logger.error("makeRPCCall(): invalid request.method", request.method);
      throw new Error('Request method must be non-empty and less than 32 characters');
    }

    this.logger.debug(`makeRPCCall(): sending RPC [${request.method}] id=${request.id}`, request.params);
    await this.transport.sendMessage(request);

    return new Promise<RPCResponse>((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      const onResponse = (msg: RPCResponse) => {
        this.logger.debug("makeRPCCall(): onResponse()", msg);
        if (msg.id === request.id) {
          this.transport.removeListener('message', onResponse);
          if (timeoutId) clearTimeout(timeoutId);
          this.logger.debug(`makeRPCCall(): received matching response id=${msg.id}`);
          resolve(msg);
        }
      };

      this.transport.onMessage(onResponse);

      if (!long_timeout) {
        this.logger.debug("makeRPCCall(): setting 5s timeout");
        timeoutId = setTimeout(() => {
          this.transport.removeListener('message', onResponse);
          this.logger.warn(`makeRPCCall(): RPC call timed out id=${request.id}`);
          reject(new Error('RPC call timed out'));
        }, 5000);
      } else {
        this.logger.debug("makeRPCCall(): long_timeout=true, no timer set");
      }
    });
  }

  private async _writeRequest(req: any): Promise<void> {
    const cborReq = this._serialiseCborRequest(req);
    this.logger.debug("writeRequest(): sending raw CBOR", req);
    await this.transport.write(cborReq);
    this.logger.debug("writeRequest(): raw CBOR sent");
  }

  private _serialiseCborRequest(request: any): Buffer {
    this.logger.verbose("serialiseCborRequest()", request);
    return encode(request);
  }

  private async _readCborMessage(): Promise<any> {
    this.logger.debug("_readCborMessage(): collecting chunks…");
    const chunks: Uint8Array[] = [];
    while (true) {
      const chunk: Uint8Array = await this.transport.read();
      this.logger.verbose("_readCborMessage(): got chunk", chunk.length, "bytes");
      if (!chunk || chunk.length === 0) {
        this.logger.warn("_readCborMessage(): no data received, throwing");
        throw new Error('Jade: no data received');
      }
      chunks.push(chunk);
      const buf = Buffer.concat(chunks as any);
      try {
        const result = decode(buf);
        this.logger.debug("_readCborMessage(): full CBOR message decoded", result);
        return result;
      } catch {
        this.logger.debug("_readCborMessage(): incomplete, reading more…");
      }
    }
  }

  private _validateReply(reply: any, expectedId: string): void {
    this.logger.debug("_validateReply()", { reply, expectedId });
    if (!reply || reply.id !== expectedId) {
      this.logger.error("_validateReply(): unexpected reply ID", reply?.id, "expected", expectedId);
      throw new Error(`Jade: unexpected reply ID (got ${reply?.id}, expected ${expectedId})`);
    }
    if ('error' in reply) {
      const e = reply.error;
      this.logger.error("_validateReply(): RPC error", e);
      throw new Error(`Jade RPC error ${e.code}: ${e.message}`);
    }
    this.logger.verbose("_validateReply(): reply OK");
  }

  private async _readResponse(expectedId: string): Promise<any> {
    this.logger.debug("_readResponse(): waiting for CBOR message id=", expectedId);
    const reply = await this._readCborMessage();
    this.logger.debug("_readResponse(): raw reply", reply);
    this._validateReply(reply, expectedId);
    this.logger.debug(`_readResponse(): validated reply id=${expectedId}`);
    return reply;
  }

  public async _signPSBT(network: string, psbt: Uint8Array): Promise<Uint8Array> {
    this.logger.debug("_signPSBT(): start", { network, psbtLength: psbt.length });
    const requestId = Math.floor(Math.random() * 1e6).toString();
    const request = { id: requestId, method: 'sign_psbt', params: { network, psbt } };
    this.logger.debug("_signPSBT(): writing initial request", request);
    await this._writeRequest(request);

    let reply = await this._readResponse(requestId);
    let resultBytes = Buffer.from(reply.result as Uint8Array);
    const total = reply.seqlen ?? 1;
    let seqnum = reply.seqnum ?? 1;
    this.logger.debug("_signPSBT(): got fragment", { seqnum, total, chunkLen: resultBytes.length });

    while (seqnum < total) {
      seqnum += 1;
      const extId = Math.floor(Math.random() * 1e6).toString();
      const extRequest = {
        id: extId,
        method: 'get_extended_data',
        params: { origid: requestId, orig: 'sign_psbt', seqnum, seqlen: total }
      };
      this.logger.debug("_signPSBT(): requesting extended data", extRequest);
      await this._writeRequest(extRequest);

      const extReply = await this._readResponse(extId);
      this.logger.debug("_signPSBT(): got extended fragment", extReply);
      resultBytes = Buffer.concat([resultBytes, Buffer.from(extReply.result as Uint8Array)]);
    }

    this.logger.debug("_signPSBT(): complete signed PSBT, total bytes:", resultBytes.length);
    return resultBytes;
  }
}

