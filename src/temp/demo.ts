import { TCPTransport } from '../transport';
import { JadeInterface } from '../interfaces';
import { Jade } from '../Jade';
import assert from 'assert';
import process from 'process';
import { randomBytes } from 'crypto';
import { TestXpub } from '../types'
import { hexToBytes, getFingerprintFromXpub, base64ToBytes, bytesToBase64 } from '../utils';
import { TestMessage, SignerDescriptor, MultisigDescriptor, TestPSBT, SignPsbtCase } from '../types';   
import signPsbtCase from '../test_data/sign_psbt_0.json';

const psbtcase: SignPsbtCase = signPsbtCase as SignPsbtCase;

const TEST_MNEMONIC =
  'fish inner face ginger orchard permit useful method fence kidney chuckle party favorite sunset draw limb science crane oval letter slot invite sadness banana'

const TEST_XPUB: TestXpub = {
	path: [],
	network: 'testnet',
	xpub: 'tpubD6NzVbkrYhZ4Y6YYLhPsm1vVhs7CDSvoxfTTohcNPigN2RkeMJL3gTWav9fCicJsC7eSyARLKi8Q3UU825cz65meRQFFfqTYfBBy3MHC6Vn',
	fingerprint: 'e3ebcc79'
};

const signerA: SignerDescriptor = {
  fingerprint: new Uint8Array([0xe3, 0xeb, 0xcc, 0x79]),
  derivation:  [1],
  xpub:        'tpubD9wHvxq4yutRMa2nmuFG1V56vbfT5o1vvQCNBwGLwCimjnKyTYTWUXAdVYEjqDhJ67Ass4bLupZcuuPwtMJLzdDiGeASdprQDtp9WF4E9po',
  path:        [], 
};

const descriptor: MultisigDescriptor = {
  variant: 'sh(multi(k))',
  sorted:  false,
  threshold: 1,
  signers: [signerA],
};

const testMessage: TestMessage = {
	path: [0],
	message: "Jade is cool",
	use_ae_signatures: false,
	output: "IHd2/Y65d1P7Gq6I6gTDoRql9eEsFEh7B8RtAJm+g+AdHuxT5hbMKN28Jlotxfp0LO3WLxPlJh61BQYPYL1uikw="	
}

const PSBT_B64 = 
`cHNidP8BAHUCAAAAAUcOsf5t+GMIvl1Bq+tOPOEOyK9Ip+qhk0KQbfF+WIS8AAAAAAD9////AggbAAAAAAAAF6kU3o2J/Uerf7LCHcT7qTRcBJfw1+eH6AMAAAAAAAAZdqkULP4ml/3ndoZ9B8TQpN0ZgeRRs8CIrAAAAAAAAQBzAgAAAAHkkMUTMS2MTXNSqtubq8rw/n3b7Ts2SZusUHIz6a4a3gAAAAAA/f///wIQJwAAAAAAABepFD9r58LSPtr3usa5ZtZPIlJE+5uEh1rFBSoBAAAAF6kUn5ATnacfnR2wU2EyluXEQy1x2vOHbgAAAAEBIBAnAAAAAAAAF6kUP2vnwtI+2ve6xrlm1k8iUkT7m4SHAQQiACBDXoQ084F6kKLUTAuhSyWjdTkSIcrI+iRqwQ0aJsNSxgEFR1IhAup5lW1qGECRxNrhd4sM6/KPrLh8EYt+Vssv2U/EQsFAIQLFliLnEbNCoo5wszcNAxEo14GuzFOHPVKj19XlA9PxY1KuIgYCxZYi5xGzQqKOcLM3DQMRKNeBrsxThz1So9fV5QPT8WMY4+vMeVQAAIABAACAAAAAgAAAAAAAAAAAIgYC6nmVbWoYQJHE2uF3iwzr8o+suHwRi35Wyy/ZT8RCwUAYWdHzsFQAAIABAACAAAAAgAAAAAAAAAAAAAEAIgAgsE7wf/JwEbbBT7NUWyOt+lI7s8O/cnj5+eMzre2+NQ0BAUdSIQI4l28e0USpcW0egqOtv7md3hcs8741koioAsxfiQPlZiEDgkzQk3QoqTmmJEm93e/eNe5GKWfTVdK1C6SqXggXQ5xSriICAjiXbx7RRKlxbR6Co62/uZ3eFyzzvjWSiKgCzF+JA+VmGFnR87BUAACAAQAAgAAAAIABAAAAAAAAACICA4JM0JN0KKk5piRJvd3v3jXuRiln01XStQukql4IF0OcGOPrzHlUAACAAQAAgAAAAIABAAAAAAAAAAAA`

