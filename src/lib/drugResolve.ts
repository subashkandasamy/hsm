/**
 * Drug name → generic name, from the drug catalogue.
 *
 * Two resolvers, in one place so a fix to either lands once:
 *
 * - `resolveDrug` is the dose check's. Moved here unchanged from
 *   `dosing/evaluate.ts`, so the dose check behaves exactly as before. It takes
 *   the first brand a prefix finds, which is acceptable for a dose hint.
 *
 * - `resolveGenerics` is the allergy / interaction check's. That check compared
 *   the label as written against generic names, and a brand never matches its
 *   generic — "Azithral 500" never met "azithromycin" — so it was silent for
 *   almost every prescription, nine in ten of which are written as brands. A
 *   safety check cannot guess: an exact match is trusted, a prefix only when
 *   every brand it reaches is the same molecule, and anything else is reported
 *   as unidentified so the doctor knows the check did not run.
 *
 * Server only — both read the catalogue through the caller's client.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { findRule } from '@/lib/dosing/paediatric'

/** Generic name and strength for a brand or free-text drug name, from the drug master. */
export async function resolveDrug(supabase: SupabaseClient, drugText: string, ref?: { id: string | null; isGlobal: boolean } | null) {
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

// ── The allergy / interaction check's resolver ──────────────────────────────

/**
 * One molecule under its two names — the one used in India and the US one. The
 * catalogue holds both: "Dolo 650" resolves to Acetaminophen and to Paracetamol.
 * An allergy recorded as "paracetamol" must still meet a drug the catalogue
 * calls acetaminophen. Short on purpose: a pair belongs here only when both
 * names are in real use for the same molecule. The second name is the one
 * treated as canonical.
 */
const GENERIC_SYNONYMS: ReadonlyArray<readonly [string, string]> = [
  ['acetaminophen', 'paracetamol'],
  ['acetylsalicylic acid', 'aspirin'],
  ['albuterol', 'salbutamol'],
  ['cyclosporine', 'ciclosporin'],
  ['epinephrine', 'adrenaline'],
  ['furosemide', 'frusemide'],
  ['glyburide', 'glibenclamide'],
  ['lidocaine', 'lignocaine'],
  ['meperidine', 'pethidine'],
  ['norepinephrine', 'noradrenaline'],
  ['rifampin', 'rifampicin'],
]

/** `word` as a whole word — so "epinephrine" is not found inside "norepinephrine". */
function wholeWord(word: string): RegExp {
  const escaped = word.replace(/[.*+?^$()|[\]\\]/g, '\\$&')
  return new RegExp('(^|[^a-z])' + escaped + '(?=$|[^a-z])', 'g')
}

/** Each name, plus the same name with every molecule spelled the other way. Lower-case, de-duplicated. */
export function withSynonyms(names: string[]): string[] {
  const out = new Set<string>()
  for (const raw of names) {
    const name = raw.trim().toLowerCase()
    if (!name) continue
    out.add(name)
    for (const [a, b] of GENERIC_SYNONYMS) {
      for (const [from, to] of [[a, b], [b, a]] as const) {
        if (wholeWord(from).test(name)) out.add(name.replace(wholeWord(from), (_m, pre: string) => pre + to))
      }
    }
  }
  return [...out]
}

/** One spelling per molecule, so two names for the same drug count once. */
function canonicalGeneric(generic: string): string {
  let name = generic.trim().toLowerCase().replace(/\s+/g, ' ')
  for (const [other, canonical] of GENERIC_SYNONYMS) {
    name = name.replace(wholeWord(other), (_m, pre: string) => pre + canonical)
  }
  return name
}

/**
 * The single molecule a set of catalogue rows agrees on, or null when they
 * disagree or say nothing. "Dolo" reaches Acetaminophen and Paracetamol — one
 * molecule. "Glycomet" reaches Metformin and Metformin + Glimepiride — two, and
 * a safety check must not pick one of them.
 */
export function pickUniqueGeneric(generics: Array<string | null | undefined>): string | null {
  const distinct = new Set(
    generics.filter((g): g is string => !!g && !!g.trim()).map(canonicalGeneric),
  )
  return distinct.size === 1 ? [...distinct][0] : null
}

/** A drug picked from the catalogue: a `drug_master` row (global) or the hospital's own `drugs` row. */
export interface DrugRef { id: string; isGlobal: boolean }

/** A label to resolve, with the catalogue row it was picked from when there is one. */
export interface DrugToResolve { label: string; ref?: DrugRef | null }

export interface ResolvedDrug {
  /** The catalogue's generic names for the label, both spellings, lower-case. Empty when unidentified. */
  generics: string[]
  /** Whether the catalogue recognised the label at all. */
  identified: boolean
}

const UNIDENTIFIED: ResolvedDrug = { generics: [], identified: false }

/** The generic of an embedded drug_master row, which PostgREST may hand back as an object or a one-element array. */
function masterGeneric(master: unknown): string | null {
  const m = (Array.isArray(master) ? master[0] : master) as { generic_name?: string | null; name?: string | null } | null | undefined
  return m ? (m.generic_name || m.name || null) : null
}

/** Strip what ILIKE or PostgREST would read as a wildcard, so a label is only ever matched as itself. */
const asLiteral = (s: string) => s.replace(/[%_*\\]/g, '').replace(/\s+/g, ' ').trim()

/**
 * The drug the doctor picked from the list — exact, so it is tried before any
 * name matching. A hospital's own medicine with no generic recorded says
 * nothing about what it is (its name is just the brand again), so that falls
 * through to the name lookup instead of passing a brand off as a generic.
 */
async function resolveByRef(supabase: SupabaseClient, ref: DrugRef): Promise<ResolvedDrug | null> {
  const { data } = ref.isGlobal
    ? await supabase.from('drug_master').select('generic_name, name').eq('id', ref.id).maybeSingle()
    : await supabase.from('drugs').select('generic_name, name').eq('id', ref.id).maybeSingle()
  if (!data) return null
  const generic = ref.isGlobal
    ? ((data.generic_name || data.name) as string | null)
    : (data.generic_name as string | null)
  return generic && generic.trim() ? { generics: withSynonyms([generic]), identified: true } : null
}

async function resolveOne(supabase: SupabaseClient, label: string, ref?: DrugRef | null): Promise<ResolvedDrug> {
  if (ref?.id) {
    const viaRef = await resolveByRef(supabase, ref)
    if (viaRef) return viaRef
  }
  const text = asLiteral(label)
  if (text.length < 3) return UNIDENTIFIED
  const found = (gens: Array<string | null | undefined>): ResolvedDrug | null => {
    const list = gens.filter((g): g is string => !!g && !!g.trim())
    return list.length ? { generics: withSynonyms(list), identified: true } : null
  }

  // 1. The label is a brand, exactly. Every molecule the catalogue gives that
  //    exact brand is kept: brand names do collide across makers, and each one
  //    is something this label may really be.
  const { data: brands } = await supabase.from('drug_brands')
    .select('master:drug_master(generic_name, name)')
    .ilike('brand_name', text).limit(20)
  const viaBrand = found((brands ?? []).map((b) => masterGeneric(b.master)))
  if (viaBrand) return viaBrand

  // 2. The label is a catalogue molecule, by its name or its generic name.
  const [{ data: byName }, { data: byGeneric }] = await Promise.all([
    supabase.from('drug_master').select('generic_name, name').ilike('name', text).limit(5),
    supabase.from('drug_master').select('generic_name, name').ilike('generic_name', text).limit(5),
  ])
  const viaMaster = found([...(byName ?? []), ...(byGeneric ?? [])]
    .map((m) => (m.generic_name || m.name) as string | null))
  if (viaMaster) return viaMaster

  // 3. The hospital's own catalogue. RLS keeps this to the caller's hospital.
  const { data: own } = await supabase.from('drugs').select('generic_name').ilike('name', text).limit(5)
  const viaOwn = found((own ?? []).map((d) => d.generic_name as string | null))
  if (viaOwn) return viaOwn

  // 4. A brand the label is the start of — "Glycomet 500" for "Glycomet 500 SR
  //    Tablet" — trusted only when every brand it reaches is the same molecule.
  //    Two words before one; an ambiguous answer ends the search instead of
  //    falling back to something looser, which could only be more ambiguous.
  const words = text.split(' ')
  const tried = new Set<string>()
  for (const prefix of [words.slice(0, 2).join(' '), words[0]]) {
    if (prefix.length < 4 || tried.has(prefix)) continue
    tried.add(prefix)
    const { data: rows } = await supabase.from('drug_brands')
      .select('master:drug_master(generic_name, name)')
      .ilike('brand_name', `${prefix}%`).order('brand_name').limit(50)
    const gens = (rows ?? []).map((b) => masterGeneric(b.master))
    if (!gens.some(Boolean)) continue
    const one = pickUniqueGeneric(gens)
    return one ? { generics: withSynonyms([one]), identified: true } : UNIDENTIFIED
  }
  return UNIDENTIFIED
}

/**
 * What each drug is, as far as the catalogue can say. Keyed by the label
 * trimmed and lower-cased. A label given with the catalogue row it was picked
 * from is resolved by that row; if the same label appears with and without one,
 * the row wins. Drugs are resolved in parallel; a lookup that fails reads as
 * unidentified, which the caller reports — never as a clean pass.
 */
export async function resolveGenerics(
  supabase: SupabaseClient,
  drugs: Array<string | DrugToResolve>,
): Promise<Map<string, ResolvedDrug>> {
  const refs = new Map<string, DrugRef | null>()
  for (const d of drugs) {
    const item = typeof d === 'string' ? { label: d, ref: null } : d
    const key = item.label.trim().toLowerCase()
    if (key.length < 3) continue
    if (!refs.has(key) || (!refs.get(key) && item.ref?.id)) refs.set(key, item.ref?.id ? item.ref : null)
  }
  const keys = [...refs.keys()]
  const results = await Promise.all(keys.map((k) => resolveOne(supabase, k, refs.get(k)).catch(() => UNIDENTIFIED)))
  return new Map(keys.map((k, i) => [k, results[i]]))
}
