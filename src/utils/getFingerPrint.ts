// src/utils/getFingerprint.ts
import * as ecc from 'tiny-secp256k1'
import BIP32Factory, { BIP32Interface } from 'bip32'
import { Buffer } from 'buffer';

const bip32 = BIP32Factory(ecc)

type NetworkType = BIP32Interface['network']

const MAINNET_BIP32: NetworkType = {
  wif:        0x80,
  bip32: {
    public:  0x0488b21e, // “xpub”
    private: 0x0488ade4, // “xprv”
  },
  messagePrefix: '\x18Bitcoin Signed Message:\n',
  bech32:     'bc',
  pubKeyHash: 0x00,
  scriptHash: 0x05,
}

// Testnet parameters (tpub / tprv = 0x043587cf / 0x04358394)
const TESTNET_BIP32: NetworkType = {
  wif:        0xef,
  bip32: {
    public:  0x043587cf, // “tpub”
    private: 0x04358394, // “tprv”
  },
  messagePrefix: '\x18Bitcoin Signed Message:\n',
  bech32:     'tb',
  pubKeyHash: 0x6f,
  scriptHash: 0xc4,
}

export function getFingerprintFromXpub(xpub: string, networkType: string): string | null {
	try {

		const network: NetworkType = networkType === 'testnet' ? TESTNET_BIP32 : MAINNET_BIP32
		const node: BIP32Interface = bip32.fromBase58(xpub, network)
		return Buffer.from(node.fingerprint).toString('hex')
	} catch (err) {
		console.error('Error getting fingerprint:', err)
		return null
	}
}

