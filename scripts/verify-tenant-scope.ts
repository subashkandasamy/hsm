/**
 * verify:tenant-scope — a forgotten tenant filter on a service-role query.
 *
 * The service-role client BYPASSES Row-Level Security. Any query it runs
 * against a tenant-owned table must therefore filter by tenant_id in code, or
 * it silently reads and writes across hospitals with nothing to catch it.
 *
 * src/lib/supabase/tenant-scope.ts was written to prevent exactly this and has
 * never been called once; all 182 service-role queries do it by hand. Reading
 * every one of them found a single real defect (resolvePortalConsultFee, which
 * read `tariffs` with no tenant filter). Rewriting 182 correct call sites to
 * adopt the helpers would be churn with real regression risk and no security
 * gain — so instead this locks in the result of that review: every query that
 * does not filter by tenant_id must be listed below with a reason, and anything
 * new fails.
 *
 * The same code is safe with the user client and unsafe with the service one.
 * appointments.ts:32 and patientPortal.ts:742 read the identical tariff row;
 * only the second needed fixing, because only the second bypasses RLS.
 *
 * Run: npm run verify:tenant-scope
 *
 * To refresh TENANT_OWNED after a migration adds a table:
 *   select string_agg(table_name, ',' order by table_name)
 *     from information_schema.columns
 *    where table_schema='public' and column_name='tenant_id';
 * (partitions are excluded — code never queries one directly)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const TENANT_OWNED = new Set([
  'admission_advance_refunds', 'admission_advances', 'admission_care_team',
  'admission_nurse_assignments', 'admissions', 'advance_deposit_requests',
  'analyzer_mappings', 'analyzer_messages', 'anc_care_items',
  'anc_records', 'anc_referrals_out', 'anc_visits',
  'appointment_token_counter', 'appointments', 'audit_logs',
  'auth_otp_codes', 'beds', 'bill_items', 'bill_no_seq', 'bills',
  'blood_component_charges', 'blood_crossmatches', 'blood_donation_camps',
  'blood_donors', 'blood_issues', 'blood_requests',
  'blood_transfusion_reactions', 'blood_transfusions', 'blood_units',
  'cash_shift_closes', 'connectors', 'cost_estimate_items',
  'cost_estimates', 'credit_no_seq', 'credit_notes', 'deliveries',
  'delivery_babies', 'dental_recalls', 'dental_treatments', 'departments',
  'device_push_tokens', 'discount_limits', 'discount_requests',
  'dispenses', 'doctor_availability', 'doctor_visits', 'drug_batches',
  'drugs', 'duty_roster', 'emergency_cases', 'estimate_no_seq',
  'follow_ups', 'form_f_records', 'form_f_seq', 'h1_register',
  'icu_fluid_balance', 'icu_observations', 'icu_stays',
  'insurance_bank_accounts', 'insurance_claim_checklist',
  'insurance_claim_deductions', 'insurance_claim_enhancements',
  'insurance_claim_notes', 'insurance_claims', 'insurance_policies',
  'insurance_providers', 'insurance_remittance_batches',
  'insurance_tariff_packages', 'insurance_tpas', 'inventory_batches',
  'inventory_items', 'ip_no_seq', 'ipd_admin_schedule',
  'ipd_billing_blocked_days', 'ipd_billing_config', 'ipd_custom_charges',
  'ipd_declarations', 'ipd_medication_orders', 'ipd_pharmacy_requests',
  'ipd_progress_notes', 'lab_accession_seq', 'lab_analyzers',
  'lab_critical_notifications', 'lab_order_items', 'lab_orders',
  'lab_reference_ranges', 'lab_referral_labs', 'lab_result_analytes',
  'lab_sample_items', 'lab_samples', 'lab_tests_catalog', 'leave_requests',
  'ledger_mappings', 'mlc_police_intimations', 'mlc_records', 'mlc_seq',
  'mtp_records', 'mtp_seq', 'mtp_tracked_drugs', 'note_templates',
  'notification_templates', 'notifications', 'nursing_care_plans',
  'nursing_handovers', 'nursing_units', 'ot_consumables', 'ot_rooms',
  'ot_schedules', 'partners', 'partograph_obs', 'patient_allergies',
  'patient_children', 'patient_dental_chart', 'patient_documents',
  'patient_history', 'patient_immunization_deferrals',
  'patient_immunizations', 'patient_problems', 'patients', 'payments',
  'pediatric_growth', 'pediatric_profiles', 'pharmacy_sale_items',
  'pharmacy_sales', 'po_items', 'po_no_seq', 'postpartum_obs',
  'prescriptions', 'procedure_tariffs', 'product_codes', 'profiles',
  'purchase_orders', 'radiology_accession_seq', 'radiology_catalog',
  'radiology_modalities', 'radiology_orders', 'radiology_series',
  'radiology_studies', 'referral_seq', 'referrals_out',
  'roster_pattern_members', 'roster_patterns', 'shift_definitions',
  'staff_attendance', 'staff_profiles', 'stock_movements',
  'stock_receipts', 'subscriptions', 'summary_no_seq', 'suppliers',
  'tariffs', 'tenant_profiles', 'uhid_counter', 'vaccine_products',
  'vaccine_settings', 'visits', 'ward_coverage_rules', 'ward_incharges',
  'ward_room_types', 'wards'
])

/**
 * Service-role queries that legitimately carry no tenant_id, each with the
 * reason it is safe. Keyed by `file::table` rather than line number so the list
 * survives edits. An entry that stops matching anything is reported too — a
 * stale exemption is how this check rots.
 */
