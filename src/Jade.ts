//Jade.ts
import { IJadeInterface, IJade, SignerDescriptor, MultisigSummary, RegisteredMultisig, ReceiveOptions, MultisigDescriptor, RegisterMultisigParams } from './types';

import { getFingerprintFromXpub } from './utils' 

import { randomBytes } from 'crypto';

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

	async authUser(
		network: string,
		http_request_fn?: (params: any) => Promise<{ body: any }>,
			epoch?: number
	): Promise<boolean> {
		if (typeof network !== 'string' || network.length === 0) {
			throw new Error('authUser: "network" must be a non-empty string');
		}
		const computedEpoch = epoch !== undefined ? epoch : Math.floor(Date.now() / 1000);
		const params = {
			network,
			epoch: computedEpoch
		};
		return this._jadeRpc('auth_user', params, undefined, true, http_request_fn);
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
		multisigName: string | undefined,
		descriptor: MultisigDescriptor
	): Promise<boolean> {
		let mname = multisigName;

		if (mname === undefined) {
			mname = "jade" + randomBytes(4).toString("hex");
		}

		const params: RegisterMultisigParams = {
			network,
			multisig_name: mname,
			descriptor,
		};
		return this._jadeRpc('register_multisig', params, undefined, true);
	}

	async getRegisteredMultisigs(): Promise<Record<string, MultisigSummary>> {
		return this._jadeRpc("get_registered_multisigs");
	}

	async getMultiSigName(
		network: string,
		target: MultisigDescriptor
	): Promise<string|undefined> {
		const summaries = await this.getRegisteredMultisigs();

		for (const [name, sum] of Object.entries(summaries)) {
			if (
				sum.variant !== target.variant ||
				sum.sorted  !== target.sorted  ||
			sum.threshold !== target.threshold ||
		sum.num_signers !== target.signers.length
			) {
				continue;
			}

			const full = await this.getRegisteredMultisig(name, false);
			const desc = full.descriptor;

			const normalize = (o: any) =>
			new Uint8Array(Object.values(o.fingerprint as Record<string, number>));

			const match = desc.signers.length === target.signers.length
			&& desc.signers.every((s, i) => {
				const t = target.signers[i];
				const sf = normalize(s);
				const tf = t.fingerprint;

				if (sf.length !== tf.length
					|| sf.some((b, idx) => b !== tf[idx])
				   ) return false;

				   if (s.xpub !== t.xpub) return false;

				   if (s.derivation.length !== t.derivation.length
					   || s.derivation.some((v, idx) => v !== t.derivation[idx])
					  ) return false;

					  return true;
			});

			if (match) {
				return name;
			}
		}

		return undefined;
	}


	async getRegisteredMultisig(name: string, asFile: boolean = false): Promise<RegisteredMultisig> {
		const params = {'multisig_name': name,
						'as_file': asFile};
		return this._jadeRpc('get_registered_multisig', params);
	}


	async getReceiveAddress(
		network: string,
		opts: ReceiveOptions
	): Promise<string> {
		const params: any = { network };

		if (opts.path)           params.path = opts.path;
		if (opts.paths)          params.paths = opts.paths;
		if (opts.multisigName)   params.multisig_name = opts.multisigName;
		if (opts.descriptorName) params.descriptor_name = opts.descriptorName;
		if (opts.variant)        params.variant = opts.variant;
		if (opts.recoveryXpub)   params.recovery_xpub = opts.recoveryXpub;
		if (opts.csvBlocks)      params.csv_blocks = opts.csvBlocks;
		if (opts.confidential)   params.confidential = opts.confidential;

		return this._jadeRpc("get_receive_address", params);
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
			return this._jadeRpc('sign_message', params, undefined, true);
		}

	}

	async signPSBT(network: string, psbt: Uint8Array): Promise<Uint8Array> {
		const params = {'network': network, 'psbt': psbt};
		return this._jadeRpc('sign_psbt', params, undefined, true);
	}

	async getMasterFingerPrint(network: string): Promise<null | string>{
		const xpub = await this.getXpub(network, [])
		return getFingerprintFromXpub(xpub, network)

	}

}


