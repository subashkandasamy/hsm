'use server'

import { createServiceBill } from '@/lib/billing/serviceBill'
import { createServiceClient } from '@/lib/supabase/service'
import { hospitalFileLink } from '@/lib/localFiles'
import { sendPatientPasswordEmail } from '@/lib/email'
import {
  normalizePhone, setPatientSession, clearPatientSession, getPatientSession,
  hashPassword, verifyPassword, makeResetToken, verifyResetToken,
} from '@/lib/patientAuth'
import { istToday, istDayStartISO, istDayEndISO, istAddDays, istWeekday } from '@/lib/istDate'
import { DOCTOR_FILTER } from '@/lib/doctors'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function maskPhone(p: string | null): string {
  const d = (p ?? '').replace(/\D/g, '')
  return d.length >= 4 ? '••••••' + d.slice(-4) : '••••'
}
function maskEmail(e: string | null): string {
  const [u, dom] = (e ?? '').split('@')
  if (!dom) return '•••'
  return (u?.[0] ?? '•') + '•••@' + dom
}

// Master Patient Index (family model): link each MEMBER's hospital records by
// Aadhaar (the reliable per-person key — a shared phone can't tell members
// apart). Only claims still-unlinked records. Self-healing — safe on every login.
async function linkPatientRecords(
  svc: ReturnType<typeof createServiceClient>,
  accountId: string,
): Promise<void> {
  const { data: members } = await svc
    .from('patient_members').select('id, aadhaar').eq('account_id', accountId)
  for (const m of (members ?? []) as Array<Record<string, unknown>>) {
    const aadhaar = m.aadhaar as string | null
    if (!aadhaar) continue
    const { data: rows } = await svc
      .from('patients').select('id').is('patient_member_id', null).eq('aadhaar_no', aadhaar)
    const ids = ((rows ?? []) as Array<Record<string, unknown>>).map((r) => r.id as string)
    if (ids.length) {
      await svc.from('patients')
        .update({ patient_member_id: m.id as string, patient_account_id: accountId })
        .in('id', ids)
    }
  }
}

// Returns masked login contact if this Aadhaar already belongs to another
// account's member (so the user can recognise their own other account).
async function aadhaarOwnedElsewhere(
  svc: ReturnType<typeof createServiceClient>,
  aadhaar: string,
  exceptAccountId?: string,
): Promise<{ phone: string; email: string } | null> {
  const { data: m } = await svc
    .from('patient_members').select('account_id').eq('aadhaar', aadhaar).maybeSingle()
  if (!m) return null
  if (exceptAccountId && m.account_id === exceptAccountId) return null
  const { data: acct } = await svc
    .from('patient_accounts').select('phone, email').eq('id', m.account_id as string).maybeSingle()
  return { phone: maskPhone(acct?.phone as string | null), email: maskEmail(acct?.email as string | null) }
}

function portalResetUrl(token: string): string {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'uyirly.com'
  const base = process.env.NEXT_PUBLIC_APP_URL ?? `https://my.${root}`
  return `${base}/portal/reset?token=${encodeURIComponent(token)}`
}

// ── Register a new patient portal account (self-service) ──────────────────────
export async function registerPatient(input: {
  full_name: string; email: string; phone: string; password: string; aadhaar?: string | null
}): Promise<{ success: true } | { success: false; error: string }> {
  const full_name = (input.full_name ?? '').trim()
  const email = (input.email ?? '').trim().toLowerCase()
  const phone = normalizePhone(input.phone ?? '')
  const password = input.password ?? ''
  const aadhaar = (input.aadhaar ?? '').replace(/\D/g, '') || null

  if (!full_name) return { success: false, error: 'Enter your full name' }
  if (!EMAIL_RE.test(email)) return { success: false, error: 'Enter a valid email address' }
  if (!phone) return { success: false, error: 'Enter a valid mobile number' }
  if (password.length < 8) return { success: false, error: 'Password must be at least 8 characters' }
  if (!aadhaar || aadhaar.length !== 12) return { success: false, error: 'Enter your 12-digit Aadhaar number' }

  const svc = createServiceClient()
  // The login is identified by email or phone.
  const { data: byEmail } = await svc.from('patient_accounts').select('id').ilike('email', email).maybeSingle()
  if (byEmail) return { success: false, error: 'An account with this email already exists — please sign in.' }
  const { data: byPhone } = await svc.from('patient_accounts').select('id').eq('phone', phone).maybeSingle()
  if (byPhone) return { success: false, error: 'An account with this mobile number already exists — please sign in or reset your password.' }
  // Aadhaar identifies the PERSON — must not already exist under another account.
  const conflict = await aadhaarOwnedElsewhere(svc, aadhaar)
  if (conflict) return { success: false, error: `This Aadhaar is already registered with mobile ${conflict.phone} and email ${conflict.email}. Please sign in with that account.` }

  const { data: created, error } = await svc
    .from('patient_accounts')
    .insert({ full_name, email, phone, aadhaar, password_hash: hashPassword(password), last_login_at: new Date().toISOString() })
    .select('id').single()
  if (error || !created) return { success: false, error: error?.message ?? 'Could not create account' }

  // The registrant is the first (self) member of the family.
  await svc.from('patient_members').insert({
    account_id: created.id as string, full_name, aadhaar, is_self: true, relationship: 'self',
  })
  // Link any existing hospital records (by member Aadhaar) to this account.
  await linkPatientRecords(svc, created.id as string)
  await setPatientSession(created.id as string, phone)
  return { success: true }
}

