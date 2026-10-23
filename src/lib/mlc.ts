/**
 * Does this casualty case look medico-legal?
 *
 * Used to pre-tick the box at registration, never to decide. The duty under
 * BNSS 2023 section 397 rests on the treating doctor personally, and no
 * keyword list is going to carry that for them — a patient who says they fell
 * down the stairs may have been pushed, and only the person in the room can
 * tell.
 *
 * What this does carry is the far commoner failure: nobody at the desk
 * thinking of the question at all. A box already ticked, with the reason
 * showing, is answered. An empty box is skipped.
 *
 * So it leans towards suggesting. A wrongly suggested case costs someone one
 * click; a missed one is an offence by the hospital and, under BNS section
 * 200, by the doctor.
 */

/** Word fragments that make a complaint worth a second look, by category. */
const HINTS: Array<{ label: string; terms: string[] }> = [
  { label: 'a road traffic accident', terms: [
    'rta', 'road traffic', 'accident', 'bike accident', 'two wheeler', 'two-wheeler',
    'car hit', 'hit by', 'knocked down', 'run over', 'collision', 'lorry', 'bus hit',
    'auto accident', 'scooter', 'motorcycle', 'vehicle',
  ]},
  { label: 'an assault', terms: [
    'assault', 'attack', 'attacked', 'beaten', 'beating', 'hit with', 'stab', 'stabbed',
    'stabbing', 'cut injury', 'knife', 'sickle', 'machete', 'gunshot', 'gun shot',
    'firearm', 'bullet', 'fight', 'quarrel', 'thrashed', 'manhandled',
  ]},
  { label: 'burns', terms: [
    'burn', 'burns', 'burnt', 'scald', 'scalded', 'kerosene', 'stove burst',
    'acid', 'flame', 'fire injury', 'electrocut', 'electric shock',
  ]},
  { label: 'poisoning or an overdose', terms: [
    'poison', 'poisoning', 'pesticide', 'insecticide', 'organophosphorus', 'op poisoning',
    'rat kill', 'rodenticide', 'phenyl', 'overdose', 'tablets consumed', 'consumed tablets',
    'drug overdose', 'alcohol', 'intoxicat', 'drunk', 'substance',
  ]},
  { label: 'possible self-harm', terms: [
    'suicide', 'self harm', 'self-harm', 'selfharm', 'hanging', 'hanged', 'strangulat',
    'wrist cut', 'cut wrist', 'jumped from', 'immolat',
  ]},
  { label: 'drowning', terms: ['drown', 'drowning', 'drowned', 'fell in well', 'submerged'] },
  { label: 'a bite', terms: [
    'snake bite', 'snakebite', 'dog bite', 'animal bite', 'scorpion', 'human bite', 'sting',
  ]},
  { label: 'a fall from height', terms: [
    'fall from', 'fell from', 'fall from height', 'fell from tree', 'fell from roof',
    'construction fall', 'ladder',
  ]},
  { label: 'an unexplained unconscious or deceased arrival', terms: [
    'brought dead', 'unconscious', 'unresponsive', 'found lying', 'found unconscious',
    'coma', 'comatose', 'collapsed on road',
  ]},
  { label: 'a possible criminal abortion', terms: [
    'criminal abortion', 'illegal abortion', 'unsafe abortion',
  ]},
  { label: 'an industrial or machinery injury', terms: [
    'machine injury', 'machinery', 'factory injury', 'crush injury', 'mill injury',
    'amputat', 'degloving',
  ]},
]

export interface MlcSuggestion {
  suggested: boolean
  /** Why, phrased so it can be shown to the person at the desk. */
  reason: string | null
}

/**
 * Suggest the flag from what triage already typed.
 *
 * An ambulance arrival on its own is not a suggestion: a 108 ambulance brings
 * chest pain and labour as often as it brings a crash victim. It only adds
 * weight where the complaint already points somewhere, which is why it is not
 * in the list above.
 */
export function suggestMlc(input: {
  complaint?: string | null
  arrivalMode?: string | null
}): MlcSuggestion {
  const text = (input.complaint ?? '').toLowerCase()
  if (!text.trim()) return { suggested: false, reason: null }

  const matched = HINTS.filter((h) => h.terms.some((t) => text.includes(t)))
  if (matched.length === 0) return { suggested: false, reason: null }

  const labels = matched.map((m) => m.label)
  const list = labels.length === 1
    ? labels[0]
    : `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`

  return {
    suggested: true,
    reason: `The complaint mentions ${list}, which the law requires be reported to the police.`,
  }
}

/** The grades, in the words the register and the charge sheet use. */
export const INJURY_GRADES: Array<{ value: string; label: string; hint: string }> = [
  { value: 'none',      label: 'No injury',  hint: 'Examined, nothing found' },
  { value: 'simple',    label: 'Simple',     hint: 'Not endangering life or causing lasting harm' },
  { value: 'grievous',  label: 'Grievous',   hint: 'As defined in BNS s.117 — fracture, permanent damage, and the rest' },
  { value: 'dangerous', label: 'Dangerous',  hint: 'Endangering life' },
  { value: 'deferred',  label: 'Yet to say', hint: 'Awaiting an X-ray, an opinion or observation' },
]

export const DISPOSALS: Array<{ value: string; label: string }> = [
  { value: 'treated_discharged', label: 'Treated and discharged' },
  { value: 'admitted',           label: 'Admitted' },
  { value: 'referred',           label: 'Referred elsewhere' },
  { value: 'absconded',          label: 'Left against advice / absconded' },
  { value: 'died',               label: 'Died after admission' },
  { value: 'brought_dead',       label: 'Brought dead' },
]

export const INTIMATION_METHODS: Array<{ value: string; label: string }> = [
  { value: 'in_person', label: 'Copy handed to an officer' },
  { value: 'telephone', label: 'Telephoned' },
  { value: 'written',   label: 'Written intimation sent' },
  { value: 'other',     label: 'Other' },
]
