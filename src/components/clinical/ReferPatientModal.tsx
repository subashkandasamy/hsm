'use client'

import { useEffect, useState } from 'react'
import { Printer, Send } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import {
  prepareReferral, createReferral, updateReferral, getReferral,
  type ReferralDraft, type ReferralSource,
} from '@/app/actions/referOut'

/**
 * Writing a referral letter.
 *
 * Used from casualty, from a ward and from a consultation, because all three
 * send patients on and all three send them on with the same letter. The
 * context only changes where the letter is filled in from.
 *
 * Almost everything arrives pre-filled. The doctor writing this is at the end
 * of something — a round, a shift, a resuscitation — and the two fields they
 * will definitely type are the destination and the reason. If the diagnosis and
 * the treatment given are not already on the page, they will not reach the
 * letter, and the receiving hospital starts the patient again from nothing.
 *
 * The pre-filled text stays editable and is shown rather than hidden: a
 * diagnosis silently copied from an admission reason onto somebody else's chart
 * is worse than a blank field.
 */
export default function ReferPatientModal({
  open, onClose, onSaved, patientId, visitId, admissionId, emergencyCaseId, source,
  referralId = null,
}: {
  open: boolean
  onClose: () => void
  onSaved?: (id: string) => void
  patientId: string
  visitId?: string | null
  admissionId?: string | null
  emergencyCaseId?: string | null
  source: ReferralSource
  /**
   * An existing letter to correct, rather than a new one to write.
   *
   * Everything comes back exactly as it was saved and the letter keeps its own
   * reference number. Issuing a second letter instead would leave two numbers
   * for one patient going to one hospital, and nobody able to say which one
   * they are holding.
   */
  referralId?: string | null
}) {
  const [draft, setDraft] = useState<ReferralDraft | null>(null)
  // Set when correcting a letter that has already been printed, so the page
  // can say it was revised rather than silently replacing what the patient
  // is carrying.
  const [printedAt, setPrintedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)

  // Destination
  const [toInstitution, setToInstitution] = useState('')
  const [toDoctor, setToDoctor] = useState('')
  const [toDepartment, setToDepartment] = useState('')
  const [toAddress, setToAddress] = useState('')
  const [reason, setReason] = useState('')

  // Clinical, pre-filled
  const [diagnosis, setDiagnosis] = useState('')
  const [investigations, setInvestigations] = useState('')
  const [treatment, setTreatment] = useState('')
  const [condition, setCondition] = useState('')
  const [vitals, setVitals] = useState('')

  // Getting there
  const [transport, setTransport] = useState('')
  const [accompaniedBy, setAccompaniedBy] = useState('')
  const [transportNote, setTransportNote] = useState('')

  // The signatory
  const [byName, setByName] = useState('')
  const [byQual, setByQual] = useState('')
  const [byRegNo, setByRegNo] = useState('')

  // Everything is set after the await, not in the effect body: the state this
  // modal opens with is what the server found, so there is nothing useful to
  // set synchronously and doing so only causes a cascading render.
  useEffect(() => {
    if (!open) return
    let live = true
    void (async () => {
      // Correcting one: everything comes back as it was saved.
      if (referralId) {
        const r = await getReferral(referralId)
        if (!live) return
        setLoading(false)
        if (!r) { setError('That letter no longer exists'); return }
        const str = (k: string) => (r[k] as string | null) ?? ''
        setDraft({
          patient_id: (r.patient_id as string) ?? patientId,
          patient_name: (r.patient_name as string | null) ?? null,
          patient_age: (r.patient_age as number | null) ?? null,
          patient_sex: (r.patient_sex as string | null) ?? null,
          address_text: (r.address_text as string | null) ?? null,
          contact_no: (r.contact_no as string | null) ?? null,
          mr_no: (r.mr_no as string | null) ?? null,
          op_no: (r.op_no as string | null) ?? null,
          ip_no: (r.ip_no as string | null) ?? null,
          doa: (r.doa as string | null) ?? null,
          diagnosis: null, investigations_done: null, treatment_given: null,
          vitals_text: null, referred_by_name: null,
          source: (r.source as ReferralSource) ?? source,
        })
        setPrintedAt((r.first_printed_at as string | null) ?? null)
        setToInstitution(str('to_institution')); setToDoctor(str('to_doctor'))
        setToDepartment(str('to_department')); setToAddress(str('to_address'))
        setReason(str('reason'))
        setDiagnosis(str('diagnosis')); setInvestigations(str('investigations_done'))
        setTreatment(str('treatment_given')); setCondition(str('condition_at_referral'))
        setVitals(str('vitals_text'))
        setTransport(str('transport')); setAccompaniedBy(str('accompanied_by'))
        setTransportNote(str('transport_note'))
        setByName(str('referred_by_name')); setByQual(str('referred_by_qualification'))
        setByRegNo(str('referred_by_reg_no'))
        return
      }

      const d = await prepareReferral({
        patient_id: patientId,
        visit_id: visitId ?? null,
        admission_id: admissionId ?? null,
        emergency_case_id: emergencyCaseId ?? null,
      })
      if (!live) return
      setLoading(false)
      if (!d) { setError('That patient no longer exists'); return }
      setDraft(d)
      setDiagnosis(d.diagnosis ?? '')
      setInvestigations(d.investigations_done ?? '')
      setTreatment(d.treatment_given ?? '')
      setVitals(d.vitals_text ?? '')
      setByName(d.referred_by_name ?? '')
    })()
    return () => { live = false }
  }, [open, referralId, patientId, visitId, admissionId, emergencyCaseId, source])

  // The two the letter genuinely cannot go without, named the way the fields
  // are labelled so they can be found by eye.
  const missing = [
    !(toInstitution.trim() || toDoctor.trim()) ? 'the hospital or doctor being referred to' : null,
    !reason.trim() ? 'why they are being referred' : null,
  ].filter(Boolean) as string[]

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!draft) return
    setSaving(true); setError(null)

    if (referralId) {
      const u = await updateReferral(referralId, {
        diagnosis: diagnosis || null,
        investigations_done: investigations || null,
        treatment_given: treatment || null,
        condition_at_referral: condition || null,
        vitals_text: vitals || null,
        reason,
        to_institution: toInstitution || null, to_doctor: toDoctor || null,
        to_department: toDepartment || null, to_address: toAddress || null,
        transport: transport || null, accompanied_by: accompaniedBy || null,
        transport_note: transportNote || null,
        referred_by_name: byName || null, referred_by_qualification: byQual || null,
        referred_by_reg_no: byRegNo || null,
      })
      setSaving(false)
      if (!u.success) { setError(u.error); return }
      setSavedId(referralId)
      onSaved?.(referralId)
      return
    }

    const r = await createReferral({
      patient_id: draft.patient_id,
      visit_id: visitId ?? null,
      admission_id: admissionId ?? null,
      emergency_case_id: emergencyCaseId ?? null,
      source,
      patient_name: draft.patient_name, patient_age: draft.patient_age,
      patient_sex: draft.patient_sex, address_text: draft.address_text,
      contact_no: draft.contact_no, mr_no: draft.mr_no,
      op_no: draft.op_no, ip_no: draft.ip_no, doa: draft.doa,
      diagnosis: diagnosis || null,
      investigations_done: investigations || null,
      treatment_given: treatment || null,
      condition_at_referral: condition || null,
      vitals_text: vitals || null,
      reason,
      to_institution: toInstitution || null, to_doctor: toDoctor || null,
      to_department: toDepartment || null, to_address: toAddress || null,
      transport: transport || null, accompanied_by: accompaniedBy || null,
      transport_note: transportNote || null,
      referred_by_name: byName || null, referred_by_qualification: byQual || null,
      referred_by_reg_no: byRegNo || null,
    })
    setSaving(false)
    if (!r.success) { setError(r.error); return }
    setSavedId(r.id)
    onSaved?.(r.id)
  }

  // Written, numbered, and waiting to be printed. Deliberately a separate step
  // rather than closing: the letter is no use until it is on paper in the
  // patient's hand, and this is the moment to print it.
  // Closing resets, so reopening on another patient never shows the last one's
  // details for a frame.
  function close() {
    setDraft(null); setLoading(true); setSavedId(null); setError(null); setPrintedAt(null)
    setToInstitution(''); setToDoctor(''); setToDepartment(''); setToAddress('')
    setReason(''); setDiagnosis(''); setInvestigations(''); setTreatment('')
    setCondition(''); setVitals('')
    setTransport(''); setAccompaniedBy(''); setTransportNote('')
    setByName(''); setByQual(''); setByRegNo('')
    onClose()
  }

  if (savedId) {
    return (
      <Modal open={open} onClose={close}
        title={referralId ? 'Referral letter corrected' : 'Referral letter ready'} maxWidth="28rem">
        <div className="space-y-4">
          <p className="text-sm" style={{ color: '#475569' }}>
            {referralId
              ? 'The letter has been corrected and keeps its own number.'
              : 'The letter has been written and numbered. Print it and give it to the patient '
                + 'or whoever is travelling with them — it is what the receiving doctor will '
                + 'treat them on.'}
          </p>
          {referralId && printedAt && (
            <p className="text-xs rounded-xl px-3 py-2"
              style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}>
              A copy was already printed. The patient may be carrying the old one, so the
              reprint says it was revised — give them the new copy if you can.
            </p>
          )}
          <div className="flex gap-3 justify-end">
            <button onClick={close}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
              Later
            </button>
            <a href={`/print/referral/${savedId}`} target="_blank" rel="noopener"
              onClick={close}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-semibold"
              style={{ background: '#0D9488', color: '#fff', textDecoration: 'none' }}>
              <Printer className="w-4 h-4" /> Print the letter
            </a>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open={open} onClose={close}
      title={referralId ? 'Correct this referral letter' : 'Refer this patient elsewhere'}
      maxWidth="40rem">
      {loading ? (
        <p className="text-sm py-6 text-center" style={{ color: '#94A3B8' }}>Gathering the details…</p>
      ) : (
        <form onSubmit={save} className="space-y-4">
          {draft && (
            <div className="rounded-xl px-3 py-2 text-xs"
              style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#475569' }}>
              <span className="font-semibold" style={{ color: '#0F172A' }}>{draft.patient_name}</span>
              {draft.patient_age != null && ` · ${draft.patient_age}y`}
              {draft.patient_sex && ` ${draft.patient_sex}`}
              {draft.mr_no && ` · MR ${draft.mr_no}`}
              {draft.ip_no && ` · ${draft.ip_no}`}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Referred to — hospital" required>
              <Input value={toInstitution} onChange={(e) => setToInstitution(e.target.value)}
                placeholder="e.g. Government Medical College, Karur" />
            </FormField>
            <FormField label="Doctor">
              <Input value={toDoctor} onChange={(e) => setToDoctor(e.target.value)}
                placeholder="Name, if known" />
            </FormField>
            <FormField label="Department">
              <Input value={toDepartment} onChange={(e) => setToDepartment(e.target.value)}
                placeholder="e.g. Neurosurgery" />
            </FormField>
            <FormField label="Their address">
              <Input value={toAddress} onChange={(e) => setToAddress(e.target.value)} />
            </FormField>
          </div>
          <p className="text-xs" style={{ color: '#94A3B8' }}>
            One of the two is enough, but a letter addressed to nobody tends to be read
            by nobody.
          </p>

          <FormField label="Why they are being referred" required>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. For CT brain and neurosurgical opinion — facility not available here"
              style={{ minHeight: '3rem' }} />
          </FormField>

          <FormField label="Diagnosis / provisional diagnosis">
            <Textarea value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)}
              style={{ minHeight: '2.5rem' }} />
          </FormField>

          <FormField label="Investigations already done">
            <Textarea value={investigations} onChange={(e) => setInvestigations(e.target.value)}
              placeholder="So the receiving hospital does not repeat them"
              style={{ minHeight: '2.5rem' }} />
          </FormField>

          <FormField label="Treated with">
            <Textarea value={treatment} onChange={(e) => setTreatment(e.target.value)}
              style={{ minHeight: '4rem' }} />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Condition at the time of referral">
              <Input value={condition} onChange={(e) => setCondition(e.target.value)}
                placeholder="e.g. Conscious, stable, on oxygen" />
            </FormField>
            <FormField label="Vitals">
              <Input value={vitals} onChange={(e) => setVitals(e.target.value)} />
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FormField label="Travelling by">
              <Select value={transport} onChange={(e) => setTransport(e.target.value)}>
                <option value="">Not recorded</option>
                <option value="hospital_ambulance">Our ambulance</option>
                <option value="other_ambulance">Another ambulance (108 or private)</option>
                <option value="own">Their own transport</option>
                <option value="other">Other</option>
              </Select>
            </FormField>
            <FormField label="Accompanied by">
              <Input value={accompaniedBy} onChange={(e) => setAccompaniedBy(e.target.value)}
                placeholder="e.g. Staff nurse, or a relative's name" />
            </FormField>
            <FormField label="Note">
              <Input value={transportNote} onChange={(e) => setTransportNote(e.target.value)}
                placeholder="e.g. On oxygen in transit" />
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FormField label="Referred by" required>
              <Input value={byName} onChange={(e) => setByName(e.target.value)} />
            </FormField>
            <FormField label="Qualification">
              <Input value={byQual} onChange={(e) => setByQual(e.target.value)}
                placeholder="e.g. MBBS, MD" />
            </FormField>
            <FormField label="Registration number">
              <Input value={byRegNo} onChange={(e) => setByRegNo(e.target.value)} />
            </FormField>
          </div>

          {error && (
            <div className="text-sm rounded-xl px-3 py-2"
              style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>
          )}

          {/*
            A greyed-out button that does not say why is the commonest way a
            form wastes somebody's time, and this one is long enough that the
            two fields it is waiting for scroll off the top of the modal. So it
            names them, and says they are above.
          */}
          {missing.length > 0 && (
            <p className="text-xs rounded-xl px-3 py-2"
              style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}>
              Still needed, at the top of this form: {missing.join(' and ')}.
            </p>
          )}

          <div className="flex gap-3 justify-end pt-1">
            <button type="button" onClick={close}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
              Cancel
            </button>
            <button type="submit"
              disabled={saving || missing.length > 0}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-semibold"
              style={{
                background: saving || missing.length > 0 ? '#94A3B8' : '#0D9488',
                color: '#fff', border: 'none',
                cursor: saving || missing.length > 0 ? 'not-allowed' : 'pointer',
              }}>
              <Send className="w-4 h-4" /> {saving ? 'Writing…' : 'Write the letter'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