// ── Login with email + password ───────────────────────────────────────────────
export async function loginPatient(input: {
  email: string; password: string
}): Promise<{ success: true } | { success: false; error: string }> {
  const email = (input.email ?? '').trim().toLowerCase()
  const password = input.password ?? ''
  if (!EMAIL_RE.test(email) || !password) return { success: false, error: 'Enter your email and password' }

  const svc = createServiceClient()
  const { data: acct } = await svc
    .from('patient_accounts')
    .select('id, phone, password_hash')
    .ilike('email', email)
    .maybeSingle()
  if (!acct || !verifyPassword(password, acct.password_hash as string | null)) {
    return { success: false, error: 'Incorrect email or password' }
  }
  await svc.from('patient_accounts').update({ last_login_at: new Date().toISOString() }).eq('id', acct.id as string)
  await linkPatientRecords(svc, acct.id as string)
  await setPatientSession(acct.id as string, (acct.phone as string) ?? '')
  return { success: true }
}

// ── Forgot / reset password (delivered via Resend) ────────────────────────────
export async function requestPatientPasswordReset(emailRaw: string): Promise<{ success: true }> {
  const email = (emailRaw ?? '').trim().toLowerCase()
  if (EMAIL_RE.test(email)) {
    const svc = createServiceClient()
    const { data: acct } = await svc.from('patient_accounts').select('id, full_name').ilike('email', email).maybeSingle()
    if (acct) {
      const link = portalResetUrl(makeResetToken(acct.id as string))
      await sendPatientPasswordEmail(email, (acct.full_name as string) ?? '', link)
    }
  }
  // Always succeed — never reveal whether an account exists.
  return { success: true }
}

export async function setPatientPassword(
  token: string, newPassword: string,
): Promise<{ success: true } | { success: false; error: string }> {
  if ((newPassword ?? '').length < 8) return { success: false, error: 'Password must be at least 8 characters' }
  const accountId = verifyResetToken(token)
  if (!accountId) return { success: false, error: 'This reset link is invalid or has expired.' }

  const svc = createServiceClient()
  const { data: acct } = await svc.from('patient_accounts').select('id, phone').eq('id', accountId).maybeSingle()
  if (!acct) return { success: false, error: 'Account not found' }
  await svc.from('patient_accounts').update({ password_hash: hashPassword(newPassword) }).eq('id', accountId)
  await setPatientSession(accountId, (acct.phone as string) ?? '')
  return { success: true }
}

export async function signOutPatient(): Promise<void> {
  await clearPatientSession()
}

// ── Family members ────────────────────────────────────────────────────────────
export interface PatientMemberView {
  id: string; full_name: string; relationship: string | null; is_self: boolean
  aadhaar_masked: string | null; dob: string | null; gender: string | null
}

function maskAadhaar(a: string | null): string | null {
  if (!a) return null
  return 'XXXX-XXXX-' + a.slice(-4)
}

export async function listMembers(): Promise<PatientMemberView[]> {
  const session = await getPatientSession()
  if (!session) return []
  const svc = createServiceClient()
  const { data } = await svc
    .from('patient_members')
    .select('id, full_name, relationship, is_self, aadhaar, dob, gender')
    .eq('account_id', session.accountId)
    .order('is_self', { ascending: false })
    .order('created_at', { ascending: true })
  return ((data ?? []) as Array<Record<string, unknown>>).map((m) => ({
    id: m.id as string,
    full_name: m.full_name as string,
    relationship: (m.relationship as string | null) ?? null,
    is_self: !!m.is_self,
    aadhaar_masked: maskAadhaar(m.aadhaar as string | null),
    dob: (m.dob as string | null) ?? null,
    gender: (m.gender as string | null) ?? null,
  }))
}

export async function addFamilyMember(input: {
  full_name: string; aadhaar: string; relationship?: string | null; dob?: string | null; gender?: string | null
}): Promise<{ success: true; memberId: string } | { success: false; error: string }> {
  const session = await getPatientSession()
  if (!session) return { success: false, error: 'Please log in again' }
  const full_name = (input.full_name ?? '').trim()
  const aadhaar = (input.aadhaar ?? '').replace(/\D/g, '')
  if (!full_name) return { success: false, error: "Enter the family member's name" }
  if (aadhaar.length !== 12) return { success: false, error: 'Enter a valid 12-digit Aadhaar number' }

  const svc = createServiceClient()
  const conflict = await aadhaarOwnedElsewhere(svc, aadhaar, session.accountId)
  if (conflict) return { success: false, error: `This Aadhaar is already registered with mobile ${conflict.phone} and email ${conflict.email}. It can't be added here.` }
  // Already in this family?
  const { data: mine } = await svc.from('patient_members').select('id').eq('account_id', session.accountId).eq('aadhaar', aadhaar).maybeSingle()
  if (mine) return { success: false, error: 'This family member is already added.' }

  const { data: created, error } = await svc.from('patient_members').insert({
    account_id: session.accountId, full_name, aadhaar,
    relationship: input.relationship?.trim() || 'other',
    dob: input.dob || null, gender: input.gender || null, is_self: false,
  }).select('id').single()
  if (error || !created) return { success: false, error: error?.message ?? 'Could not add member' }

  await linkPatientRecords(svc, session.accountId)
  return { success: true, memberId: created.id as string }
}

