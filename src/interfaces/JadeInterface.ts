// interface/JadeInterface.ts
import { JadeTransport, IJadeInterface, RPCRequest, RPCResponse } from "../types";

export class JadeInterface implements IJadeInterface {
  constructor(private transport: JadeTransport) {}

  async connect(): Promise<void> {
    await this.transport.connect();
  }

  async disconnect(): Promise<void>{
    await this.transport.disconnect();
  }

  buildRequest<TParams = unknown>(id: string, method: string, params?: TParams): RPCRequest<TParams> {
    return { id, method, params };
  }

  /**
   * Makes an RPC call and handles extended data responses automatically
   */
  async makeRPCCall<TResult = unknown, TParams = unknown>(request: RPCRequest<TParams>, long_timeout: boolean = false): Promise<RPCResponse<TResult>> {
    if (!request.id || request.id.length > 16) {
      throw new Error('Request id must be non-empty and less than 16 characters');
    }
    if (!request.method || request.method.length > 32) {
      throw new Error('Request method must be non-empty and less than 32 characters');
    }

    await this.transport.sendMessage<TParams>(request);
    
    const initialResponse = await this.waitForResponse<TResult>(request.id, long_timeout);
    
	let finalResponse: RPCResponse<unknown>;
    if (this.isExtendedDataResponse(initialResponse)) {
      finalResponse = await this.handleExtendedDataResponse(initialResponse, request.id, long_timeout);
    } else {
		finalResponse = initialResponse;
	}

	return finalResponse as RPCResponse<TResult>;
  }

  /**
   * Waits for a single response message
   */
  private async waitForResponse<TResult = unknown>(requestId: string, long_timeout: boolean): Promise<RPCResponse<TResult>> {
    return new Promise<RPCResponse<TResult>>((resolve, reject) => {
      const onResponse = (msg: RPCResponse<unknown>) => {
        if (msg && msg.id === requestId) {
          this.transport.removeListener('message', onResponse);
          if (timeoutId) clearTimeout(timeoutId);
          resolve(msg);
        }
      };

      this.transport.onMessage(onResponse);

      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      if (!long_timeout) {
        timeoutId = setTimeout(() => {
          this.transport.removeListener('message', onResponse);
          reject(new Error('RPC call timed out'));
        }, 5000);
      }
    });
  }

  /**
   * Checks if a response indicates extended data
   */
  private isExtendedDataResponse(response: RPCResponse<unknown>): boolean {
    return response.seqnum !== undefined && 
           response.seqlen !== undefined && 
           response.seqnum < response.seqlen;
  }

  /**
   * Handles extended data responses by collecting all chunks
   */
  private async handleExtendedDataResponse(
    initialResponse: RPCResponse, 
    requestId: string, 
    long_timeout: boolean
  ): Promise<RPCResponse<unknown>> {
    const chunks: RPCResponse<unknown>[] = [initialResponse];
    const totalChunks = initialResponse.seqlen!;
    
    console.log(`Receiving extended data: chunk ${initialResponse.seqnum! + 1}/${totalChunks}`);

    for (let expectedSeqnum = initialResponse.seqnum! + 1; expectedSeqnum < totalChunks; expectedSeqnum++) {
      const extendedRequest: RPCRequest<{ seqnum: number }> = {
        id: requestId,
        method: 'get_extended_data',
        params: { seqnum: expectedSeqnum }
      };

      await this.transport.sendMessage(extendedRequest);
      const chunkResponse = await this.waitForResponse(requestId, long_timeout);

      if (chunkResponse.seqnum !== expectedSeqnum) {
        throw new Error(`Expected chunk ${expectedSeqnum}, got ${chunkResponse.seqnum}`);
      }
      if (chunkResponse.seqlen !== totalChunks) {
        throw new Error(`Inconsistent seqlen: expected ${totalChunks}, got ${chunkResponse.seqlen}`);
      }

      chunks.push(chunkResponse);
      console.log(`Received extended data chunk: ${expectedSeqnum + 1}/${totalChunks}`);
    }

    return this.reassembleExtendedData(chunks);
  }

  /**
   * Reassembles chunks into a complete response
   */
  private reassembleExtendedData(chunks: RPCResponse<unknown>[]): RPCResponse {
    chunks.sort((a, b) => (a.seqnum || 0) - (b.seqnum || 0));

    const completeResponse: RPCResponse<unknown> = {
      id: chunks[0].id,
      error: chunks[0].error
    };

    if (completeResponse.error) {
      return completeResponse;
    }

    completeResponse.result = this.mergeChunkData(chunks);

    console.log(`Extended data reassembly complete: ${chunks.length} chunks processed`);
    return completeResponse;
  }

  private mergeChunkData(chunks: RPCResponse<unknown>[]): unknown {
    const firstResult = chunks[0].result;

    if (firstResult instanceof Uint8Array) {
      const totalLength = chunks.reduce((sum, chunk) => {
        const chunkData = chunk.result as Uint8Array;
        return sum + chunkData.length;
      }, 0);

      const merged = new Uint8Array(totalLength);
      let offset = 0;
      
      for (const chunk of chunks) {
        const chunkData = chunk.result as Uint8Array;
        merged.set(chunkData, offset);
        offset += chunkData.length;
      }
      
      return merged;
    }

    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(firstResult)) {
      return Buffer.concat(chunks.map(chunk => chunk.result as Buffer));
    }

    if (Array.isArray(firstResult)) {
      return chunks.reduce((merged, chunk) => {
        return (merged as unknown[]).concat(chunk.result);
      }, []);
    }

    if (typeof firstResult === 'string') {
      return chunks.map(chunk => chunk.result as string).join('');
    }

    if (typeof firstResult === 'object' && firstResult !== null) {
      return chunks.reduce((merged, chunk) => {
        return { ...(merged as object), ...(chunk.result as object) };
      }, {} as object);
    }

    console.warn('Unknown data type for extended data merge, returning first chunk');
    return firstResult;
  }
}
