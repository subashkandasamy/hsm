/**
 * Examination items — one list for the OPD examination panel and the Initial
 * Evaluation's secondary survey, so a finding is named the same everywhere.
 * Stored the same way too: { signs: {pallor: true, …}, general, systems: {cvs, …} }.
 */

export const EXAM_SIGNS = ['pallor', 'icterus', 'cyanosis', 'clubbing', 'oedema', 'lymphadenopathy'] as const

export const EXAM_SIGN_LABELS: Record<string, string> = {
  pallor: 'Pallor', icterus: 'Icterus', cyanosis: 'Cyanosis', clubbing: 'Clubbing', oedema: 'Oedema', lymphadenopathy: 'Lymphadenopathy',
  jvp: 'Raised JVP', dehydration: 'Dehydration',
}

export const EXAM_SYSTEMS: { key: string; label: string; placeholder: string }[] = [
  { key: 'cvs', label: 'CVS', placeholder: 'S1 S2 heard, no murmur' },
  { key: 'rs',  label: 'Respiratory', placeholder: 'B/L air entry equal, no added sounds' },
  { key: 'pa',  label: 'Abdomen (P/A)', placeholder: 'Soft, non-tender, no organomegaly' },
  { key: 'cns', label: 'CNS', placeholder: 'Conscious, oriented, no focal deficit' },
  { key: 'other', label: 'Other / Local', placeholder: 'Local examination findings' },
]

/** The secondary survey adds what an ER head-to-toe needs (KMCH's form). */
export const SURVEY_SIGNS = [...EXAM_SIGNS, 'jvp', 'dehydration'] as const
export const SURVEY_SYSTEMS: { key: string; label: string; placeholder: string }[] = [
  ...EXAM_SYSTEMS.filter((s) => s.key !== 'other'),
  { key: 'spine', label: 'Spine', placeholder: 'No step, no tenderness' },
  { key: 'limbs', label: 'Limbs / extremities', placeholder: 'No deformity, pulses felt' },
  { key: 'other', label: 'Other / Local', placeholder: 'Wounds, local findings' },
]

export interface ExamFindings {
  signs?: Record<string, boolean>
  general?: string
  systems?: Record<string, string>
}
