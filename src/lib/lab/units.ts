/**
 * UCUM is a machine format. A technician should not have to read it.
 *
 * Units are stored in UCUM so two analyzers cannot disagree about what "g/dL"
 * means, but the notation leaks: an analyzer reporting platelets sends
 * `10*9/L`, and that is what appeared on screen next to "281". A laboratory
 * technician reads ×10⁹/L, or 10³/µL, and `10*9/L` looks like a fault.
 *
 * Storage is unchanged. This is only for display.
 */
const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻',
}

export function formatUnit(ucum: string | null | undefined): string {
  if (!ucum) return ''
  return ucum
    // 10*9/L → 10⁹/L, 10*-3 → 10⁻³
    .replace(/10\*(-?\d+)/g, (_, exp: string) =>
      '10' + [...exp].map((c) => SUPERSCRIPT[c] ?? c).join(''))
    // u is UCUM's ASCII stand-in for micro.
    .replace(/\bu(g|L|mol|IU|m)\b/g, 'µ$1')
    .replace(/\[IU\]/g, 'IU')
    .replace(/\{([^}]*)\}/g, '$1')   // {cells}/uL → cells/µL
}