export async function removeFamilyMember(memberId: string): Promise<{ success: true } | { success: false; error: string }> {
  const session = await getPatientSession()
  if (!session) return { success: false, error: 'Please log in again' }
  const svc = createServiceClient()
  const { data: m } = await svc.from('patient_members').select('account_id, is_self').eq('id', memberId).maybeSingle()
  if (!m || m.account_id !== session.accountId) return { success: false, error: 'Member not found' }
  if (m.is_self) return { success: false, error: 'You cannot remove the primary account holder.' }
  // Unlink their hospital records but keep the clinical rows intact.
  await svc.from('patients').update({ patient_member_id: null }).eq('patient_member_id', memberId)
  await svc.from('patient_members').delete().eq('id', memberId)
  return { success: true }
}

// ── "My hospitals" — every hospital record across the family, tagged by member ──
export interface MyHospital {
  tenant_id: string
  hospital: string
  patient_id: string
  patient_name: string
  uhid: string
  member_id: string | null
}

export async function getMyHospitals(): Promise<MyHospital[]> {
  const session = await getPatientSession()
  if (!session) return []
  const svc = createServiceClient()

  // Self-heal: claim any matching records, then read all the family's records.
  await linkPatientRecords(svc, session.accountId)
  const { data } = await svc
    .from('patients')
    .select('id, full_name, uhid, tenant_id, patient_member_id, tenant:tenants(name)')
    .eq('patient_account_id', session.accountId)

  return ((data ?? []) as Array<Record<string, unknown>>).map((p) => ({
    tenant_id: p.tenant_id as string,
    hospital: (p.tenant as { name?: string } | null)?.name ?? 'Hospital',
    patient_id: p.id as string,
    patient_name: p.full_name as string,
    uhid: p.uhid as string,
    member_id: (p.patient_member_id as string | null) ?? null,
  }))
}

export async function getPatientMe(): Promise<{ accountId: string; phone: string } | null> {
  return getPatientSession()
}

// ── Records at one hospital (Phase 2) ─────────────────────────────────────────
export interface PatientRecords {
  hospital: string
  patientName: string
  uhid: string
  visits: Array<{
    id: string; date: string; doctor: string; type: string
    complaint: string | null; diagnosis: string | null; notes: string | null
    prescriptions: Array<{ drug: string; dosage: string | null; frequency: string | null; duration: string | null; instructions: string | null }>
  }>
  labs: Array<{ id: string; date: string; status: string; items: Array<{ test: string; result: string | null; unit: string | null; reference: string | null; flag: string }> }>
  radiology: Array<{ id: string; date: string; status: string; test: string; report: string | null; hasImage: boolean }>
}

// Confirm this patient_id belongs to the logged-in phone (prevents enumeration).
async function ownsPatient(svc: ReturnType<typeof createServiceClient>, patientId: string, session: { accountId: string; phone: string }): Promise<{ name: string; uhid: string; tenant: string; tenantId: string } | null> {
  const { data } = await svc
    .from('patients')
    .select('phone, patient_account_id, full_name, uhid, tenant_id, tenant:tenants(name)')
    .eq('id', patientId).maybeSingle()
  if (!data) return null
  // Owned if linked to this master account (MPI) or the phone matches.
  const linked = (data.patient_account_id as string | null) === session.accountId
  const phoneMatch = normalizePhone(data.phone as string) === session.phone
  if (!linked && !phoneMatch) return null
  return {
    name: data.full_name as string, uhid: data.uhid as string,
    tenant: (data.tenant as { name?: string } | null)?.name ?? 'Hospital',
    tenantId: data.tenant_id as string,
  }
}

/** One analyte row as get_lab_report_analytes returns it. */
interface PortalAnalyte {
  test_id: string; test_name: string
  name: string; short_name: string | null
  unit_ucum: string | null; decimals: number | null
  value_num: number | null; value_text: string | null
  ref_low: number | null; ref_high: number | null; flag: string
}

function portalAnalyteRow(a: PortalAnalyte) {
  const reference = a.ref_low != null && a.ref_high != null ? `${a.ref_low} – ${a.ref_high}`
    : a.ref_high != null ? `< ${a.ref_high}`
    : a.ref_low != null ? `> ${a.ref_low}`
    : null
  return {
    // Named for the measurement, prefixed by the panel it came out of, so a
    // patient reading "Haemoglobin" knows which report it belongs to.
    test: `${a.test_name} · ${a.short_name ?? a.name}`,
    result: a.value_text ?? (a.value_num != null ? a.value_num.toFixed(a.decimals ?? 0) : null),
    unit: a.unit_ucum,
    reference,
    flag: a.flag,
  }
}

