
export function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}
