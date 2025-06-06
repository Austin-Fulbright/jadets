// interface/JadeInterface.ts
import { decode, encode } from 'cbor-x';
import { JadeTransport, IJadeInterface, RPCRequest, RPCResponse } from "../types";

export class JadeInterface implements IJadeInterface {
  constructor(private transport: JadeTransport) {}

  async connect() {
    await this.transport.connect();
  }

  async disconnect() {
    await this.transport.disconnect();
  }

  buildRequest(id: string, method: string, params?: any): RPCRequest {
    return { id, method, params };
  }

  async makeRPCCall(request: RPCRequest, long_timeout: boolean = false): Promise<RPCResponse> {
    if (!request.id || request.id.length > 16) {
      throw new Error('Request id must be non-empty and less than 16 characters');
    }
    if (!request.method || request.method.length > 32) {
      throw new Error('Request method must be non-empty and less than 32 characters');
    }

    // 1) send the CBOR‐encoded request over SerialTransport
    await this.transport.sendMessage(request);

    return new Promise<RPCResponse>((resolve, reject) => {
      const onResponse = (msg: RPCResponse) => {
        if (msg && msg.id === request.id) {
          this.transport.removeListener('message', onResponse);
          if (timeoutId) clearTimeout(timeoutId);
          resolve(msg);
        }
      };

      this.transport.onMessage(onResponse);

      // If not a long timeout, set a 5s timer
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      if (!long_timeout) {
        timeoutId = setTimeout(() => {
          this.transport.removeListener('message', onResponse);
          reject(new Error('RPC call timed out'));
        }, 5000);
      }
    });
  }

  private async _writeRequest(req: any): Promise<void> {
    const cborReq = this._serialiseCborRequest(req);
    console.debug('Jade > send:', req);
    await this.transport.write(cborReq);
  }

    private _serialiseCborRequest(request: any): Buffer {
    // Encode the request object as CBOR
    return encode(request);
  }

	private async _readCborMessage(): Promise<any> {
		const chunks: Uint8Array[] = [];
		while (true) {
			const chunk: Uint8Array = await this.transport.read();
			if (!chunk || chunk.length === 0) {
				throw new Error('Jade: no data received');
			}
			chunks.push(chunk);
			const buf = Buffer.concat(chunks as any);
			try {
				const result = decode(buf);
				return result;
			} catch (err) {
				continue;
			}
		}
	}


	private _validateReply(reply: any, expectedId: string): void {
		if (!reply || reply.id !== expectedId) {
			throw new Error(`Jade: unexpected reply ID (got ${reply?.id}, expected ${expectedId})`);
		}
		if ('error' in reply) {
			const e = reply.error;
			throw new Error(`Jade RPC error ${e.code}: ${e.message}`);
		}
	}

	private async _readResponse(expectedId: string): Promise<any> {
		const reply = await this._readCborMessage();
		console.debug('Jade < recv:', reply);
		this._validateReply(reply, expectedId);
		return reply;
	}

	public async _signPSBT(network: string, psbt: Uint8Array): Promise<Uint8Array> {
		const requestId = (Math.floor(Math.random()*1e6)).toString();
		const request = {
			id: requestId,
			method: 'sign_psbt',
			params: { network, psbt }
		};
		await this._writeRequest(request);

		let reply = await this._readResponse(requestId);
		let resultBytes = Buffer.from(reply.result);
		const total = reply.seqlen || 1;
		let seqnum = reply.seqnum || 1;
		while (seqnum < total) {
			seqnum += 1;
			const extId = (Math.floor(Math.random()*1e6)).toString();
			const extRequest = {
				id: extId,
				method: 'get_extended_data',
				params: {
					origid: requestId,
					orig: 'sign_psbt',
					seqnum: seqnum,
					seqlen: total
				}
			};
			await this._writeRequest(extRequest);
			const extReply = await this._readResponse(extId);
			resultBytes = Buffer.concat([resultBytes, Buffer.from(extReply.result)]);
		}
		return resultBytes;
	}

}

