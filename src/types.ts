//types.ts

import EventEmitter from "events";

export interface RPCRequest<TParams = unknown> {
	id: string;
	method: string;
	params?: TParams;
};

export interface RPCResponse<TResult = unknown> {
	id: string;
	result?: TResult;
	error?: {
		code: number,
		message: string;
		data?: unknown;
	};

	seqnum?: number;
	seqlen?: number;
};

export interface ExtendedDataResponse<TData = unknown>{ 
	seqnum: number;
	seqlen: number;
	data?: TData;
}


export interface JadeHttpRequestParams {
  urls: Array<{
    url?: string;
    onion?: string;
  }> | string[];
  method: 'POST' | 'GET';
  accept: 'json';
  data: {
    data: string;
  };
}

export interface JadeHttpContinue {
	http_request: {
		params: JadeHttpRequestParams;
		'on-reply': string;
	};
}

export interface JadeHttpResponse {
  body: {
    data?: string;
    [key: string]: unknown; // Allow additional fields from pinserver
  };
}

export type JadeHttpRequestFunction = (params: JadeHttpRequestParams) => Promise<JadeHttpResponse>;


/* Result types from function calls */

export interface JadeVersionInfo {
  JADE_VERSION: string;
  JADE_OTA_MAX_CHUNK: number;
  JADE_CONFIG: string;
  BOARD_TYPE: string;
  JADE_FEATURES: string;
  IDF_VERSION: string;
  CHIP_FEATURES: string;
  EFUSEMAC: string;
  BATTERY_STATUS: number;
  JADE_STATE: string;
  JADE_NETWORKS: string;
  JADE_HAS_PIN: boolean;
}


/* Param types from functions */

export interface SetMnemonicParams {
  mnemonic: string;
  temporary_wallet: boolean;
  passphrase?: string;
}

export interface ReceiveAddressParams {
  network: string;

  path?: number[];
  paths?: number[][];

  multisig_name?: string;
  descriptor_name?: string;
  variant?: string;

  recovery_xpub?: Uint8Array;
  csv_blocks?: number;
  confidential?: boolean;
}

export interface SerialPortOptions {
    device?: string;
    baudRate?: number;
    timeout?: number;
	bufferSize?: number;
};

export interface JadeTransport extends EventEmitter {
	connect(): Promise<void>;
	disconnect(): Promise<void>;
	sendMessage(msg: RPCRequest<unknown>): Promise<void>;
	onMessage(callback: (msg: RPCResponse<unknown>) => void): void;
}

export interface IJadeInterface {
	connect(): Promise<void>;
	disconnect(): Promise<void>;
	buildRequest<TParams = unknown>(id: string, method: string, params?: TParams): RPCRequest<TParams>;
	makeRPCCall<TResult = unknown, TParams = unknown>(request: RPCRequest<TParams>, long_timeout: boolean): Promise<RPCResponse<TResult>>;
};

export interface IJade {
	connect(): Promise<void>;
	disconnect(): Promise<void>;
	cleanReset(): Promise<boolean>;
	ping(): Promise<0|1|2>;
	getVersionInfo(nonblocking?: boolean): Promise<JadeVersionInfo>;
	setMnemonic(mnemonic: string, passphrase?: string, temporaryWallet?: boolean): Promise<boolean>; 
	authUser(
		network: string,
		http_request_fn?: JadeHttpRequestFunction, 
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

export type RegisteredFingerprint = Uint8Array | Record<string, number>;

export interface RegisteredMultisigSigner {
	fingerprint: RegisteredFingerprint;
	derivation: number[];
	xpub: string;
	path?: number;
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
    signers: RegisteredMultisigSigner[];
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
