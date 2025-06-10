//types.ts

import EventEmitter from "events";

export interface RPCRequest {
	id: string;
	method: string;
	params?: any;
};

export interface ExtendedDataResponse {
	seqnum: number;
	seqlen: number;
	data?: any;
}

export interface RPCResponse {
	id: string;
	result?: any;
	error?: {
		code: number,
		message: string;
		data?: any;
	};

	seqnum?: number;
	seqlen?: number;
};

export interface SerialPortOptions {
    device?: string;
    baudRate?: number;
    timeout?: number;
	bufferSize?: number;
};

export interface JadeTransport extends EventEmitter {
	connect(): Promise<void>;
	disconnect(): Promise<void>;
	sendMessage(msg: any): Promise<void>;
	onMessage(callback: (msg: any) => void): void;
}
export interface IJadeInterface {
	connect(): Promise<void>;
	disconnect(): Promise<void>;
	buildRequest(id: string, method: string, params?: any): RPCRequest;
	makeRPCCall(request: RPCRequest, long_timeout: boolean): Promise<RPCResponse>;
};

export interface IJade {
	connect(): Promise<void>;
	disconnect(): Promise<void>;
	cleanReset(): Promise<boolean>;
	ping(): Promise<0|1|2>;
	getVersionInfo(nonblocking?: boolean): Promise<any>;
	setMnemonic(mnemonic: string, passphrase?: string, temporaryWallet?: boolean): Promise<boolean>; 
	authUser(
		network: string,
		http_request_fn?: (params: any) => Promise<{ body: any }>,
		epoch?: number
	): Promise<boolean>; 
	addEntropy(entropy: Uint8Array): Promise<boolean>;
	setEpoch(epoch?: number): Promise<boolean>;
	logout(): Promise<boolean>;
	getXpub(network: string, path: number[]): Promise<string>;
	registerMultisig(
		network: string,
		multisigName: string | undefined,
		descriptor: MultisigDescriptor
	): Promise<boolean>;
	getMultiSigName(
		network: string,
		target: MultisigDescriptor
	): Promise<string | undefined>
	getRegisteredMultisigs(): Promise<Record<string, MultisigSummary>>;
	getRegisteredMultisig(name: string, asFile?: boolean): Promise<RegisteredMultisig>;
	getReceiveAddress(
		network: string,
		options?: ReceiveOptions
	): Promise<string>;
	signMessage(
		path: number[],
		message: string,
		useAeSignatures?: boolean,
		aeHostCommitment?: Uint8Array,
		aeHostEntropy?: Uint8Array
	): Promise<Uint8Array | [Uint8Array, Uint8Array]>;
	signPSBT(network: string, psbt: Uint8Array): Promise<Uint8Array>;
	getMasterFingerPrint(network: string): Promise<null | string>;
}

export type MultisigVariant =
  | "sh(multi(k))"
  | "wsh(multi(k))"
  | "sh(wsh(multi(k)))"
  | string;

export interface MultisigDescriptor {
  variant: MultisigVariant;
  sorted: boolean;
  threshold: number;
  signers: SignerDescriptor[];
  master_blinding_key?: Uint8Array;
}

export interface RegisterMultisigParams {
  network: string;            
  multisig_name: string;     
  descriptor: MultisigDescriptor;
}

export interface SignerDescriptor {
  fingerprint: Uint8Array;
  derivation: number[];
  xpub: string;
  path?: number[];
}

export interface MultisigSummary {
  variant: string;
  sorted: boolean;
  threshold: number;
  num_signers: number;
  masterBlindingKey: Uint8Array;
}

export interface RegisteredMultisig {
  network: string;
  descriptor: {
    variant: string;
    sorted: boolean;
    threshold: number;
    signers: SignerDescriptor[];
    masterBlindingKey?: Uint8Array;
  };
}

export interface ReceiveOptions {

  path?: number[]  

  paths?: number[][]

  multisigName?: string  

  descriptorName?: string  

  variant?: string  

  recoveryXpub?: Uint8Array  
  csvBlocks?: number  
  confidential?: boolean  

}

export interface TestXpub {
  path: number[];
  network: 'mainnet' | 'testnet' | string;
  xpub: string;
  fingerprint: string;
}

export interface TestMessage {
	path: number[];
	message: string;
	use_ae_signatures: boolean;
	output: string;
}

export interface TestPSBT {
	network: string;
	psbt: Uint8Array; 
	output: Uint8Array;
}

export interface SignPsbtCase {
	description: string;
	input: {
		network: string;
		psbt: string;
	};
	expected_output: {
		psbt: string;
	};
}
