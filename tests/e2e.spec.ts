//e2e.spec.ts
import { strict as assert } from 'assert'
import { TCPTransport } from '../src/transport'
import { JadeInterface } from '../src/interfaces'
import { Jade } from '../src/Jade'

describe('Jade E2E smoke', () => {
  let client: Jade

  before(async () => {
    const transport = new TCPTransport('127.0.0.1', 30121)
    client        = new Jade(new JadeInterface(transport))
    await client.connect()
  })

  after(async () => {
    await client.disconnect()
  })

  it('pings and fetches version', async () => {
    const v = await client.ping()
    assert.ok([0,1,2].includes(v))
    const info = await client.getVersionInfo()
    assert.ok(Array.isArray(info))
  })

  it('accepts a mnemonic', async () => {
    await client.setMnemonic(
      'retire verb human ecology best member fiction measure demand stereo wedding olive'
    )
  })
})