export async function getPatientHospitalRecords(patientId: string): Promise<PatientRecords | null> {
  const session = await getPatientSession()
  if (!session) return null
  const svc = createServiceClient()
  const owner = await ownsPatient(svc, patientId, session)
  if (!owner) return null

  const [visitsRes, labRes, radRes] = await Promise.all([
    svc.from('visits')
      .select('id, type, visit_date, complaint, diagnosis, notes, doctor:profiles(full_name)')
      .eq('patient_id', patientId).order('visit_date', { ascending: false }),
    // Only released results. Without this filter a patient could read an order
    // that was still being worked on — a half-entered panel, or an unverified
    // one — which is neither finished nor anybody's intention to publish.
    svc.from('lab_orders')
      .select('id, status, ordered_at, reported_at, items:lab_order_items(test_id, result_value, result_text, unit, flag, test:lab_tests_catalog(name, unit, reference_range))')
      .eq('patient_id', patientId).eq('status', 'reported').order('ordered_at', { ascending: false }),
    svc.from('radiology_orders')
      .select('id, status, ordered_at, reported_at, report, image_url, test:radiology_catalog(name)')
      .eq('patient_id', patientId).eq('status', 'reported').order('ordered_at', { ascending: false }),
  ])

  // The analyte values behind every released order, in the order the printed
  // report uses. Same RPC the PDF calls, so the two can never disagree.
  const labIds = ((labRes.data ?? []) as Array<Record<string, unknown>>).map((l) => l.id as string)
  const analytesByOrder = new Map<string, PortalAnalyte[]>()
  if (labIds.length) {
    const fetched = await Promise.all(
      labIds.map(async (id) => {
        const { data } = await svc.rpc('get_lab_report_analytes', { p_order_id: id })
        return [id, (data ?? []) as PortalAnalyte[]] as const
      }),
    )
    for (const [id, rows] of fetched) analytesByOrder.set(id, rows)
  }

  const visits = (visitsRes.data ?? []) as Array<Record<string, unknown>>
  const visitIds = visits.map((v) => v.id as string)
  const rxByVisit = new Map<string, PatientRecords['visits'][number]['prescriptions']>()
  if (visitIds.length) {
    const { data: rx } = await svc
      .from('prescriptions')
      .select('visit_id, drug_name, dosage, frequency, duration, instructions')
      .in('visit_id', visitIds)
    for (const r of (rx ?? []) as Array<Record<string, unknown>>) {
      const vid = r.visit_id as string
      if (!rxByVisit.has(vid)) rxByVisit.set(vid, [])
      rxByVisit.get(vid)!.push({
        drug: r.drug_name as string, dosage: r.dosage as string | null,
        frequency: r.frequency as string | null, duration: r.duration as string | null,
        instructions: r.instructions as string | null,
      })
    }
  }

  return {
    hospital: owner.tenant, patientName: owner.name, uhid: owner.uhid,
    visits: visits.map((v) => ({
      id: v.id as string,
      date: v.visit_date as string,
      doctor: (v.doctor as { full_name?: string } | null)?.full_name ?? '—',
      type: v.type as string,
      complaint: v.complaint as string | null,
      diagnosis: v.diagnosis as string | null,
      notes: v.notes as string | null,
      prescriptions: rxByVisit.get(v.id as string) ?? [],
    })),
    labs: ((labRes.data ?? []) as Array<Record<string, unknown>>).map((l) => {
      const orderId = l.id as string
      const panelRows = analytesByOrder.get(orderId) ?? []
      const panelTestIds = new Set(panelRows.map((a) => a.test_id))

      // A panel's values are in lab_result_analytes; its lab_order_items row
      // stays empty. Reading only the item showed a released CBC as a single
      // blank line, and hid the download button with it — the patient was told
      // their report was ready and shown nothing.
      const singles = ((l.items ?? []) as Array<Record<string, unknown>>)
        .filter((it) => !panelTestIds.has(it.test_id as string))
        .map((it) => {
          const t = it.test as { name?: string; unit?: string | null; reference_range?: string | null } | null
          return {
            test: t?.name ?? 'Test',
            result: (it.result_text as string | null) ?? (it.result_value != null ? String(it.result_value) : null),
            unit: (it.unit as string | null) ?? (t?.unit ?? null),
            reference: t?.reference_range ?? null,
            flag: it.flag as string,
          }
        })

      return {
        id: orderId,
        date: (l.reported_at ?? l.ordered_at) as string,
        status: l.status as string,
        items: [...panelRows.map(portalAnalyteRow), ...singles],
      }
    }),
    radiology: ((radRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      date: (r.reported_at ?? r.ordered_at) as string,
      status: r.status as string,
      test: (r.test as { name?: string } | null)?.name ?? 'Study',
      report: r.report as string | null,
      hasImage: !!(r.image_url as string | null),
    })),
  }
}

// ── Printable reports (patient-owned) ─────────────────────────────────────────
// The staff /print routes are behind dashboard auth; the portal needs its own
// ownership-verified fetchers that reuse the same presentational components.
const PORTAL_RADIOLOGY_BUCKET = 'radiology'
const PORTAL_SIGNED_URL_EXPIRY = 60 * 60 // 1 hour

