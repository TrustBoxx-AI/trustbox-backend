/* src/types/snarkjs.d.ts
   Type declaration for snarkjs — no official types package available.
   ─────────────────────────────────────────────────────────────────── */

declare module "snarkjs" {
  export const groth16: {
    fullProve(
      input:    Record<string, string>,
      wasmPath: string,
      zkeyPath: string
    ): Promise<{ proof: object; publicSignals: string[] }>

    verify(
      vkey:          object,
      publicSignals: string[],
      proof:         object
    ): Promise<boolean>

    exportSolidityCallData(
      proof:         object,
      publicSignals: string[]
    ): Promise<string>
  }

  export const plonk: {
    fullProve(
      input:    Record<string, string>,
      wasmPath: string,
      zkeyPath: string
    ): Promise<{ proof: object; publicSignals: string[] }>

    verify(
      vkey:          object,
      publicSignals: string[],
      proof:         object
    ): Promise<boolean>
  }
}