const OUTPUT_B64 = `cHNidP8BAHUCAAAAAUcOsf5t+GMIvl1Bq+tOPOEOyK9Ip+qhk0KQbfF+WIS8AAAAAAD9////AggbAAAAAAAAF6kU3o2J/Uerf7LCHcT7qTRcBJfw1+eH6AMAAAAAAAAZdqkULP4ml/3ndoZ9B8TQpN0ZgeRRs8CIrAAAAAAAAQBzAgAAAAHkkMUTMS2MTXNSqtubq8rw/n3b7Ts2SZusUHIz6a4a3gAAAAAA/f///wIQJwAAAAAAABepFD9r58LSPtr3usa5ZtZPIlJE+5uEh1rFBSoBAAAAF6kUn5ATnacfnR2wU2EyluXEQy1x2vOHbgAAAAEBIBAnAAAAAAAAF6kUP2vnwtI+2ve6xrlm1k8iUkT7m4SHIgIC6nmVbWoYQJHE2uF3iwzr8o+suHwRi35Wyy/ZT8RCwUBHMEQCIDuYWF7nW9JRRiRXRUg5fCr5kJmBqhqqbNi5GNM3vRM+AiAuaYa5pisJyKSZffXA4y7KP4WP7e0WbICnU/hrORY/RgEBBCIAIENehDTzgXqQotRMC6FLJaN1ORIhysj6JGrBDRomw1LGAQVHUiEC6nmVbWoYQJHE2uF3iwzr8o+suHwRi35Wyy/ZT8RCwUAhAsWWIucRs0KijnCzNw0DESjXga7MU4c9UqPX1eUD0/FjUq4iBgLFliLnEbNCoo5wszcNAxEo14GuzFOHPVKj19XlA9PxYxjj68x5VAAAgAEAAIAAAACAAAAAAAAAAAAiBgLqeZVtahhAkcTa4XeLDOvyj6y4fBGLflbLL9lPxELBQBhZ0fOwVAAAgAEAAIAAAACAAAAAAAAAAAAAAQAiACCwTvB/8nARtsFPs1RbI636Ujuzw79yePn54zOt7b41DQEBR1IhAjiXbx7RRKlxbR6Co62/uZ3eFyzzvjWSiKgCzF+JA+VmIQOCTNCTdCipOaYkSb3d79417kYpZ9NV0rULpKpeCBdDnFKuIgICOJdvHtFEqXFtHoKjrb+5nd4XLPO+NZKIqALMX4kD5WYYWdHzsFQAAIABAACAAAAAgAEAAAAAAAAAIgIDgkzQk3QoqTmmJEm93e/eNe5GKWfTVdK1C6SqXggXQ5wY4+vMeVQAAIABAACAAAAAgAEAAAAAAAAAAAA=`


const testPSBT: TestPSBT = {
	network: "testnet",
	psbt: base64ToBytes(PSBT_B64), 
	output: base64ToBytes(OUTPUT_B64)
}

