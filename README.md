# jadets

A TypeScript client for the Blockstream Jade hardware wallet, modeled on [jadepy](https://github.com/Blockstream/Jade/blob/master/jadepy/jade.py).

## Install

```bash
npm install jadets
# or
yarn add jadets
his is an npm package written using typescript to talk to the jade hardware device
```

## Quickstart

```
import { TCPTransport } from 'jadets/transport'
import { JadeInterface } from 'jadets/interfaces'
import { Jade } from 'jadets'
import { randomBytes } from 'crypto'
import { SignerDescriptor, MultisigDescriptor } from 'jadets/types'

const transport = new TCPTransport('localhost', 30121)
const client    = new Jade(new JadeInterface(transport))

await client.connect()
await client.cleanReset()
await client.ping()

// set up wallet
await client.setMnemonic(MNEMONIC)
await client.setEpoch(Math.floor(Date.now()/1000))

// derive an xpub and fingerprint
const xpub = await client.getXpub('testnet', [84+0x80000000,0+0x80000000,0+0x80000000])
const fp   = getFingerprintFromXpub(xpub,'testnet')

// register a simple 1-of-1 multisig
const signer: SignerDescriptor = { fingerprint: fp, derivation: [1], xpub, path: [] }
const desc: MultisigDescriptor = {
  variant:   'sh(multi(k))',
  sorted:    false,
  threshold: 1,
  signers:   [signer],
}
await client.registerMultisig('testnet','demo-wallet',desc)

// sign a message
const sig = await client.signMessage([0],'hello jade')
console.log(sig)

// sign a PSBT
const result = await client.signPSBT('testnet', rawPsbtBytes)
console.log(Buffer.from(result).toString('base64'))

await client.disconnect()
```

## API Highlights

- **connect()** → `Promise<void>`  
- **disconnect()** → `Promise<void>`  
- **cleanReset()** → `Promise<boolean>`  
- **ping()** → `Promise<number>`  
- **setMnemonic(mnemonic: string)** → `Promise<boolean>`  
- **getXpub(network: string, path: number[])** → `Promise<string>`  
- **registerMultisig(network: string, name: string, desc: MultisigDescriptor)** → `Promise<boolean>`  
- **getRegisteredMultisigs()** → `Promise<Record<string, MultisigSummary>>`  
- **getRegisteredMultisig(name: string)** → `Promise<RegisteredMultisig>`  
- **signMessage(path: number[], msg: string)** → `Promise<Uint8Array>`  
- **signPSBT(network: string, psbt: Uint8Array)** → `Promise<Uint8Array>`  

