'use client'

import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import { istToday } from '@/lib/istDate'
import { ageParts, approxAgeText } from '@/lib/patientAge'

/** Date of birth, or the age it is not known beyond. Typing an age clears the date. */
export interface DobAge { dob: string; years: string; months: string }

/**
 * A saved patient as the form shows them: a real date as the date; an estimated
 * one as the age it was worked out from, with the date box left empty — it was
 * never their birthday.
 */
export function dobAgeFrom(p: { dob: string | null; dob_estimated?: boolean | null }): DobAge {
  if (!p.dob) return { dob: '', years: '', months: '' }
  if (!p.dob_estimated) return { dob: p.dob.slice(0, 10), years: '', months: '' }
  const { years, months } = ageParts(p.dob, istToday())
  return { dob: '', years: String(years), months: years < 2 ? String(months) : '' }
}

/** What the server is sent: the date, or the age (it works out the estimated date). */
export function dobAgePayload(v: DobAge): { dob: string | null; age_years: number | null; age_months: number | null } {
  if (v.dob) return { dob: v.dob, age_years: null, age_months: null }
  const years = v.years.trim(), months = v.months.trim()
  return { dob: null, age_years: years ? Number(years) : months ? 0 : null, age_months: months ? Number(months) : null }
}

/**
 * The "Date of Birth" and "Age" boxes of the registration and edit forms — two
 * grid cells. A date shows the age it gives; an age (with months under 2 years)
 * leaves the date empty and is saved as an estimate.
 */
export default function DobAgeFields({ value, onChange, error, savedEstimate }: {
  value: DobAge
  onChange: (v: DobAge) => void
  error?: string
  /** The patient's saved estimated date, to say what the age stands for. */
  savedEstimate?: string | null
}) {
  const today = istToday()
  const fromDob = value.dob && value.dob <= today ? ageParts(value.dob, today) : null
  const years = fromDob ? String(fromDob.years) : value.years
  const months = fromDob ? (fromDob.years < 2 ? String(fromDob.months) : '') : value.months
  const typedAge = !value.dob && (value.years.trim() || value.months.trim())
  const under2 = !value.dob && value.years.trim() !== '' && Number(value.years) < 2

  const dobHint = value.dob ? 'exact date'
    : savedEstimate && typedAge ? `not known — ${approxAgeText(savedEstimate, today)}, from the age given`
    : typedAge ? 'not known — saved from the age'
    : 'exact date, if known'

  return (
    <>
      <FormField label="Date of Birth" htmlFor="dob" hint={dobHint}>
        <Input id="dob" type="date" max={today}
          value={value.dob} onChange={(e) => onChange({ dob: e.target.value, years: '', months: '' })} />
      </FormField>
      <FormField label="Age" htmlFor="age" required error={error}
        hint={value.dob ? 'from the date of birth' : under2 ? 'months are needed under 2 years' : 'years, and months for a baby'}>
        <div className="flex items-center gap-1.5">
          <Input id="age" type="number" inputMode="numeric" min={0} max={120} placeholder="yrs" aria-label="Age in years"
            hasError={!!error} value={years}
            onChange={(e) => onChange({ dob: '', years: e.target.value, months: value.dob ? '' : value.months })} />
          <Input id="age_months" type="number" inputMode="numeric" min={0} max={11} placeholder="mths" aria-label="Age in months"
            hasError={!!error && under2} value={months}
            onChange={(e) => onChange({ dob: '', years: value.dob ? '' : value.years, months: e.target.value })} />
        </div>
      </FormField>
    </>
  )
}