// Load an order by id, then confirm the logged-in family owns its patient.
async function ownedOrderPatient(
  svc: ReturnType<typeof createServiceClient>,
  table: 'lab_orders' | 'radiology_orders',
  orderId: string,
): Promise<{ owner: { name: string; uhid: string; tenant: string; tenantId: string }; patientId: string } | null> {
  const session = await getPatientSession()
  if (!session) return null
  // Released orders only, checked here rather than at each call site — the list
  // is already filtered, so this is the guard against an id arriving some other
  // way. Every portal report and scan-image fetch goes through this function.
  const { data } = await svc.from(table)
    .select('patient_id, status').eq('id', orderId).eq('status', 'reported').maybeSingle()
  const patientId = (data?.patient_id as string | null) ?? null
  if (!patientId) return null
  const owner = await ownsPatient(svc, patientId, session)
  if (!owner) return null
  return { owner, patientId }
}

async function portalTenantProfile(svc: ReturnType<typeof createServiceClient>, tenantId: string) {
  const { data } = await svc.from('tenant_profiles').select('*').eq('tenant_id', tenantId).maybeSingle()
  return data ?? null
}

async function portalPatientDemographics(svc: ReturnType<typeof createServiceClient>, patientId: string) {
  const { data } = await svc.from('patients')
    .select('id, full_name, uhid, dob, gender, phone').eq('id', patientId).maybeSingle()
  return data ?? null
}

export async function getPortalLabReport(orderId: string): Promise<{
  order: unknown; patient: unknown; tenantProfile: unknown
} | null> {
  const svc = createServiceClient()
  const owned = await ownedOrderPatient(svc, 'lab_orders', orderId)
  if (!owned) return null
  const [{ data: order }, tenantProfile, patient] = await Promise.all([
    svc.from('lab_orders')
      .select('*, patient:patients(id,full_name,uhid), orderer:profiles!ordered_by(id,full_name), items:lab_order_items(*, test:lab_tests_catalog(*))')
      .eq('id', orderId).maybeSingle(),
    portalTenantProfile(svc, owned.owner.tenantId),
    portalPatientDemographics(svc, owned.patientId),
  ])
  if (!order) return null
  return { order, patient, tenantProfile }
}

export async function getPortalRadiologyReport(orderId: string): Promise<{
  order: unknown; patient: unknown; tenantProfile: unknown; imageUrl: string | null; imageIsPdf: boolean
  /** The image is kept at the hospital and its computer cannot be reached now. */
  imageUnavailable?: boolean
} | null> {
  const svc = createServiceClient()
  const owned = await ownedOrderPatient(svc, 'radiology_orders', orderId)
  if (!owned) return null
  const [{ data: order }, tenantProfile, patient] = await Promise.all([
    svc.from('radiology_orders')
      .select('*, patient:patients(id,full_name,uhid), test:radiology_catalog(*), orderer:profiles!ordered_by(id,full_name)')
      .eq('id', orderId).maybeSingle(),
    portalTenantProfile(svc, owned.owner.tenantId),
    portalPatientDemographics(svc, owned.patientId),
  ])
  if (!order) return null

  // Sign the scan image (same PHI-safe scheme as staff getRadiologyImageUrl).
  let imageUrl: string | null = null
  let imageIsPdf = false
  const stored = (order.image_url as string | null) ?? null
  if (stored) {
    imageIsPdf = stored.toLowerCase().split('?')[0].endsWith('.pdf')
    if (/^https?:\/\//i.test(stored)) {
      imageUrl = stored
    } else {
      const kept = await portalKeptImage(owned.owner.tenantId, stored)
      if (kept) return { order, patient, tenantProfile, imageUrl: kept.url, imageIsPdf, imageUnavailable: !kept.url }
      const { data } = await svc.storage.from(PORTAL_RADIOLOGY_BUCKET).createSignedUrl(stored, PORTAL_SIGNED_URL_EXPIRY)
      imageUrl = data?.signedUrl ?? null
    }
  }
  return { order, patient, tenantProfile, imageUrl, imageIsPdf }
}

/**
 * The analyte results behind a patient's lab report.
 *
 * Goes through ownedOrderPatient like every other portal fetch, so it inherits
 * both the ownership check and the 'reported' gate — a patient cannot reach the
 * twenty numbers of a CBC any earlier than they can reach the report itself.
 */
export async function getPortalLabAnalytes(orderId: string): Promise<unknown[]> {
  const svc = createServiceClient()
  const owned = await ownedOrderPatient(svc, 'lab_orders', orderId)
  if (!owned) return []
  const { data, error } = await svc.rpc('get_lab_report_analytes', { p_order_id: orderId })
  if (error) { console.error('[getPortalLabAnalytes]', error.message); return [] }
  return (data ?? []) as unknown[]
}

