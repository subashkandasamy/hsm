/**
 * May a service go ahead before its bill is paid?
 *
 * Six gates ask this — starting a consultation, collecting a lab sample,
 * releasing a lab report, performing a scan, handing over medicines, issuing
 * blood — and so do the worklists that show what is "awaiting payment". They
 * all ask here, so a screen can never disagree with the gate behind it.
 *
 * A service may go ahead unpaid when the hospital does not take payment first
 * for that service (Settings → Billing & Collections), or when the encounter is
 * cashless — an insurer has approved it and will settle later. The cashless
 * rule is unchanged and still lives in `cashlessCover.ts`; this adds the
 * hospital's choice in front of it.
 *
 * Server only.
 */

import type { createClient } from '@/lib/supabase/server'
import { isBillCashlessCovered } from '@/lib/cashlessCover'

type Supa = Awaited<ReturnType<typeof createClient>>

export type PayGateService = 'consultation' | 'lab' | 'radiology' | 'pharmacy' | 'blood'

/** true = the service waits for its bill to be paid. */
export type PrepayRules = Record<PayGateService, boolean>

/**
 * Every service paid for first — the behaviour every hospital had before the
 * setting existed. A hospital that has never opened the settings page keeps
 * exactly this, and so does every hospital if the settings cannot be read.
 */
export const DEFAULT_PREPAY: Readonly<PrepayRules> = Object.freeze({
  consultation: true, lab: true, radiology: true, pharmacy: true, blood: true,
})

export const PREPAY_COLUMNS = 'prepay_consultation, prepay_lab, prepay_radiology, prepay_pharmacy, prepay_blood'

type PrepayRow = {
  prepay_consultation?: boolean | null; prepay_lab?: boolean | null; prepay_radiology?: boolean | null
  prepay_pharmacy?: boolean | null; prepay_blood?: boolean | null
}

/**
 * The rules from a settings row. Anything missing reads as "pay first" — a
 * gate that cannot tell must keep asking for money rather than give the
 * service away, because the other mistake cannot be taken back.
 */
export function rulesFromRow(row: PrepayRow | null | undefined): PrepayRules {
  return {
    consultation: row?.prepay_consultation !== false,
    lab:          row?.prepay_lab          !== false,
    radiology:    row?.prepay_radiology    !== false,
    pharmacy:     row?.prepay_pharmacy     !== false,
    blood:        row?.prepay_blood        !== false,
  }
}

/**
 * This hospital's rules. A failed read falls back to the defaults AND says so
 * in the log. The GST setting once failed silently here in the opposite
 * direction — a missing column turned into "no GST" on every bill — so a read
 * error is never swallowed, only survived.
 */
export async function getPrepayRules(supabase: Supa, tenantId: string): Promise<PrepayRules> {
  const { data, error } = await supabase
    .from('billing_settings').select(PREPAY_COLUMNS).eq('tenant_id', tenantId).maybeSingle()
  if (error) {
    console.error('[payGate] billing_settings unreadable — every service stays pay-first:', error.message)
    return { ...DEFAULT_PREPAY }
  }
  return rulesFromRow(data as PrepayRow | null)
}

/** Does this hospital make this service wait for payment? */
export async function requiresPaymentFirst(supabase: Supa, tenantId: string, service: PayGateService): Promise<boolean> {
  return (await getPrepayRules(supabase, tenantId))[service]
}

/**
 * The gate itself, for a service whose bill is already known: true when the
 * service may go ahead even though the bill is unpaid. The hospital's choice is
 * checked first because it is one row; the cashless lookup only runs when the
 * hospital does want payment first.
 */
export async function unpaidAllowed(
  supabase: Supa,
  tenantId: string,
  service: PayGateService,
  bill: { id: string; visit_id: string | null; admission_id: string | null },
): Promise<boolean> {
  if (!(await requiresPaymentFirst(supabase, tenantId, service))) return true
  return isBillCashlessCovered(supabase, bill)
}
