import { EventEmitter } from 'events';
import { JadeTransport, RPCRequest, RPCResponse} from '../../src/types';

export class MockTransport extends EventEmitter implements JadeTransport {

  public sentMessages: RPCRequest<unknown>[] = [];

  // Provide empty impl in connect/disconnect for testing
  async connect(): Promise<void>{ /* no-op */ }

  async disconnect(): Promise<void>{ /* no-op */}

  async sendMessage(msg: RPCRequest<unknown>): Promise<void> {
	this.sentMessages.push(msg);
  }

  onMessage(callback: (msg: RPCResponse<unknown>) => void): void {
    this.on('message', callback);
  }

  emitMessage(msg: RPCResponse<unknown>): void {
	  this.emit('message', msg);
  }
}


