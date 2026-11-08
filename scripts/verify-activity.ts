/**
 * The activity log in plain words (src/lib/activity.ts).
 *
 *   npm run verify:activity
 *
 * The rules that matter: every kind of entry the live database holds reads as
 * words, never a code; a phone number or email in an entry is never shown; and
 * looking at a legal register is flagged.
 */

import { describeActivity, areaOf, isSensitiveView, activityLink, ACTIVITY_AREAS } from '../src/lib/activity'

let failed = 0
function check(ok: boolean, label: string, detail?: unknown) {
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? `  — ${JSON.stringify(detail)}` : ''}`)
}

// Every entity/action pair in the live audit_logs on 2026-11-08.
const LIVE_PAIRS: string[] = ["admission_advance/collect_advance_deposit","admission_advance/record","admission/admit","admission/advance_deposit_created","admission/critical_care","admission/delivery","admission/delivery_update","admission/discharge","admission/fluid_balance","admission/ipd_daily_catch_up","admission/note","admission/partograph","admission/partograph_delete","admission/post_op_transfer","admission/postpartum_check","admission/sign_declaration","advance_percentage/update","analyzer_mapping/update","analyzer_message/update","anc_record/anc_care","anc_record/anc_care_undo","anc_record/anc_visit","anc_record/create","anc_record/update","appointment/cancel","appointment/check_in","appointment/create","auth/login_success","auth/password_changed","barcode_sample/print","barcode_wristband/print","bill/apply_advance","bill/discount","bill/finalize","bill/generate","bill/gst_edit","bill/payment","bill/payment_group","bill/refund","billing_settings/update","blood_request/raise_request","care_plan/add","care_team/add","cash_register/shift_close","connector/create","connector/update","cost_estimate/create","cost_estimate/delete","cost_estimate/finalize","dental_chart/update","department/create","department/update","doctor_availability/set","doctor_visit/complete_visit","doctor_visit/log_visit","doctor_visit/request_consult","drug_batch/update","drug/add_batch","drug/create_bulk","drug/dispense","drug/update","duty_roster/roster_publish","duty_roster/roster_set","emergency_case/add_charge","emergency_case/admit_from_emergency","emergency_case/attend","emergency_case/flag_mlc","emergency_case/register","emergency_case/remove_charge","emergency_case/visit","follow_up/cancel","follow_up/convert","follow_up/create","form_f/create","form_f/read","insurance_claim/add_enhancement","insurance_claim/advance","insurance_claim/appeal","insurance_claim/eligibility_approved","insurance_claim/eligibility_rejected","insurance_claim/enhancement_approved","insurance_claim/set_owner","insurance_claim/settle","insurance_claim/start_claim","insurance_claim/update_eligibility_fields","insurance_claim/update_identifiers","insurance_policy/create","ipd_billing_config/update","ipd_medication_order/create","ipd_pharmacy_request/dispense","lab_order/collect","lab_order/create","lab_order/report","lab_order/results","lab_order/verify","lab_test/activate","lab_test/create","lab_test/update","leave/approved","leave/request","mlc_record/create","mlc_record/print","mlc_record/read","mlc_register/read","note_template/create","note_template/update","notification/send","nurse/assign","ot_room/create","ot_schedule/add_consumable","ot_schedule/cancel","ot_schedule/create","ot_schedule/notes","ot_schedule/status_completed","ot_schedule/status_in_progress","ot_team_member/create","patient_history/update","patient/create","patient/dosing_weight","patient/growth","patient/immunization","patient/immunization_deferred","patient/immunization_history","patient/immunization_history_review","patient/immunization_undo","patient/pediatric_profile","patient/register_newborn","patient/update","patient/vaccine_dispense","pharmacy_bill/generate","pharmacy_sale/create","pharmacy_sale/finalize","pharmacy_sale/fulfill","pharmacy/product_code_teach","pharmacy/receive_stock","prescription/dose_override","procedure_tariff/create","procedure_tariff/delete","procedure_tariff/update","radiology_catalog/update","radiology_order/create","radiology_order/perform","radiology_order/report","radiology_test/create","radiology_test/update","referral/refer_out","referral/update","role_access/grant","role_access/revoke","roster_pattern/set_members","shift_definition/update","staff/attendance","staff/create","staff/deactivate","staff/reactivate","staff/resend_credentials","staff/update","staff/update_email","tenant_code/update","tenant_directory/update","tenant_modules/update","tenant_profile/update","tenant/create","tenant/vaccine_free_supply","tenant/vaccine_product","tenant/vaccine_product_add","tenant/vaccine_product_remove","vaccine_daily_warn_limit/update","visit_clinical_data/update","visit_consultation/update","visit_examination/update","visit_vitals/update","visit/close","visit/reopen","visit/start","ward_room_type_rate/update","ward_room_type/update","ward/add_beds","ward/create","ward/delete","ward/update"]

console.log(`\nEvery live kind of entry reads as words (${LIVE_PAIRS.length} kinds)`)
const codes: string[] = []
for (const p of LIVE_PAIRS) {
  const [entity, action] = p.split('/')
  const t = describeActivity({ entity, action, entity_id: null, meta: {} })
  if (!t || /_/.test(t) || /undefined|null|NaN/.test(t)) codes.push(`${p} → ${t}`)
}
check(codes.length === 0, 'no underscores, no "undefined", never empty', codes.slice(0, 5))
check(ACTIVITY_AREAS.some((a) => a.key === areaOf('something_new')), 'an unknown entity still lands in an area')

console.log('\nSentences')
const say = (entity: string, action: string, meta: Record<string, unknown> = {}, refs = {}) => describeActivity({ entity, action, entity_id: null, meta }, refs)
check(say('bill', 'payment', { amount: 500, method: 'upi' }, { bill: 'UDH/B2627/00106' }) === 'Took ₹500 by UPI on bill UDH/B2627/00106', 'payment', say('bill', 'payment', { amount: 500, method: 'upi' }, { bill: 'UDH/B2627/00106' }))
check(say('bill', 'payment_group', { amount: 400, method: 'cash', allocated: [{}, {}] }) === 'Took ₹400 by cash across 2 bills', 'one payment over several bills')
check(say('role_access', 'grant', { role: 'lab_tech', access_group: 'billing' }) === 'Gave Lab technician access to Billing & cash book', 'access granted')
check(say('drug', 'dispense', { qty: 4, reason: 'pain' }, { patient: 'Divya (UH-10)' }) === 'Dispensed 4 units to Divya (UH-10) — reason: pain', 'dispense with an X reason')
check(say('bill', 'payment', { amount: 1234567.5, method: 'cash' }).includes('₹12,34,567.5'), 'Indian digit grouping')
const reg = say('patient', 'create', { full_name: 'Ravi Kumar', uhid: 'KMCH-UH-2026-00001', phone: '+919739784611', email: 'x@y.com' })
check(reg === 'Registered patient Ravi Kumar (KMCH-UH-2026-00001)', 'patient registered', reg)
check(!/9739784611|@/.test(reg), 'phone and email are never shown')
const staff = say('staff', 'create', { role: 'lab_tech', email: 'someone@gmail.com' })
check(!/@/.test(staff) && staff.includes('Lab technician'), 'staff added — role shown, email not', staff)
check(say('visit', 'start', {}, { patient: 'Ravi (UH-1)' }) === 'Started a consultation for Ravi (UH-1)', 'names fill in where known')
check(say('visit', 'start') === 'Started a consultation', 'and read naturally where not')
check(say('bill', 'payment') === 'Took a payment' && say('drug', 'dispense') === 'Dispensed medicine' && say('cash_register', 'shift_close') === 'Closed the cash shift', 'an entry missing its amount still reads as a sentence')

console.log('\nRegisters and links')
check(isSensitiveView('mlc_register', 'read') && isSensitiveView('form_f', 'read'), 'viewing MLC / Form F is flagged')
check(!isSensitiveView('mlc_record', 'create') && !isSensitiveView('patient', 'read'), 'writing, or other reads, are not')
check(activityLink({ entity: 'bill', action: 'payment', entity_id: 'b1', meta: null }) === '/billing/b1', 'a bill links to the bill')
check(activityLink({ entity: 'role_access', action: 'grant', entity_id: 't1', meta: null }) === null, 'no link where there is no page')

console.log(failed ? `\n${failed} FAILED\n` : '\nEvery entry reads as a sentence.\n')
process.exit(failed ? 1 : 0)
