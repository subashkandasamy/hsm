// jsbarcode ships no types for its individual symbology encoders.
declare module 'jsbarcode/bin/barcodes/CODE128' {
  export class CODE128 {
    constructor(data: string, options: Record<string, unknown>)
    valid(): boolean
    encode(): { data: string; text: string }
  }
}
