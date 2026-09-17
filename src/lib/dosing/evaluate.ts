// Weight-based dose check against the patient's record — used by the live check in
// the prescription forms and by the save actions (server only).

import type { createClient } from '@/lib/supabase/server'
import { istDate, istToday } from '@/lib/istDate'
import {
  checkDose, findRule, inferRoute, parseDoseText, parseFrequencyText, parseConcentration,
  type DoseCheck,
} from '@/lib/dosing/paediatric'
import type { FrequencyType } from '@/lib/types'

export type SupabaseClient = Awaited<ReturnType<typeof createClient>>

const CHILD_AGE_DAYS = 18 * 365.25
const WEIGHT_MAX_AGE_DAYS = 30

export interface DosingWeight {
  /** Patient is under 18 — doses are checked by weight. */
  isChild: boolean
  ageDays: number | null
  weightKg: number | null
  weighedOn: string | null
}

const dayDiff = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86400000)

/** First number in a vitals weight like "18", "18.5 kg". */
const vitalsKg = (v: unknown) => {
  const m = /(\d+(?:\.\d+)?)/.exec(String((v as { weight?: unknown } | null)?.weight ?? ''))
  return m ? Number(m[1]) : null
}

async function loadWeight(supabase: SupabaseClient, patientId: string, visitId?: string | null): Promise<DosingWeight> {
  const today = istToday()
  const since = new Date(Date.now() - WEIGHT_MAX_AGE_DAYS * 86400000).toISOString()
  const [{ data: patient }, { data: growth }, { data: visits }] = await Promise.all([
    supabase.from('patients').select('dob').eq('id', patientId).maybeSingle(),
    supabase.from('pediatric_growth').select('weight_kg, recorded_at, created_at').eq('patient_id', patientId)
      .not('weight_kg', 'is', null).gte('recorded_at', istDate(since)).order('recorded_at', { ascending: false }).order('created_at', { ascending: false }).limit(1),
    supabase.from('visits').select('id, vitals, visit_date').eq('patient_id', patientId).gte('visit_date', since).order('visit_date', { ascending: false }).limit(10),
  ])
  const dob = (patient?.dob as string | null) ?? null
  const ageDays = dob ? dayDiff(dob, today) : null
  const isChild = ageDays == null || ageDays < CHILD_AGE_DAYS

  // This visit's vitals first, then the most recent weight from growth or visit vitals.
  const candidates: Array<{ kg: number; on: string; rank: number }> = []
  for (const v of visits ?? []) {
    const kg = vitalsKg(v.vitals)
    if (kg) candidates.push({ kg, on: istDate(v.visit_date as string), rank: v.id === visitId ? 2 : 0 })
  }
  const g = growth?.[0]
  if (g) candidates.push({ kg: Number(g.weight_kg), on: g.recorded_at as string, rank: 1 })
  // This visit's own weight wins; otherwise the most recent (growth record on a tie).
  const best = candidates.find((c) => c.rank === 2) ?? [...candidates].sort((a, b) => b.on.localeCompare(a.on) || b.rank - a.rank)[0]
  return { isChild: dob ? isChild : false, ageDays, weightKg: best?.kg ?? null, weighedOn: best?.on ?? null }
}

/** Generic name and strength for a brand or free-text drug name, from the drug master. */
async function resolveDrug(supabase: SupabaseClient, drugText: string, ref?: { id: string | null; isGlobal: boolean } | null) {
  if (ref?.id) {
    const { data } = ref.isGlobal
      ? await supabase.from('drug_master').select('generic_name, name, strength').eq('id', ref.id).maybeSingle()
      : await supabase.from('drugs').select('generic_name, name, strength').eq('id', ref.id).maybeSingle()
    if (data) return { generic: (data.generic_name || data.name) as string, strength: (data.strength as string | null) ?? null }
  }
  if (findRule(drugText, 'oral', null).rule || findRule(drugText, 'iv', null).rule) return { generic: null, strength: null }
  const words = drugText.trim().split(/\s+/).map((w) => w.replace(/[%_]/g, ''))
  // "Crocin Syrup 120mg/5ml" → try "Crocin Syrup", then "Crocin" (generic only — another pack's strength may differ).
  for (const [prefix, exact] of [[words.slice(0, 2).join(' '), true], [words[0], false]] as const) {
    if (!prefix || prefix.length < 3) continue
    const { data: brand } = await supabase.from('drug_brands')
      .select('brand_name, master:drug_master(generic_name, strength)')
      .ilike('brand_name', `${prefix}%`).limit(1)
    const m = (brand?.[0]?.master as unknown as { generic_name: string; strength: string | null } | null) ?? null
    if (m) return { generic: m.generic_name, strength: exact ? m.strength : null }
  }
  return { generic: null, strength: null }
}

