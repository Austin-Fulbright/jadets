import { strict as assert } from 'assert'
import { EventEmitter } from 'events'
import { Jade } from '../src/Jade'
import { JadeInterface } from '../src/interfaces'
import { IJadeInterface, JadeTransport, RPCRequest, RPCResponse } from '../src/types'

class MockTransport extends EventEmitter implements JadeTransport {
  sent: RPCRequest[] = []

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}

  async sendMessage(msg: RPCRequest): Promise<void> {
    this.sent.push(msg)
    setImmediate(() => this.replyTo(msg))
  }

  onMessage(callback: (msg: RPCResponse) => void): void {
    this.on('message', callback)
  }

  protected replyTo(_msg: RPCRequest): void {}
}

describe('JadeInterface extended data', () => {
  it('fetches the last 1-based sign_psbt fragment', async () => {
    class TwoChunkTransport extends MockTransport {
      protected replyTo(msg: RPCRequest): void {
        if (msg.method === 'sign_psbt') {
          this.emit('message', {
            id: msg.id,
            seqnum: 1,
            seqlen: 2,
            result: new Uint8Array([1, 2]),
          })
          return
        }
        if (msg.method === 'get_extended_data') {
          this.emit('message', {
            id: msg.id,
            seqnum: msg.params.seqnum,
            seqlen: msg.params.seqlen,
            result: new Uint8Array([3, 4]),
          })
        }
      }
    }

    const transport = new TwoChunkTransport()
    const iface = new JadeInterface(transport)
    const reply = await iface.makeRPCCall(
      { id: 'orig', method: 'sign_psbt', params: { network: 'mainnet', psbt: new Uint8Array() } },
      true
    )

    assert.equal(transport.sent.length, 2)
    const extended = transport.sent[1]
    assert.equal(extended.method, 'get_extended_data')
    assert.notEqual(extended.id, 'orig')
    assert.deepEqual(extended.params, {
      origid: 'orig',
      orig: 'sign_psbt',
      seqnum: 2,
      seqlen: 2,
    })
    assert.deepEqual(Array.from(reply.result), [1, 2, 3, 4])
  })

  it('does not request extra fragments when seqnum equals seqlen', async () => {
    class OneChunkTransport extends MockTransport {
      protected replyTo(msg: RPCRequest): void {
        this.emit('message', {
          id: msg.id,
          seqnum: 1,
          seqlen: 1,
          result: new Uint8Array([9]),
        })
      }
    }

    const transport = new OneChunkTransport()
    const iface = new JadeInterface(transport)
    const reply = await iface.makeRPCCall(
      { id: 'orig', method: 'sign_psbt', params: {} },
      true
    )

    assert.equal(transport.sent.length, 1)
    assert.deepEqual(Array.from(reply.result), [9])
  })
})

describe('Jade.getReceiveAddress', () => {
  it('uses a long timeout so address confirmation can wait on the device', async () => {
    const calls: Array<{ method: string; long_timeout: boolean }> = []
    const iface: IJadeInterface = {
      connect: async () => {},
      disconnect: async () => {},
      buildRequest: (id, method, params) => ({ id, method, params }),
      makeRPCCall: async (request, long_timeout) => {
        calls.push({ method: request.method, long_timeout })
        return { id: request.id, result: 'bc1qtest' }
      },
    }

    const jade = new Jade(iface)
    const address = await jade.getReceiveAddress('mainnet', { path: [0, 0] })

    assert.equal(address, 'bc1qtest')
    assert.deepEqual(calls, [{ method: 'get_receive_address', long_timeout: true }])
  })
})
