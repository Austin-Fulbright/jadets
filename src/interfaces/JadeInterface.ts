//interface/JadeInterface.ts
import cbor from "cbor2";
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
			throw new Error('Request id must be non-empty and less than 16 characters')
		}
		if (!request.method || request.method.length > 32) {
			throw new Error('Request method must be non-empty and less than 32 characters')
		}

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

			// If not a long timeout, set a timeout to reject the promise
			let timeoutId: ReturnType<typeof setTimeout> | undefined;
			if (!long_timeout) {
				timeoutId = setTimeout(() => {
					this.transport.removeListener('message', onResponse);
					reject(new Error('RPC call timed out'));
				}, 5000); // 5000 milliseconds timeout
			}
		});

	}

}
