// A validation failure as a person can act on it: which box, and what is
// wrong. "Too big: expected number to be <=100" named neither the box nor the
// second mistake (BUG-030).
import type { ZodError } from 'zod'

const LABELS: Record<string, string> = {
  hr: 'Heart rate', pulse: 'Pulse', sbp: 'Systolic BP', dbp: 'Diastolic BP', map: 'MAP', cvp: 'CVP',
  rr: 'Respiratory rate', spo2: 'SpO₂', temp: 'Temperature', grbs: 'GRBS', etco2: 'EtCO₂',
  weight: 'Weight', height: 'Height', gcs_e: 'GCS E (eyes)', gcs_v: 'GCS V (verbal)', gcs_m: 'GCS M (motor)',
  pain: 'Pain score', oxygen_lpm: 'Oxygen (L/min)', fio2: 'FiO₂', peep: 'PEEP', at: 'Time',
}

type Issue = ZodError['issues'][number] & { maximum?: number | bigint; minimum?: number | bigint; origin?: string; inclusive?: boolean }

export function zodIssuesText(err: ZodError, labels: Record<string, string> = {}): string {
  return (err.issues as Issue[]).slice(0, 4).map((i) => {
    const key = [...i.path].reverse().find((p) => typeof p === 'string') as string | undefined
    const label = key ? (labels[key] ?? LABELS[key] ?? key.replace(/_/g, ' ')) : ''
    // A message the schema wrote itself ("Name the treatment") is already
    // plain words — keep it. Only zod's own ("Too big: expected …") is reworded.
    if (!/^(Too (big|small)|Invalid input)/.test(i.message)) return i.message
    let msg = i.message
    const chars = i.origin === 'string' ? ' characters' : ''
    if (i.code === 'too_big' && i.maximum != null) msg = `must be ${i.inclusive === false ? 'under' : 'at most'} ${i.maximum}${chars}`
    else if (i.code === 'too_small' && i.minimum != null) msg = `must be ${i.inclusive === false ? 'over' : 'at least'} ${i.minimum}${chars}`
    else msg = 'is not valid'
    return label ? `${label} ${msg}` : msg
  }).join(' · ')
}