const REVIEWED: Record<string, string> = {
  // These three read tenant_id in order to COMPARE it, which is why a filter
  // would be wrong. The first version of this script counted them safe for the
  // wrong reason — it treated `.select('tenant_id')` as a tenant filter.
  'src/app/actions/hr.ts::profiles':
    'reads the target row to compare its tenant with the actor\'s (the F-25 guard); filtering would hide a foreign row instead of refusing it',
  'src/app/actions/onboarding.ts::partners':
    'looked up by referral_code, which is cross-tenant by design; tenant_id is read to REJECT a self-referral',
  'src/app/api/webhooks/razorpay/route.ts::partners':
    'headless webhook, no session; reached via the tenant\'s own referred_by_partner_id, so the link is already tenant-anchored',
  'src/app/actions/devices.ts::analyzer_messages':
    'ownership proven through the USER client first (RLS), then the service role writes',
  'src/app/actions/onboarding.ts::departments':
    'tenant_id is set on every row of the inserted array',
  'src/app/actions/onboarding.ts::notification_templates':
    'tenant_id is set on every row of the inserted array',
  'src/app/actions/onboarding.ts::shift_definitions':
    'tenant_id is set on every row of the inserted array',
  'src/app/actions/partnerAuth.ts::partners':
    'a partner signing in to their own account, keyed by email or their own session',
  'src/app/actions/platform.ts::partners':
    'platform admin — cross-tenant by design, behind requirePlatformAdmin',
  'src/app/actions/seeds.ts::procedure_tariffs':
    'platform admin seeding the shared catalogue, behind requirePlatformAdmin',
  'src/app/actions/patients.ts::patients':
    'links the row this action just created; Aadhaar matching is cross-tenant by design (MPI)',
  'src/app/actions/patientPortal.ts::patients':
    'portal is cross-tenant by design; ownsPatient() proves the session owns the record first',
  'src/app/actions/patientPortal.ts::visits':
    'filtered by a patient_id already proven owned by the session',
  'src/app/actions/patientPortal.ts::lab_orders':
    'ownedOrderPatient() proves ownership before the re-fetch by id',
  'src/app/actions/patientPortal.ts::radiology_orders':
    'ownedOrderPatient() proves ownership before the re-fetch by id',
  'src/app/actions/patientPortal.ts::appointments':
    'keyed by a patient_id or doctor_id already resolved for this session',
  'src/app/api/device/lab/results/route.ts::connectors':
    'the connector was located by its own token hash',
  'src/app/api/device/ping/route.ts::connectors':
    'the connector was located by its own token hash',
  'src/app/api/device/ping/route.ts::lab_analyzers':
    'filtered by connector_id, and the connector came from its token hash',
  'src/app/api/device/ping/route.ts::analyzer_messages':
    'filtered by connector_id, and the connector came from its token hash',
  'src/app/api/device/viewer-key/route.ts::connectors':
    'the connector was located by its own token hash',
  'src/app/api/device/radiology/studies/route.ts::connectors':
    'the connector was located by its own token hash',
  'src/app/api/device/radiology/studies/route.ts::radiology_modalities':
    'id came from a lookup filtered on tenant_id',
  'src/app/api/device/radiology/studies/route.ts::radiology_studies':
    'id came from a lookup filtered on tenant_id',
  'src/app/api/device/radiology/studies/route.ts::radiology_orders':
    'order id came from an accession lookup filtered on tenant_id',
  'src/app/api/device/radiology/worklist/route.ts::connectors':
    'the connector was located by its own token hash',
  'src/app/api/device/radiology/worklist/route.ts::radiology_modalities':
    'id came from a lookup filtered on tenant_id',
  'src/app/api/webhooks/razorpay/route.ts::subscriptions':
    'keyed by the gateway\'s own globally unique subscription id',
  'src/lib/lab/ingest.ts::analyzer_messages':
    'message id was created by the caller with tenant_id set',
  'src/lib/lab/ingest.ts::lab_analyzers':
    'analyzer id came from a lookup filtered on tenant_id',
  'src/lib/lab/ingest.ts::analyzer_mappings':
    'filtered by an analyzer_id that came from a tenant-filtered lookup',
}