// Lightweight signed-URL fetch for inline scan viewing in the Scans tab.
export async function getPortalScanImageUrl(orderId: string): Promise<{ url: string | null; isPdf: boolean; unavailable?: boolean }> {
  const svc = createServiceClient()
  const owned = await ownedOrderPatient(svc, 'radiology_orders', orderId)
  if (!owned) return { url: null, isPdf: false }
  const { data: order } = await svc.from('radiology_orders').select('image_url').eq('id', orderId).maybeSingle()
  const stored = (order?.image_url as string | null) ?? null
  if (!stored) return { url: null, isPdf: false }
  const isPdf = stored.toLowerCase().split('?')[0].endsWith('.pdf')
  if (/^https?:\/\//i.test(stored)) return { url: stored, isPdf }
  const kept = await portalKeptImage(owned.owner.tenantId, stored)
  if (kept) return { url: kept.url, isPdf, unavailable: !kept.url }
  const { data } = await svc.storage.from(PORTAL_RADIOLOGY_BUCKET).createSignedUrl(stored, PORTAL_SIGNED_URL_EXPIRY)
  return { url: data?.signedUrl ?? null, isPdf }
}

/**
 * A radiology image the hospital keeps on its own computer (0275), as the
 * portal may show it: only through that computer's internet link — a patient
 * is never on the hospital network. Null when the image is still in the cloud;
 * `url: null` when it is kept at the hospital and cannot be reached right now
 * (the hospital chose no cloud copy, 9 Nov 2026).
 */
async function portalKeptImage(tenantId: string, stored: string): Promise<{ url: string | null } | null> {
  const kept = await hospitalFileLink(tenantId, 'radiology', stored, { embeddableOnly: true })
  return kept.state === 'computer' ? { url: kept.url } : null
}

// ── Appointments & requests at one hospital (Phase 4) ─────────────────────────
export interface PatientAppointment { id: string; date: string; status: string; doctor: string; reason: string | null }
export interface PatientRequest { id: string; source: string; suggestedDate: string | null; reason: string | null; status: string; doctor: string | null }
export interface HospitalDoctor { id: string; name: string }

export async function getPatientAppointments(patientId: string): Promise<PatientAppointment[]> {
  const session = await getPatientSession()
  if (!session) return []
  const svc = createServiceClient()
  if (!(await ownsPatient(svc, patientId, session))) return []
  const { data } = await svc
    .from('appointments')
    .select('id, scheduled_at, status, reason, doctor:profiles(full_name)')
    .eq('patient_id', patientId).order('scheduled_at', { ascending: false }).limit(50)
  return ((data ?? []) as Array<Record<string, unknown>>).map((a) => ({
    id: a.id as string, date: a.scheduled_at as string, status: a.status as string,
    doctor: (a.doctor as { full_name?: string } | null)?.full_name ?? '—',
    reason: a.reason as string | null,
  }))
}

// Pending follow-ups/requests for this patient — both doctor-recommended
// (source opd/ipd) and their own portal requests (source patient).
export async function getPatientRequests(patientId: string): Promise<PatientRequest[]> {
  const session = await getPatientSession()
  if (!session) return []
  const svc = createServiceClient()
  if (!(await ownsPatient(svc, patientId, session))) return []
  const { data } = await svc
    .from('follow_ups')
    .select('id, source, suggested_date, reason, status, suggested_doctor:profiles!suggested_doctor_id(full_name)')
    .eq('patient_id', patientId).eq('status', 'pending').order('created_at', { ascending: false })
  return ((data ?? []) as Array<Record<string, unknown>>).map((f) => ({
    id: f.id as string, source: f.source as string, suggestedDate: f.suggested_date as string | null,
    reason: f.reason as string | null, status: f.status as string,
    doctor: (f.suggested_doctor as { full_name?: string } | null)?.full_name ?? null,
  }))
}

export async function getHospitalDoctors(patientId: string): Promise<HospitalDoctor[]> {
  const session = await getPatientSession()
  if (!session) return []
  const svc = createServiceClient()
  const owner = await ownsPatient(svc, patientId, session)
  if (!owner) return []
  const { data } = await svc
    .from('profiles').select('id, full_name')
    .eq('tenant_id', owner.tenantId).or(DOCTOR_FILTER).eq('is_active', true).order('full_name')
  return ((data ?? []) as Array<Record<string, unknown>>).map((d) => ({ id: d.id as string, name: d.full_name as string }))
}

// Patient requests an appointment → a pending follow_up (source 'patient') that
// the hospital front desk confirms & converts. No auto-booked appointment/bill.
export async function requestPatientAppointment(
  patientId: string, input: { doctorId?: string | null; date: string; reason?: string | null },
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await getPatientSession()
  if (!session) return { success: false, error: 'Please log in again' }
  const svc = createServiceClient()
  const owner = await ownsPatient(svc, patientId, session)
  if (!owner) return { success: false, error: 'Record not found' }
  if (!input.date) return { success: false, error: 'Please pick a preferred date' }

  const { error } = await svc.from('follow_ups').insert({
    tenant_id: owner.tenantId,
    patient_id: patientId,
    source: 'patient',
    suggested_doctor_id: input.doctorId || null,
    suggested_date: input.date,
    reason: input.reason?.trim() || 'Appointment requested via patient portal',
    status: 'pending',
  })
  if (error) return { success: false, error: error.message }
  return { success: true }
}

// ── Doctor availability for booking (Phase #2/#3) ─────────────────────────────
export interface AvailableSession { label: string | null; start: string; end: string; tokenCap: number | null }
export interface AvailableDay { date: string; sessions: AvailableSession[] }

// Next `days` calendar days on which this doctor has an active OPD session.
export async function getDoctorAvailability(patientId: string, doctorId: string, days = 30): Promise<AvailableDay[]> {
  const session = await getPatientSession()
  if (!session) return []
  const svc = createServiceClient()
  const owner = await ownsPatient(svc, patientId, session)
  if (!owner) return []

  const { data } = await svc
    .from('doctor_availability')
    .select('day_of_week, start_time, end_time, label, token_cap')
    .eq('doctor_id', doctorId).eq('tenant_id', owner.tenantId).eq('is_active', true)
    .order('start_time')

  const byDow = new Map<number, AvailableSession[]>()
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    const dow = r.day_of_week as number
    if (!byDow.has(dow)) byDow.set(dow, [])
    byDow.get(dow)!.push({
      label: r.label as string | null,
      start: (r.start_time as string).slice(0, 5),
      end: (r.end_time as string).slice(0, 5),
      tokenCap: r.token_cap as number | null,
    })
  }

  const out: AvailableDay[] = []
  for (let i = 0; i < days; i++) {
    const date = istAddDays(istToday(), i)   // IST days — never offer "yesterday" before 05:30
    const s = byDow.get(istWeekday(date))
    if (s && s.length) out.push({ date, sessions: s })
  }
  return out
}

