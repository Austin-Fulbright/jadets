// src/types/bip32-path.d.ts
declare module 'bip32-path' {
  export default class BIPPath {
    static fromString(path: string): { toPathArray(): number[] };
  }
}

