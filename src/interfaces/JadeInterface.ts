// interface/JadeInterface.ts
import cbor from "cbor2";
import { JadeTransport, IJadeInterface, RPCRequest, RPCResponse } from "../types";

export class JadeInterface implements IJadeInterface {
  constructor(private transport: JadeTransport) {}

  async connect() {
    console.log("[JadeInterface] → connect() called");
    await this.transport.connect();
    console.log("[JadeInterface] ← connect() completed");
  }

  async disconnect() {
    console.log("[JadeInterface] → disconnect() called");
    await this.transport.disconnect();
    console.log("[JadeInterface] ← disconnect() completed");
  }

  buildRequest(id: string, method: string, params?: any): RPCRequest {
    console.log(
      `[JadeInterface] buildRequest(): id=${id}, method=${method}, params=${JSON.stringify(
        params
      )}`
    );
    return { id, method, params };
  }

  async makeRPCCall(
    request: RPCRequest,
    long_timeout: boolean = false
  ): Promise<RPCResponse> {
    if (!request.id || request.id.length > 16) {
      throw new Error("Request id must be non-empty and less than 16 characters");
    }
    if (!request.method || request.method.length > 32) {
      throw new Error("Request method must be non-empty and less than 32 characters");
    }

    console.log(
      `[JadeInterface] → makeRPCCall() sending RPC: method="${request.method}", id="${request.id}", params=${JSON.stringify(
        request.params
      )}`
    );
    await this.transport.sendMessage(request);
    console.log(
      `[JadeInterface]   sendMessage() returned for id="${request.id}"`
    );

    return new Promise<RPCResponse>((resolve, reject) => {
      const onResponse = (msg: RPCResponse) => {
        if (msg && msg.id === request.id) {
          console.log(
            `[JadeInterface]   Response matches request id="${request.id}". Cleaning up listener.`
          );
          this.transport.removeListener("message", onResponse);
          if (timeoutId) {
            clearTimeout(timeoutId);
            console.log(
              `[JadeInterface]   Cleared timeout for id="${request.id}"`
            );
          }
          resolve(msg);
        }
      };

      console.log(
        `[JadeInterface]   Registering onResponse listener for id="${request.id}"`
      );
      this.transport.onMessage(onResponse);

      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      if (!long_timeout) {
        timeoutId = setTimeout(() => {
          console.warn(
            `[JadeInterface]   RPC call timed out for id="${request.id}"`
          );
          this.transport.removeListener("message", onResponse);
          reject(new Error("RPC call timed out"));
        }, 5000);
        console.log(
          `[JadeInterface]   Timeout scheduled for id="${request.id}" in 5000ms`
        );
      }
    });
  }
}