// ── Patient booking with token + live queue (Phase #3) ────────────────────────
export interface QueueStatus {
  token: number; date: string; doctor: string; status: string
  completed: number; ahead: number; total: number; estWaitMin: number
}

// Book a real OPD appointment (allocates a token). NOTE: we compute the token
// directly (max+1) rather than via get_next_appointment_token(), because that
// RPC relies on current_tenant_id() which is NULL under the service role. No
// bill is raised here — the hospital collects the consultation fee at check-in.
export async function bookPatientAppointment(
  patientId: string, doctorId: string, dateStr: string, startTime?: string,
): Promise<{ success: true; token: number } | { success: false; error: string }> {
  const session = await getPatientSession()
  if (!session) return { success: false, error: 'Please log in again' }
  const svc = createServiceClient()
  const owner = await ownsPatient(svc, patientId, session)
  if (!owner) return { success: false, error: 'Record not found' }
  const today = istToday()
  if (!dateStr || dateStr < today) return { success: false, error: 'Pick a future date' }

  // One active appointment per patient per day.
  const dayLo = istDayStartISO(dateStr), dayHi = istDayEndISO(dateStr)
  const { data: dup } = await svc.from('appointments').select('id')
    .eq('patient_id', patientId).gte('scheduled_at', dayLo).lte('scheduled_at', dayHi)
    .in('status', ['booked', 'checked_in']).limit(1)
  if (dup && dup.length) return { success: false, error: 'You already have an appointment on this date' }

  // Ensure the month partition exists (bookings can be a future month).
  await svc.rpc('ensure_appointment_partition', { p_date: dateStr })

  // Next token for this doctor+date (service-role safe).
  const { data: existing } = await svc.from('appointments').select('token_no')
    .eq('doctor_id', doctorId).gte('scheduled_at', dayLo).lte('scheduled_at', dayHi).neq('status', 'cancelled')
  const token = (existing ?? []).reduce((m, r) => Math.max(m, (r.token_no as number) ?? 0), 0) + 1

  const apptId = crypto.randomUUID()
  const { error } = await svc.from('appointments').insert({
    id: apptId, tenant_id: owner.tenantId, patient_id: patientId, doctor_id: doctorId,
    department_id: null, scheduled_at: `${dateStr}T${startTime ?? '10:00'}:00`,
    token_no: token, status: 'booked', reason: 'Booked via patient app',
  })
  if (error) return { success: false, error: error.message }

  // Raise the consultation bill (unpaid) at booking, like a staff booking does —
  // the fee is collected at the counter; a no-show auto-cancels this bill.
  const fee = await resolvePortalConsultFee(svc, owner.tenantId, doctorId)
  if (fee > 0) {
    const bill = await createServiceBill(svc, {
      tenantId: owner.tenantId, patientId, actorId: null, appointmentId: apptId,
      billSource: 'consultation',
      lines: [{ source: 'consultation', ref_id: apptId, description: 'Consultation fee', qty: 1, unit_price: fee }],
    })
    if ('error' in bill) console.error('[portal booking] consultation bill failed:', bill.error)
  }
  return { success: true, token }
}

// Consultation fee for a doctor (service-role): staff fee → tariff default → 300.
async function resolvePortalConsultFee(
  svc: ReturnType<typeof createServiceClient>, tenantId: string, doctorId: string,
): Promise<number> {
  const { data: sp } = await svc.from('staff_profiles')
    .select('consultation_fee').eq('profile_id', doctorId).eq('tenant_id', tenantId).maybeSingle()
  if (sp?.consultation_fee != null && (sp.consultation_fee as number) > 0) return sp.consultation_fee as number
  // tariffs is tenant-owned and this runs under the service role, so without the
  // tenant filter the fallback read whichever hospital's row it found first —
  // and with two hospitals holding the key, maybeSingle() errors and every
  // booking silently falls through to ₹300. The tenant is already a parameter.
  const { data: tariff } = await svc.from('tariffs')
    .select('amount').eq('tenant_id', tenantId)
    .eq('key', 'default_consultation_fee').maybeSingle()
  return (tariff?.amount as number) ?? 300
}