// Identifiers this codebase uses for a service-role (RLS-bypassing) client.
const START = /\b(service|svc|db|admin|serviceClient)\.from\(\s*['"]([a-z_]+)['"]/

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p)
  }
  return out
}

type Finding = { file: string; line: number; table: string; stmt: string }

const unfiltered: Finding[] = []
let scanned = 0

for (const file of walk('src')) {
  const src = readFileSync(file, 'utf8')
  // Only files that can actually obtain a service-role client.
  if (!src.includes('createServiceClient') && !src.includes('SERVICE_ROLE')) continue
  const lines = src.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = START.exec(lines[i])
    if (!m) continue
    const table = m[2]
    scanned++
    if (!TENANT_OWNED.has(table)) continue

    // Collect the whole chained statement, not just the first line.
    const chunk: string[] = []
    let depth = 0
    for (let j = i; j < Math.min(i + 25, lines.length); j++) {
      chunk.push(lines[j])
      depth += (lines[j].match(/\(/g) ?? []).length - (lines[j].match(/\)/g) ?? []).length
      if (j > i && depth <= 0) {
        const next = (lines[j + 1] ?? '').trim()
        if (!next.startsWith('.')) break
      }
    }
    const stmt = chunk.join('\n')
    // A mention of tenant_id is not a tenant filter. `.select('tenant_id')`
    // reads the column and scopes nothing — an earlier version of this script
    // counted that as safe, which is the exact mistake it exists to catch.
    // What counts: a filter on the column, or the column set in a written row.
    const scoped =
      /\.(eq|in|filter|neq|match|contains)\(\s*['"]tenant_id['"]/.test(stmt)
      || /\btenant_id\s*:/.test(stmt)
      || /tenant_id\.eq\./.test(stmt)   // inside an .or() expression
    if (!scoped) {
      unfiltered.push({ file, line: i + 1, table, stmt })
    }
  }
}

const seen = new Set<string>()
const unreviewed: Finding[] = []
for (const f of unfiltered) {
  const key = `${f.file}::${f.table}`
  seen.add(key)
  if (!(key in REVIEWED)) unreviewed.push(f)
}
const stale = Object.keys(REVIEWED).filter((k) => !seen.has(k))

console.log(`service-role .from() calls scanned        : ${scanned}`)
console.log(`on tenant-owned tables, no tenant_id      : ${unfiltered.length}`)
console.log(`reviewed and allowed                      : ${unfiltered.length - unreviewed.length}`)
console.log(`NEW, unreviewed                           : ${unreviewed.length}`)

for (const f of unreviewed) {
  console.log(`\nFAIL  ${f.file}:${f.line}  [${f.table}]`)
  console.log(f.stmt.split('\n').slice(0, 4).map((l) => '      ' + l.trim()).join('\n'))
}
for (const k of stale) {
  console.log(`\nFAIL  stale exemption, nothing matches it any more: ${k}`)
  console.log('      Remove it from REVIEWED in scripts/verify-tenant-scope.ts')
}

if (unreviewed.length || stale.length) {
  console.log(`\n${unreviewed.length + stale.length} problem(s).`)
  console.log('A service-role query on a tenant-owned table must filter by tenant_id,')
  console.log('or be listed in REVIEWED with the reason it is safe.')
  process.exit(1)
}
console.log('\nall service-role queries are tenant-scoped or reviewed')
