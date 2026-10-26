/**
 * Every note box that can carry reusable phrases, named once.
 *
 * A phrase belongs to exactly one of these. That scoping is the difference
 * between a picker worth tapping and one that isn't: offer a CVS finding under
 * chief complaint and the doctor has to read past the wrong half of the list,
 * which costs more time than typing.
 *
 * The keys are deliberately stable strings rather than an enum in the database,
 * because note fields get added and a new box should not need a migration
 * before it can have phrases. They are listed here so the Settings screen can
 * show the library grouped the way a doctor thinks about it, and so a typo in
 * a key is a compile error at the call site rather than an empty dropdown.
 */
export const NOTE_FIELDS = {
  'consult.complaint':      'Chief Complaint',
  'consult.diagnosis':      'Diagnosis',
  'consult.notes':          'Notes',

  'exam.general':           'General Condition',
  'exam.cvs':               'CVS',
  'exam.rs':                'Respiratory',
  'exam.pa':                'Abdomen (P/A)',
  'exam.cns':               'CNS',
  'exam.other':             'Other / Local',

  'hx.past_medical':        'Past Medical',
  'hx.past_surgical':       'Past Surgical',
  'hx.drug_history':        'Drug History',
  'hx.family_history':      'Family History',
  'hx.social_history':      'Social History',

  'ipd.progress_note':      'Clinical Note (ward round)',
  'ipd.discharge_summary':  'Discharge Summary',
  'ot.notes':               'Operation Notes',
  'eye.notes':              'Ophthalmic Notes',

  'nursing.situation':      'Handover — Situation',
  'nursing.background':     'Handover — Background',
  'nursing.assessment':     'Handover — Assessment',
  'nursing.recommendation': 'Handover — Recommendation',
} as const

export type NoteFieldKey = keyof typeof NOTE_FIELDS

/** The groups the Settings screen lists, in the order a consultation runs. */
export const NOTE_FIELD_GROUPS: { label: string; keys: NoteFieldKey[] }[] = [
  { label: 'Consultation', keys: ['consult.complaint', 'consult.diagnosis', 'consult.notes'] },
  { label: 'Examination',  keys: ['exam.general', 'exam.cvs', 'exam.rs', 'exam.pa', 'exam.cns', 'exam.other'] },
  { label: 'History',      keys: ['hx.past_medical', 'hx.past_surgical', 'hx.drug_history', 'hx.family_history', 'hx.social_history'] },
  { label: 'Inpatient',    keys: ['ipd.progress_note', 'ipd.discharge_summary'] },
  { label: 'Nursing handover', keys: ['nursing.situation', 'nursing.background', 'nursing.assessment', 'nursing.recommendation'] },
  { label: 'Theatre & specialty', keys: ['ot.notes', 'eye.notes'] },
]

export function isNoteFieldKey(k: string): k is NoteFieldKey {
  return Object.prototype.hasOwnProperty.call(NOTE_FIELDS, k)
}
