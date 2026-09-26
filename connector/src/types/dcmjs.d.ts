/**
 * dcmjs ships no type declarations. Rather than let the whole module become
 * `any` — which would silently remove type checking from the pixel handling,
 * where a wrong assumption produces a black rectangle rather than an error —
 * this declares only the two entry points the viewer uses.
 */
declare module 'dcmjs' {
  export namespace data {
    interface ParsedDicom {
      meta: Record<string, unknown>
      dict: Record<string, unknown>
    }
    const DicomMessage: {
      readFile(buffer: ArrayBuffer): ParsedDicom
    }
    const DicomMetaDictionary: {
      naturalizeDataset(dict: Record<string, unknown>): Record<string, unknown>
    }
  }
}
