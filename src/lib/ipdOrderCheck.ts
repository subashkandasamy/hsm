// What an IPD order must say before it is saved — checked on the screen and
// again in createOrder. An order with no drug went to the pharmacy as
// "— mg IV" (BUG-016); a tablet could be ordered IV with no warning (BUG-039).
import type { MedicationOrderType } from '@/lib/types'

const PARENTERAL = new Set(['IV', 'IM', 'SC'])
const ORAL_FORM = /\b(tab|tabs|tablets?|caps?|capsules?|syrup|suspension|chewable)\b/i

export function ipdOrderError(o: {
  type: MedicationOrderType
  drug_name?: string | null
  /** The picked drug's form ("Tablet"): a name picked from the list is
   *  "Pantoprazole 40mg" — the form is not in it, and a tablet went IV. */
  drug_form?: string | null
  dose?: number | null
  route?: string | null
  fluid_name?: string | null
  volume_ml?: number | null
  rate_ml_per_hr?: number | null
  flow_rate_lpm?: number | null
  duration_days?: number | null
}): string | null {
  if (o.type === 'medication') {
    const name = (o.drug_name ?? '').trim()
    if (!name) return 'Enter the drug name'
    if (o.dose != null && !(o.dose > 0)) return 'The dose must be more than 0'
    const described = `${name} ${o.drug_form ?? ''}`
    if (o.route && PARENTERAL.has(o.route) && ORAL_FORM.test(described)) {
      const form = described.match(ORAL_FORM)![0].toLowerCase()
      return `${name} is a ${/cap/.test(form) ? 'capsule' : /syrup|suspension/.test(form) ? 'liquid taken by mouth' : 'tablet'} — it can't be given ${o.route}. Pick the injection, or change the route.`
    }
  }
  if (o.type === 'iv_infusion') {
    if (!(o.fluid_name ?? '').trim()) return 'Enter the IV fluid'
    if (o.volume_ml != null && !(o.volume_ml > 0)) return 'The volume must be more than 0 ml'
    if (o.rate_ml_per_hr != null && !(o.rate_ml_per_hr > 0 && o.rate_ml_per_hr <= 1000)) return 'The rate must be between 1 and 1000 ml/h'
  }
  if (o.type === 'oxygen') {
    if (!(o.flow_rate_lpm != null && o.flow_rate_lpm > 0 && o.flow_rate_lpm <= 60)) return 'Enter the oxygen flow (1–60 L/min)'
  }
  if (o.duration_days != null && !(o.duration_days >= 1 && o.duration_days <= 90)) return 'Duration must be 1–90 days'
  return null
}
