// tests/unit/jadeExtendedData.test.ts
import { describe, it, expect, beforeEach } from '@jest/globals';
import { Jade } from '../../src/Jade';
import { JadeInterface } from '../../src/interfaces/JadeInterface';
import { MockTransport } from '../mocks/MockTransport';
import type { RPCResponse } from '../../src/types';

describe('Jade extended-data (multi-chunk) responses', () => {
  let transport: MockTransport;
  let iface: JadeInterface;
  let jade: Jade;

  beforeEach(() => {
    transport = new MockTransport({});
    iface = new JadeInterface(transport as any);
    jade = new Jade(iface);
  });

  it('reassembles multi-chunk sign_psbt response correctly', async () => {
    const dummyPsbt = new Uint8Array([0xaa, 0xbb, 0xcc]);
    const requestId = 'ext-123';

    const resultPromise = (jade as any)._jadeRpc(
      'sign_psbt',
      { network: 'testnet', psbt: dummyPsbt },
      requestId,
      true,
    );

    expect(transport.sentMessages).toHaveLength(1);
    const firstReq = transport.sentMessages[0];
    expect(firstReq).toMatchObject({
      id: requestId,
      method: 'sign_psbt',
    });

    const chunk1 = new Uint8Array([1, 2]);
    const chunk2 = new Uint8Array([3, 4]);
    const chunk3 = new Uint8Array([5, 6]);

	await Promise.resolve();

    transport.emitMessage({
      id: requestId,
      result: chunk1,
      seqnum: 1,
      seqlen: 3,
    } as RPCResponse<Uint8Array>);

    expect(transport.sentMessages).toHaveLength(2);
    const secondReq = transport.sentMessages[1];
    expect(secondReq.method).toBe('get_extended_data');
    expect(secondReq.params).toMatchObject({
      origid: requestId,
      orig: 'sign_psbt',
      seqnum: 2,
      seqlen: 3,
    });

    transport.emitMessage({
      id: secondReq.id,
      result: chunk2,
      seqnum: 2,
      seqlen: 3,
    } as RPCResponse<Uint8Array>);

    await Promise.resolve();

    expect(transport.sentMessages).toHaveLength(3);
    const thirdReq = transport.sentMessages[2];
    expect(thirdReq.method).toBe('get_extended_data');
    expect(thirdReq.params).toMatchObject({
      origid: requestId,
      orig: 'sign_psbt',
      seqnum: 3,
      seqlen: 3,
    });

    transport.emitMessage({
      id: thirdReq.id,
      result: chunk3,
      seqnum: 3,
      seqlen: 3,
    } as RPCResponse<Uint8Array>);

    const finalResult = await resultPromise;

    const asArray = Array.from(
      finalResult instanceof Uint8Array
        ? finalResult
        : new Uint8Array(finalResult),
    );
    expect(asArray).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

