/** Blood gas columns in the order the ICU sheet reads them; BE falls back to the blood value. */
export const ABG_COLUMNS: Array<{ code: string; label: string; alt?: string }> = [
  { code: 'BG_PH', label: 'pH' }, { code: 'PCO2', label: 'pCO₂' }, { code: 'PO2', label: 'pO₂' },
  { code: 'HCO3', label: 'HCO₃' }, { code: 'BE_ECF', label: 'BE', alt: 'BE_B' }, { code: 'LACT', label: 'Lactate' },
  { code: 'SO2', label: 'SO₂' }, { code: 'NA', label: 'Na' }, { code: 'K', label: 'K' }, { code: 'CL', label: 'Cl' },
  { code: 'BG_GLU', label: 'Glucose' },
]