const FREQ_PER_DAY: Record<FrequencyType, number | null> = {
  stat: 1, daily: 1, twice_daily: 2, thrice_daily: 3, every_x_hours: null, sos: 0, continuous: null,
}

export interface DoseCheckResult extends DoseCheck {
  isChild: boolean
  ageDays: number | null
  weighedOn: string | null
  parseError: string | null
}

export interface DoseCheckInput {
  patientId: string
  visitId?: string | null
  drugName: string
  /** OPD free text */
  dosage?: string | null
  frequency?: string | null
  /** IPD structured */
  dose?: number | null
  doseUnit?: string | null
  route?: string | null
  frequencyType?: FrequencyType | null
  frequencyHours?: number | null
  drugRef?: { id: string | null; isGlobal: boolean } | null
}

export async function evaluateChildDose(supabase: SupabaseClient, input: DoseCheckInput): Promise<DoseCheckResult> {
  const w = await loadWeight(supabase, input.patientId, input.visitId)
  const empty: DoseCheckResult = { status: 'unchecked', rule: null, weightKg: w.weightKg, suggestion: null, mgPerKgDose: null, mgPerKgDay: null, messages: [], isChild: w.isChild, ageDays: w.ageDays, weighedOn: w.weighedOn, parseError: null }
  const drugText = input.drugName.trim()
  if (!w.isChild || drugText.length < 3) return empty

  const drug = await resolveDrug(supabase, drugText, input.drugRef)
  // The strength written in the prescription wins over the catalogue's.
  const strengthText = /\d\s*(mg|mcg|g)\b/i.test(drugText) || !drug.strength ? drugText : `${drugText} ${drug.strength}`
  const route = inferRoute(input.route, drugText)

  let doseMg: number | null = null
  let parseError: string | null = null
  if (input.dose != null && input.doseUnit) {
    const u = input.doseUnit.toLowerCase()
    if (u === 'mg') doseMg = input.dose
    else if (u === 'g') doseMg = input.dose * 1000
    else if (u === 'mcg') doseMg = input.dose / 1000
    else if (u === 'ml') {
      const c = parseConcentration(strengthText)
      if (c) doseMg = input.dose * c
      else parseError = 'Choose a drug with a known strength (mg/ml) or enter the dose in mg to check it'
    }
  } else if (input.dosage) {
    const p = parseDoseText(input.dosage, strengthText)
    if (p && 'error' in p) parseError = p.error
    else if (p) doseMg = p.mg
  }

  let perDay: number | null = null
  let prn = false
  if (input.frequencyType) {
    if (input.frequencyType === 'every_x_hours') perDay = input.frequencyHours ? Math.floor(24 / input.frequencyHours) : null
    else if (input.frequencyType === 'sos') prn = true
    else perDay = FREQ_PER_DAY[input.frequencyType]
  } else if (input.frequency) {
    const f = parseFrequencyText(input.frequency)
    if (f) { perDay = f.prn ? null : f.perDay; prn = f.prn }
  }

  const res = checkDose({ drugText, generic: drug.generic, strengthText, route, ageDays: w.ageDays, weightKg: w.weightKg, doseMg, dosesPerDay: perDay, prn })
  // A dose we could not read is only worth mentioning when there is a rule for the drug.
  return { ...res, isChild: true, ageDays: w.ageDays, weighedOn: w.weighedOn, parseError: res.rule ? parseError : null }
}

/**
 * Server-side guard used when saving a prescription or medication order: a dose above
 * the maximum for a child needs an explicit override.
 */
export async function doseOverMaxError(supabase: SupabaseClient, input: DoseCheckInput, override: boolean): Promise<string | null> {
  const res = await evaluateChildDose(supabase, input)
  if (res.status !== 'over_max' || override) return null
  const msg = res.messages.find((m) => m.level === 'severe')?.text ?? 'Dose is above the maximum'
  return `${res.rule?.label ?? 'Dose'}: ${msg}. Tick "Override" if this dose is intended.`
}

