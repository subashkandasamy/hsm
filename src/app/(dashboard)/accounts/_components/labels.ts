/** One set of names for the things an accountant reads, shared by every tab. */

export const SOURCE_LABEL: Record<string, string> = {
  consultation: 'Consultation',
  lab:          'Laboratory',
  radiology:    'Radiology',
  pharmacy:     'Pharmacy (OP)',
  ipd_pharmacy: 'Pharmacy (IP)',
  bed:          'Room & bed',
  nursing:      'Nursing',
  icu:          'Intensive care',
  ot:           'Operation theatre',
  blood:        'Blood bank',
  dental:       'Dental',
  manual:       'Other charges',
}

export const METHOD_LABEL: Record<string, string> = {
  cash: 'Cash', card: 'Card', upi: 'UPI',
  bank_transfer: 'Bank transfer', insurance: 'Insurance', cheque: 'Cheque',
  advance: 'From advance',
}

export function money(n: number): string {
  return '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
