// tests/unit/jadeRpc.test.ts
import { describe, it, expect, beforeEach } from '@jest/globals';
import { Jade } from '../../src/Jade';
import { JadeInterface } from '../../src/interfaces/JadeInterface';
import { MockTransport } from '../mocks/MockTransport';
import { RPCResponse } from '../../src/types';

describe('Jade _jadeRpc integration', () => {
  let transport: MockTransport;
  let iface: JadeInterface;
  let jade: Jade;

  beforeEach(() => {
    transport = new MockTransport({});
    iface = new JadeInterface(transport);
    jade = new Jade(iface);
  });

  it('sends a basic RPC request and returns the result', async () => {
    const expectedId = '123';
    const expectedMethod = 'ping';

    const resultPromise = (jade as any)._jadeRpc(
      expectedMethod,
      undefined,
      expectedId,
      false
    );

    expect(transport.sentMessages[0].id).toBe(expectedId);
	
	expect(transport.sentMessages).toHaveLength(1);
    const response: RPCResponse<string> = {
      id: expectedId,
      result: 'pong'
    };
	await Promise.resolve(); // If you don't add this it gets stuck on sync waiting for response
    transport.emitMessage(response);

    const result = await resultPromise;
    expect(result).toBe('pong');
  });

  it('throws when RPC response contains an error', async () => {
    const expectedId = '456';
    const resultPromise = (jade as any)._jadeRpc(
      'debug_clean_reset',
      undefined,
      expectedId,
      false
    );

	await Promise.resolve();
    const errorResponse: RPCResponse<never> = {
      id: expectedId,
      error: {
        code: 123,
        message: 'Something went wrong'
      }
    };
    transport.emitMessage(errorResponse);

    await expect(resultPromise).rejects.toThrow('RPC Error 123: Something went wrong');
  });


});


