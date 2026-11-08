import { createElement } from 'react'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import { listPoliceIntimations, type PoliceIntimation } from '@/app/actions/mlc'
import { AccidentRegisterPdf, PoliceIntimationPdf, type MlcRecordData, type CodeLabels } from '@/lib/pdf/MlcPdf'
import { loadLogo } from '@/lib/pdf/parts'
import { fileSafe, renderPdfResponse } from '@/lib/pdf/render'
import { createClient } from '@/lib/supabase/server'
import { getActorProfile, actorCan } from '@/lib/server-utils'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /print/mlc/:id/ar          — the register sheet, three marked copies
 * GET /print/mlc/:id/intimation  — the letter carried to the police station
 *
 * Gated and audited, unlike the ER case sheet beside it. An accident register
 * holds the names of assault and sexual-assault victims and says what was done
 * to them; a printed copy leaves the building. Who printed it, and when, is
 * part of what the hospital may later have to account for.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; sheet: string }> },
) {
  const { id, sheet } = await params
  if (sheet !== 'ar' && sheet !== 'intimation') {
    return new Response('Not found', { status: 404 })
  }

  const actor = await getActorProfile()
  if (!(await actorCan('emergency:read'))) {
    return new Response('Not permitted', { status: 403 })
  }

  const supabase = await createClient()
  const { data: rec } = await supabase.from('mlc_records').select('*').eq('id', id).maybeSingle()
  if (!rec) return new Response('Register entry not found', { status: 404 })

  // The register sheet exists only once the entry is signed: an unsigned
  // opinion on hospital letterhead sitting in a police file is worse than no
  // sheet at all.
  //
  // The intimation is the opposite, and this caught a workflow inverted. The
  // real sequence in a casualty is: patient arrives, police are told, THEN the
  // examination is finished and the entry signed. Requiring a signature before
  // the letter could be printed — while the gate requires an intimation before
  // the entry can be signed — made the one duty that is immediate the last
  // thing the hospital could act on. So the letter prints from a draft, with
  // whatever is known so far, which is how it is actually carried across.
  if (sheet === 'ar' && rec.status === 'draft') {
    return new Response(
      'This entry is still a draft. Sign it first — an unsigned accident register sheet is not a document the hospital can issue. The intimation to the police can be printed now.',
      { status: 409 },
    )
  }

  const [profile, intimations, { data: options }, { data: adm }] = await Promise.all([
    getTenantProfile(),
    listPoliceIntimations(id),
    supabase.from('mlc_options').select('code, label'),
    rec.emergency_case_id
      ? supabase.from('admissions')
          .select('ip_no, ward:wards(name)')
          .eq('source_emergency_case_id', rec.emergency_case_id)
          .limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  // mlc_types and injury_natures live in different kinds but never share a
  // code, so one flat map resolves both.
  const labels: CodeLabels = Object.fromEntries(
    ((options ?? []) as Array<{ code: string; label: string }>).map((o) => [o.code, o.label]),
  )

  type AdmRow = { ip_no: string | null; ward: { name: string } | null }
  const a = adm as unknown as AdmRow | null
  const data = {
    ...(rec as unknown as MlcRecordData),
    admission: a ? { ip_no: a.ip_no, ward: a.ward?.name ?? null } : null,
  }

  const logo = await loadLogo(profile?.logo_url)
  const name = fileSafe(data.patient_name)

  await logAudit(actor.id, 'print', 'mlc_record', id, { sheet, ar_no: data.ar_no })

  if (sheet === 'intimation') {
    // The latest intimation addresses the letter. Where there is none the
    // station is left blank for the hospital to write in, because the paper
    // often goes out before the form is filled.
    const latest: PoliceIntimation | null = intimations.length
      ? intimations[intimations.length - 1]
      : null
    return renderPdfResponse(
      request,
      createElement(PoliceIntimationPdf, { data, labels, intimation: latest, profile, logo }),
      `Police-intimation_${data.ar_no.replace(/\//g, '-')}_${name}.pdf`,
    )
  }

  return renderPdfResponse(
    request,
    createElement(AccidentRegisterPdf, { data, labels, intimations, profile, logo }),
    `Accident-register_${data.ar_no.replace(/\//g, '-')}_${name}.pdf`,
  )
}