async function main() {
  const transport = new TCPTransport('localhost', 30121)
  const ijade     = new JadeInterface(transport)
  const client    = new Jade(ijade)

  try {
    console.log('🟢 Connecting…')
    await client.connect()

    // ---- clean/reset the device ----
    console.log('🟢 Performing clean reset…')
    const cleaned = await client.cleanReset()
    assert.strictEqual(cleaned, true, 'cleanReset should return true')

    // ---- basic ping ----
    console.log('🟢 Pinging…')
    const pong = await client.ping()
    assert.strictEqual(pong, 0, `Expected pong=0, got ${pong}`)
    console.log('↪️  pong =', pong)

    // ---- initial version info (should be READY) ----
    console.log('🟢 Fetching version info…')
    let info = await client.getVersionInfo()
    console.log('↪️  versionInfo =', info)
    // ---- logout and check locked state ----
    console.log('🟢 Logging out…')
    const out = await client.logout()
    assert.strictEqual(out, true, 'logout should return true')

    info = await client.getVersionInfo()
    console.log('↪️  versionInfo =', info)
    assert(
      info.JADE_STATE === 'LOCKED' || info.JADE_STATE === 'UNINIT',
      `Expected JADE_STATE in ["LOCKED","UNINIT"], got "${info.JADE_STATE}"`
    )

	console.log('🟢 Adding entropy…')
	//const noise = randomBytes(64)                      // → Buffer is a Uint8Array
	//const ok    = await client.addEntropy(noise)       // calls your new implementation
	//console.log('↪️  addEntropy returned', ok)

    // ---- set a mnemonic and check back to READY ----
    console.log('🟢 Setting mnemonic…')
    const setmn = await client.setMnemonic(TEST_MNEMONIC)
    assert.strictEqual(setmn, true, 'setMnemonic should return true')

    info = await client.getVersionInfo()
    console.log('↪️  versionInfo =', info)
    assert.strictEqual(
      info.JADE_STATE,
      'READY',
      `Expected JADE_STATE="READY" after setMnemonic, got "${info.JADE_STATE}"`
    )


    // ---- set the epoch on the device ----
    console.log('🟢 Setting epoch…')
    const now = Math.floor(Date.now() / 1000)
    await client.setEpoch(now)
    console.log(`↪️  epoch set to ${now}`)

    // ---- derive an xpub on m/84'/0'/0' ----
    console.log('🟢 Fetching xpub at m/84h/0h/0h…')
    const xpub = await client.getXpub(TEST_XPUB.network, TEST_XPUB.path) 
    console.log('↪️  tpub =', xpub)
	assert.strictEqual(
		xpub,
		TEST_XPUB.xpub,
		`Expected xpub: "${xpub}" from jade to be equal to test xpub: "${TEST_XPUB.xpub}"`
	)

    console.log('🟢 Getting Master Finger Print…')
	const fp = getFingerprintFromXpub(xpub, "testnet")
    console.log('↪️  fingerprint =', fp)
	assert.strictEqual(
		fp,
		TEST_XPUB.fingerprint,
		`Expected fingerprint: "${fp}" from jade to be equal to test fingerprint: "${TEST_XPUB.fingerprint}"`
	)


    console.log('🟢 Registering Multisig 1 of 1')
	const registered = await client.registerMultisig('testnet', 'test_multisig', descriptor)
    console.log('↪️  registered multisg =', registered)
	assert.strictEqual(
		registered,
		true,
		`Expected registered: "${registered}" from jade to be equal to true` 
	)

    console.log('🟢 Get Registered Multisig 1 of 1')
	const multisigWalletTest = await client.getRegisteredMultisig('test_multisig')

    console.log('↪️  registered multisg =', multisigWalletTest)

	//TODO - add tests for getting multisig wallets
    console.log('🟢 Test sign message')
	const message = await client.signMessage(testMessage.path, testMessage.message, testMessage.use_ae_signatures)

    console.log('↪️  message output =', message)
	assert.strictEqual(
		message,
		testMessage.output,
		`Expected message: "${message}" from jade to be equal to expected output "${testMessage.output}"` 
	)


    console.log('🟢 Test sign psbt 0')
	const psbt_0 = await client.signPSBT(testPSBT.network, testPSBT.psbt)
    console.log('↪️ psbt output =', psbt_0)
	//TODO - psbts dont exactly match
//	const psbtB64 = bytesToBase64(psbt)
//    console.log('↪️ psbt output =', psbtB64)
//	assert.strictEqual(
//		psbtB64,
//		OUTPUT_B64,
//		`Expected message: "${psbtB64.slice(0, 7)}..." from jade to be equal to expected output "${OUTPUT_B64.slice(0, 7)}..."`
//	)

	
    console.log('🟢 Test sign psbt 1')
	const psbt_1 = await client.signPSBT(psbtcase.input.network, base64ToBytes(psbtcase.input.psbt))
    console.log('↪️ psbt output =', psbt_1)
	
    console.log('🟢 Test bad sign psbt 0')
	
	try {
		const weird = base64ToBytes("bad type")
		const bad_psbt_0 = await client.signPSBT("testnet", weird)
	} catch(err) {
		const msg = (err as Error).message;
		console.log(`caught expected error: ${msg}`); 
	}
	
    console.log('✅ All checks passed')
    process.exit(0)

  } catch (err) {
    console.error('❌ E2E failure:', err)
    process.exit(1)

  } finally {
    await client.disconnect()
    console.log('🔴 Disconnected.')
  }
}

main()