// Live queue status for one of the patient's appointments.
export async function getQueueStatus(patientId: string, appointmentId: string): Promise<QueueStatus | null> {
  const session = await getPatientSession()
  if (!session) return null
  const svc = createServiceClient()
  if (!(await ownsPatient(svc, patientId, session))) return null

  const { data: appt } = await svc.from('appointments')
    .select('doctor_id, scheduled_at, token_no, status, doctor:profiles(full_name)')
    .eq('id', appointmentId).eq('patient_id', patientId).maybeSingle()
  if (!appt) return null

  // The appointment stays "checked_in" while the doctor is actually consulting —
  // the live signal is the visit. Reflect it so the patient sees the right state.
  let effectiveStatus = appt.status as string
  if (effectiveStatus !== 'done' && effectiveStatus !== 'cancelled') {
    const { data: visit } = await svc.from('visits')
      .select('status').eq('appointment_id', appointmentId).maybeSingle()
    if (visit) effectiveStatus = (visit.status as string) === 'open' ? 'in_consultation' : 'done'
  }

  const dateStr = (appt.scheduled_at as string).split('T')[0]
  const myToken = (appt.token_no as number) ?? 0
  const { data: sameDay } = await svc.from('appointments')
    .select('token_no, status')
    .eq('doctor_id', appt.doctor_id as string)
    .gte('scheduled_at', istDayStartISO(dateStr)).lte('scheduled_at', istDayEndISO(dateStr))

  let completed = 0, ahead = 0, total = 0
  for (const a of (sameDay ?? []) as Array<Record<string, unknown>>) {
    const t = (a.token_no as number) ?? 0, st = a.status as string
    if (st === 'cancelled') continue
    total++
    if (t < myToken) {
      if (st === 'done') completed++
      else if (st === 'booked' || st === 'checked_in') ahead++
    }
  }
  return {
    token: myToken, date: dateStr, doctor: (appt.doctor as { full_name?: string } | null)?.full_name ?? '',
    status: effectiveStatus, completed, ahead, total, estWaitMin: ahead * 10,
  }
}

// ── Hospital directory (C) + self-registration (B) ────────────────────────────
export interface DirectoryHospital { tenantId: string; name: string; city: string | null; slug: string; patientId: string | null }

// Hospitals that have opted into the patient app directory. `patientId` is set
// when the logged-in phone already has a record there (so we can link straight
// to it instead of re-registering).
export async function listDirectoryHospitals(memberId: string, search?: string): Promise<DirectoryHospital[]> {
  const session = await getPatientSession()
  if (!session) return []
  const svc = createServiceClient()
  let q = svc.from('tenants')
    .select('id, name, city, slug')
    .eq('directory_listed', true).in('status', ['trial', 'active'])
    .order('name').limit(50)
  const s = search?.trim()
  if (s) q = q.or(`name.ilike.%${s}%,city.ilike.%${s}%`)
  const { data } = await q

  // Existing records for THIS member (so we link straight to them).
  const { data: mine } = await svc.from('patients')
    .select('id, tenant_id').eq('patient_member_id', memberId)
  const myByTenant = new Map<string, string>()
  for (const p of (mine ?? []) as Array<Record<string, unknown>>) {
    myByTenant.set(p.tenant_id as string, p.id as string)
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map((t) => ({
    tenantId: t.id as string, name: t.name as string, city: t.city as string | null,
    slug: t.slug as string, patientId: myByTenant.get(t.id as string) ?? null,
  }))
}

// Register a family member as a patient at a listed hospital (from their master
// profile). Flagged self_registered (unverified) until the front desk confirms.
export async function selfRegisterPatient(
  tenantId: string, memberId: string,
): Promise<{ success: true; patientId: string } | { success: false; error: string }> {
  const session = await getPatientSession()
  if (!session) return { success: false, error: 'Please log in again' }

  const svc = createServiceClient()
  const { data: member } = await svc
    .from('patient_members').select('id, account_id, full_name, aadhaar, dob, gender')
    .eq('id', memberId).maybeSingle()
  if (!member || member.account_id !== session.accountId) return { success: false, error: 'Family member not found' }

  const { data: t } = await svc.from('tenants').select('id, directory_listed, status').eq('id', tenantId).maybeSingle()
  if (!t || !(t.directory_listed as boolean) || !['trial', 'active'].includes(t.status as string))
    return { success: false, error: 'This hospital is not open for online registration' }

  // Already registered here for this member → reuse it.
  const { data: existing } = await svc.from('patients')
    .select('id').eq('tenant_id', tenantId).eq('patient_member_id', memberId).maybeSingle()
  if (existing) return { success: true, patientId: existing.id as string }

  const { data: uhid } = await svc.rpc('get_next_uhid_for', { p_tenant_id: tenantId })
  if (!uhid) return { success: false, error: 'Could not generate a UHID' }

  const id = crypto.randomUUID()
  const { error } = await svc.from('patients').insert({
    id, tenant_id: tenantId, uhid: uhid as string,
    full_name: member.full_name as string, phone: '+' + session.phone,
    gender: (member.gender as string | null) || null, dob: (member.dob as string | null) || null,
    aadhaar_no: (member.aadhaar as string | null) || null,
    self_registered: true,
    patient_account_id: session.accountId,
    patient_member_id: memberId,
  })
  if (error) return { success: false, error: error.message }
  return { success: true, patientId: id }
}
