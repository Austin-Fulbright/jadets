//Jade.ts
import { IJadeInterface, IJade, SignerDescriptor, MultisigSummary, RegisteredMultisig, ReceiveOptions, MultisigDescriptor, RegisterMultisigParams } from './types';
import { getFingerprintFromXpub } from './utils' 

export class Jade implements IJade {

	constructor(private iface: IJadeInterface) {}

	async connect() { return this.iface.connect(); }
	async disconnect() { return this.iface.disconnect(); }


	private async _jadeRpc(
		method: string,
		params?: any,
		id?: string,
		long_timeout: boolean = false,
			http_request_fn?: (params: any) => Promise<{ body: any }>
	): Promise<any> {
		const requestId = id || Math.floor(Math.random() * 1000000).toString();
		const request = this.iface.buildRequest(requestId, method, params);
		const reply = await this.iface.makeRPCCall(request, long_timeout);

		if (reply.error) {
			throw new Error(`RPC Error ${reply.error.code}: ${reply.error.message}`);
		}
		if (reply.result &&
			typeof reply.result === 'object' &&
				'http_request' in reply.result) {

			if (!http_request_fn) {
				throw new Error('HTTP request function not provided');
			}

			const httpRequest = reply.result['http_request'];
			const httpResponse = await http_request_fn(httpRequest['params']);
			return this._jadeRpc(
				httpRequest['on-reply'],
				httpResponse['body'],
				undefined,
				long_timeout,
				http_request_fn
			);
		}

		return reply.result;
	}

	async cleanReset(): Promise<boolean> {
		return this._jadeRpc('debug_clean_reset');
	}

	async ping(): Promise<0|1|2> {
		return this._jadeRpc("ping"); 
	}

	async getVersionInfo(nonblocking: boolean = false): Promise<any> {
		const params = nonblocking ? { nonblocking: true } : undefined;
		return this._jadeRpc('get_version_info', params);
	}
	async setMnemonic(
		mnemonic: string,
		passphrase?: string,
		temporaryWallet = false
	): Promise<boolean> {
		const params: Record<string, any> = { mnemonic, temporary_wallet: temporaryWallet };
		if (passphrase !== undefined) {
			params.passphrase = passphrase;
		}
		return this._jadeRpc('debug_set_mnemonic', params);
	}

	async addEntropy(entropy: Uint8Array): Promise<boolean> {
		const params = {entropy}
		return this._jadeRpc('add_entropy', params);
	}

	async logout(): Promise<boolean> {
		return this._jadeRpc('logout');
	}

	async getXpub(network: string, path: number[]): Promise<string> {
		const params = { network, path };
		return this._jadeRpc('get_xpub', params);
	}

	async setEpoch(epoch?: number): Promise<boolean> {
		const now = Math.floor(Date.now() / 1000);
		const params = { epoch: epoch !== undefined ? epoch : now };
		return this._jadeRpc('set_epoch', params);
	}

	async registerMultisig(
		network: string,
		multisigName: string,
		descriptor: MultisigDescriptor
	): Promise<boolean> {
		const params: RegisterMultisigParams = {
			network,
			multisig_name: multisigName,
			descriptor,
		};
		return this._jadeRpc('register_multisig', params);
	}

	async getRegisteredMultisigs(): Promise<Record<string, MultisigSummary>> {
		throw new Error('Method not implemented: getRegisteredMultisigs');
	}

	async getRegisteredMultisig(name: string, asFile: boolean = false): Promise<RegisteredMultisig> {
		const params = {'multisig_name': name,
						'as_file': asFile};
		return this._jadeRpc('get_registered_multisig', params);
	}

	async getReceiveAddress(
		network: string,
		path: number[],
		options?: ReceiveOptions
	): Promise<string> {
		throw new Error('Method not implemented: getReceiveAddress');
	}

	async signMessage(
		path: number[],
		message: string,
		useAeSignatures?: boolean,
		aeHostCommitment?: Uint8Array,
		aeHostEntropy?: Uint8Array
	): Promise<Uint8Array | [Uint8Array, Uint8Array]> {
		if (useAeSignatures) {
				throw new Error('ae sig not implemented');
		} else {
			const params = {'path': path, 'message': message }
			return this._jadeRpc('sign_message', params);
		}

	}

	async signPSBT(network: string, psbt: Uint8Array): Promise<Uint8Array> {
		const params = {'network': network, 'psbt': psbt}
		return this._jadeRpc('sign_psbt', params)
	}

	async getMasterFingerPrint(network: string): Promise<null | string>{
		const xpub = await this.getXpub(network, [])
		return getFingerprintFromXpub(xpub, network)

	}

}


