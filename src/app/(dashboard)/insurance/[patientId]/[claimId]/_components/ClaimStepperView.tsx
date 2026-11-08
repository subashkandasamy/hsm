'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, MessageSquarePlus, Plus, Pencil, Trash2, Upload, FileText, AlertTriangle, Check, Circle, Clock, UserRound } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import StatusBadge from '@/components/ui/StatusBadge'
import Money from '@/components/ui/Money'
import DateText from '@/components/ui/DateText'
import Select from '@/components/ui/Select'
import Combobox from '@/components/ui/Combobox'
import Stepper, { type StepperStep } from '@/components/ui/Stepper'
import {
  startClaim, addPolicy, attachPolicyDocument, listPolicyDocuments,
  updateEligibilityFields, decideEligibility, addClaimNote, updateClaimNote, deleteClaimNote,
  listClaimNotes, listClaimHistory, advanceClaim, recordSettlement, getClaim, listClaimSettlementPayments,
  updateClaimIdentifiers, addDeduction, listDeductions, deleteDeduction,
  setClaimOwner, listChecklist, addChecklistItem, toggleChecklistItem, deleteChecklistItem,
  listEnhancements, addEnhancement, decideEnhancement, appealClaim,
  updateClaimFields, updatePolicy,
} from '@/app/actions/insurance'
import { getUploadUrl } from '@/app/actions/documents'
import { useAuth } from '@/context/AuthContext'
import { hasPermission } from '@/lib/rbac'
import type {
  InsuranceClaim, InsuranceClaimNote, InsuranceClaimHistoryEntry, InsurancePolicy,
  InsuranceTpa, InsuranceBankAccount, InsuranceClaimStatus, InsuranceClaimDeduction,
  InsuranceClaimChecklistItem, InsuranceClaimEnhancement,
  ClaimAdmissionType, DeductionType, ShortfallResolution,
} from '@/lib/types'
import { istToday } from '@/lib/istDate'

const STANDARD_DOCS = ['Discharge Summary', 'Final Bill', 'Investigation Reports', 'ID Proof / KYC', 'Pre-auth Form', 'Doctor Notes']

const DEDUCTION_LABEL: Record<DeductionType, string> = {
  non_payable: 'Non-payable item', room_rent: 'Room-rent cap', copay: 'Co-pay',
  reasonable_customary: 'Reasonable & customary', other: 'Other',
}

const STATUS_MAP: Record<InsuranceClaimStatus, string> = {
  draft: 'info', awaiting_eligibility: 'info', raised: 'info', submitted: 'pending',
  approved: 'success', rejected: 'danger', settled: 'cancelled',
}
const STATUS_LABEL: Record<InsuranceClaimStatus, string> = {
  draft: 'Draft', awaiting_eligibility: 'Eligibility Check', raised: 'Raised', submitted: 'Submitted',
  approved: 'Approved', rejected: 'Rejected', settled: 'Settled',
}

interface Props {
  patientId: string
  patientName: string
  encounterScope: { type: 'admission' | 'visit' | 'bill'; id: string }
  treatmentValue: number | null
  initialClaim: InsuranceClaim | null
  initialPolicies: InsurancePolicy[]
  initialTpas: InsuranceTpa[]
  initialProviders: string[]
  initialBankAccounts: InsuranceBankAccount[]
  initialNotes: InsuranceClaimNote[]
  initialHistory: InsuranceClaimHistoryEntry[]
  initialSettlementPayments: Array<{ id: string; amount: number; bill_id: string; created_at: string }>
  initialPolicyDocuments: Array<{ id: string; title: string; file_path: string; uploaded_at: string }>
  initialDeductions: InsuranceClaimDeduction[]
  initialChecklist: InsuranceClaimChecklistItem[]
  initialEnhancements: InsuranceClaimEnhancement[]
  owners: Array<{ id: string; full_name: string }>
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function Section({ id, title, desc, locked, lockedNote, action, children }: { id: string; title: string; desc?: string; locked?: boolean; lockedNote?: string; action?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <GlassCard className="p-4" style={locked ? { opacity: 0.55 } : undefined}>
      <div id={id} style={{ scrollMarginTop: '80px' }} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: '#0F172A' }}>{title}</h3>
          {desc && <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{desc}</p>}
        </div>
        {!locked && action}
      </div>
      <div className="mb-3" />
      {locked ? <p className="text-xs" style={{ color: '#94A3B8' }}>{lockedNote ?? 'Complete the previous stage first.'}</p> : children}
    </GlassCard>
  )
}

function EditBtn({ onClick, editing }: { onClick: () => void; editing: boolean }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-xs font-medium flex-shrink-0" style={{ color: editing ? '#94A3B8' : '#0D9488' }}>
      {editing ? <>Close</> : <><Pencil className="w-3 h-3" /> Edit</>}
    </button>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs" style={{ color: '#94A3B8' }}>{label}</p>
      <div className="text-sm font-medium mt-0.5" style={{ color: '#0F172A' }}>{value}</div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#0F172A', minHeight: '44px', outline: 'none',
}

export default function ClaimStepperView({
  patientId, patientName, encounterScope, treatmentValue, initialClaim,
  initialPolicies, initialTpas, initialProviders, initialBankAccounts,
  initialNotes, initialHistory, initialSettlementPayments, initialPolicyDocuments,
  initialDeductions, initialChecklist, initialEnhancements, owners,
}: Props) {
  const router = useRouter()
  const { profile } = useAuth()
  const role = profile?.role
  const canWrite = !!role && hasPermission(role, 'insurance:write', profile?.granted_permissions)

  const [claim, setClaim] = useState(initialClaim)
  const [policies] = useState(initialPolicies)
  const [notes, setNotes] = useState(initialNotes)
  const [history, setHistory] = useState(initialHistory)
  const [settlementPayments, setSettlementPayments] = useState(initialSettlementPayments)
  const [policyDocuments, setPolicyDocuments] = useState(initialPolicyDocuments)
  const [error, setError] = useState<string | null>(null)
  // Settlement money that could not be posted to a bill. Shown until the page
  // is left: the claim is settled, so there is no error to retry — somebody
  // has to place the money by hand.
  const [notice, setNotice] = useState<string | null>(null)

  // Stage 1 — Add Policy
  const [addingPolicy, setAddingPolicy] = useState(policies.length === 0)
  const [newProvider, setNewProvider] = useState('')
  const [newPolicyNo, setNewPolicyNo] = useState('')
  const [newValidTill, setNewValidTill] = useState('')
  const [newCoverage, setNewCoverage] = useState('')
  const [newTpaId, setNewTpaId] = useState('')
  const [newRoomRentLimit, setNewRoomRentLimit] = useState('')
  const [newSubLimitNotes, setNewSubLimitNotes] = useState('')
  const [newMemberId, setNewMemberId] = useState('')
  const [newPolicyholder, setNewPolicyholder] = useState('')
  const [newRelationship, setNewRelationship] = useState('self')
  const [newCorporate, setNewCorporate] = useState('')
  const [newEmployeeId, setNewEmployeeId] = useState('')
  const [newCopayPercent, setNewCopayPercent] = useState('')
  const [startingPolicyId, setStartingPolicyId] = useState<string | null>(null)
  const [savingPolicy, setSavingPolicy] = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [docTitle, setDocTitle] = useState('Policy Copy')
  const [docFile, setDocFile] = useState<File | null>(null)

  // Stage 2 — Eligibility Check
  const [estimatedAmount, setEstimatedAmount] = useState(String(claim?.estimated_amount ?? treatmentValue ?? ''))
  const [diagnosis, setDiagnosis] = useState(claim?.diagnosis ?? '')
  const [roomCategory, setRoomCategory] = useState(claim?.room_category_requested ?? '')
  const [icdCode, setIcdCode] = useState(claim?.icd_code ?? '')
  const [admissionType, setAdmissionType] = useState<ClaimAdmissionType | ''>(claim?.admission_type ?? '')
  const cb = claim?.cost_breakdown ?? {}
  const [costRoom, setCostRoom] = useState(String(cb.room ?? ''))
  const [costIcu, setCostIcu] = useState(String(cb.icu ?? ''))
  const [costOt, setCostOt] = useState(String(cb.ot ?? ''))
  const [costProf, setCostProf] = useState(String(cb.professional ?? ''))
  const [costPharm, setCostPharm] = useState(String(cb.pharmacy ?? ''))
  const [costImplants, setCostImplants] = useState(String(cb.implants ?? ''))
  const [costOther, setCostOther] = useState(String(cb.other ?? ''))
  const [savingFields, setSavingFields] = useState(false)
  // Insurer identifiers (editable any time as the TPA returns them)
  const [preauthNumber, setPreauthNumber] = useState(claim?.preauth_number ?? '')
  const [insurerClaimNumber, setInsurerClaimNumber] = useState(claim?.insurer_claim_number ?? '')
  const [savingIds, setSavingIds] = useState(false)
  const [approvedAmount, setApprovedAmount] = useState(String(claim?.eligibility_approved_amount ?? claim?.estimated_amount ?? treatmentValue ?? ''))
  const [decidingEligibility, setDecidingEligibility] = useState<'approved' | 'rejected' | null>(null)
  const [noteText, setNoteText] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editingNoteText, setEditingNoteText] = useState('')

  // Stage 3 — Claim
  const [claimAmount, setClaimAmount] = useState(String(claim?.claim_amount ?? claim?.estimated_amount ?? ''))
  const [finalApprovedAmount, setFinalApprovedAmount] = useState(String(claim?.approved_amount ?? ''))
  const [copay, setCopay] = useState(String(claim?.copay_amount ?? ''))
  const [claimSubmitting, setClaimSubmitting] = useState<string | null>(null)

  // Stage 4 — Settlement
  const [settledAmount, setSettledAmount] = useState(String(claim?.settled_amount ?? claim?.approved_amount ?? ''))
  const [settlementAccountId, setSettlementAccountId] = useState(claim?.settlement_account_id ?? '')
  const [settlementNotes, setSettlementNotes] = useState(claim?.settlement_notes ?? '')
  const [settlementUtr, setSettlementUtr] = useState(claim?.settlement_utr ?? '')
  const [tdsAmount, setTdsAmount] = useState(String(claim?.tds_amount ?? ''))
  const [shortfallResolution, setShortfallResolution] = useState<ShortfallResolution | ''>(claim?.shortfall_resolution ?? '')
  const [settling, setSettling] = useState(false)
  // Deduction lines
  const [deductions, setDeductions] = useState(initialDeductions)
  const [dedDesc, setDedDesc] = useState('')
  const [dedAmount, setDedAmount] = useState('')
  const [dedType, setDedType] = useState<DeductionType>('non_payable')
  const [addingDed, setAddingDed] = useState(false)

  // Tier 2 — desk ops
  const [ownerId, setOwnerId] = useState(claim?.owner_id ?? '')
  const [followUpDue, setFollowUpDue] = useState(claim?.follow_up_due ?? '')
  const [savingOwner, setSavingOwner] = useState(false)
  const [checklist, setChecklist] = useState(initialChecklist)
  const [newChecklistItem, setNewChecklistItem] = useState('')
  const [enhancements, setEnhancements] = useState(initialEnhancements)
  const [enhAmount, setEnhAmount] = useState('')
  const [enhAl, setEnhAl] = useState('')
  const [addingEnh, setAddingEnh] = useState(false)
  const [denialReason, setDenialReason] = useState('')
  const [appealing, setAppealing] = useState(false)

  // Per-section edit toggles + saved-value correction
  const [editStage, setEditStage] = useState<'policy' | 'eligibility' | 'claim' | 'settlement' | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  function toggleEdit(s: 'policy' | 'eligibility' | 'claim' | 'settlement') { setEditStage((cur) => (cur === s ? null : s)) }

  async function saveClaimFields(fields: Record<string, unknown>) {
    if (!claim) return
    setSavingEdit(true); setError(null)
    const res = await updateClaimFields(claim.id, fields)
    setSavingEdit(false)
    if (!res.success) { setError(res.error); return }
    setEditStage(null)
    await refreshClaim(claim.id)
  }

  // Stage 1 edit — the policy itself (not the claim row)
  const [pEditProvider, setPEditProvider] = useState('')
  const [pEditPolicyNo, setPEditPolicyNo] = useState('')
  const [pEditMember, setPEditMember] = useState('')
  const [pEditCoverage, setPEditCoverage] = useState('')
  const [pEditRoomCap, setPEditRoomCap] = useState('')
  const [pEditCopayPct, setPEditCopayPct] = useState('')
  function openPolicyEdit() {
    setPEditProvider(claim?.policy?.provider ?? '')
    setPEditPolicyNo(claim?.policy?.policy_no ?? '')
    setPEditMember(claim?.policy?.member_id ?? '')
    setPEditCoverage(String(claim?.policy?.coverage_amount ?? ''))
    setPEditRoomCap(String(claim?.policy?.room_rent_limit_per_day ?? ''))
    setPEditCopayPct(String(claim?.policy?.copay_percent ?? ''))
    toggleEdit('policy')
  }
  async function savePolicyEdit() {
    if (!claim?.policy_id) return
    setSavingEdit(true); setError(null)
    const res = await updatePolicy(claim.policy_id, {
      provider: pEditProvider || undefined, policy_no: pEditPolicyNo || undefined,
      member_id: pEditMember || null,
      coverage_amount: pEditCoverage ? parseFloat(pEditCoverage) : null,
      room_rent_limit_per_day: pEditRoomCap ? parseFloat(pEditRoomCap) : null,
      copay_percent: pEditCopayPct ? parseFloat(pEditCopayPct) : null,
    })
    setSavingEdit(false)
    if (!res.success) { setError(res.error); return }
    setEditStage(null)
    await refreshClaim(claim.id)
  }

  async function refreshClaim(id: string) {
    const [c, n, h, d, ck, enh] = await Promise.all([
      getClaim(id), listClaimNotes(id), listClaimHistory(id), listDeductions(id), listChecklist(id), listEnhancements(id),
    ])
    if (c) setClaim(c)
    setNotes(n)
    setHistory(h)
    setDeductions(d)
    setChecklist(ck)
    setEnhancements(enh)
  }

  // ── Tier 2 handlers ──────────────────────────────────────────────────────
  async function saveOwner() {
    if (!claim) return
    setSavingOwner(true); setError(null)
    const res = await setClaimOwner(claim.id, { owner_id: ownerId || null, follow_up_due: followUpDue || null })
    setSavingOwner(false)
    if (!res.success) { setError(res.error); return }
    await refreshClaim(claim.id)
  }

  async function handleAddChecklist(item: string) {
    if (!claim || !item.trim()) return
    const res = await addChecklistItem({ claim_id: claim.id, item: item.trim() })
    if (!res.success) { setError(res.error); return }
    setNewChecklistItem('')
    setChecklist(await listChecklist(claim.id))
  }
  async function handleToggleChecklist(id: string, provided: boolean) {
    const res = await toggleChecklistItem(id, provided)
    if (!res.success) { setError(res.error); return }
    if (claim) setChecklist(await listChecklist(claim.id))
  }
  async function handleDeleteChecklist(id: string) {
    const res = await deleteChecklistItem(id)
    if (!res.success) { setError(res.error); return }
    if (claim) setChecklist(await listChecklist(claim.id))
  }

  async function handleAddEnhancement() {
    if (!claim || !(parseFloat(enhAmount) > 0)) return
    setAddingEnh(true); setError(null)
    const res = await addEnhancement({ claim_id: claim.id, requested_amount: parseFloat(enhAmount), al_number: enhAl || null })
    setAddingEnh(false)
    if (!res.success) { setError(res.error); return }
    setEnhAmount(''); setEnhAl('')
    setEnhancements(await listEnhancements(claim.id))
  }
  async function handleDecideEnhancement(id: string, decision: 'approved' | 'rejected') {
    if (!claim) return
    const res = await decideEnhancement({ id, decision })
    if (!res.success) { setError(res.error); return }
    await refreshClaim(claim.id)
  }

  function scrollTo(key: string) {
    document.getElementById(`stage-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Which encounter column the claim is scoped to.
  const encScope = encounterScope.type === 'admission' ? { admission_id: encounterScope.id }
    : encounterScope.type === 'bill' ? { bill_id: encounterScope.id }
    : { visit_id: encounterScope.id }

  // ── Stage 1 actions ──────────────────────────────────────────────────────
  async function chooseExistingPolicy(policyId: string) {
    setStartingPolicyId(policyId); setError(null)
    const res = await startClaim({ ...encScope, policy_id: policyId })
    setStartingPolicyId(null)
    if (!res.success) { setError(res.error); return }
    router.replace(`/insurance/${patientId}/${res.claimId}`)
  }

  async function saveNewPolicyAndStart() {
    if (!newProvider.trim() || !newPolicyNo.trim()) { setError('Provider and policy number are required'); return }
    setSavingPolicy(true); setError(null)
    const polRes = await addPolicy({
      patient_id: patientId, provider: newProvider, policy_no: newPolicyNo,
      valid_till: newValidTill || null, coverage_amount: newCoverage ? parseFloat(newCoverage) : null,
      tpa_id: newTpaId || null,
      room_rent_limit_per_day: newRoomRentLimit ? parseFloat(newRoomRentLimit) : null,
      sub_limit_notes: newSubLimitNotes || null,
      member_id: newMemberId || null,
      policyholder_name: newPolicyholder || null,
      policyholder_relationship: newRelationship || null,
      corporate_name: newCorporate || null,
      employee_id: newEmployeeId || null,
      copay_percent: newCopayPercent ? parseFloat(newCopayPercent) : null,
    })
    if (!polRes.success) { setSavingPolicy(false); setError(polRes.error); return }
    const res = await startClaim({ ...encScope, policy_id: polRes.policy.id })
    setSavingPolicy(false)
    if (!res.success) { setError(res.error); return }
    router.replace(`/insurance/${patientId}/${res.claimId}`)
  }

  async function handleUploadDoc() {
    if (!claim || !docFile) return
    setUploadingDoc(true); setError(null)
    const urlRes = await getUploadUrl(patientId, docFile.name, docFile.size)
    if (!urlRes.success) { setUploadingDoc(false); setError(urlRes.error); return }
    const upResp = await fetch(urlRes.signedUrl, { method: 'PUT', headers: { 'Content-Type': docFile.type || 'application/octet-stream' }, body: docFile })
    if (!upResp.ok) { setUploadingDoc(false); setError('File upload failed — please try again'); return }
    const res = await attachPolicyDocument({ policyId: claim.policy_id, patientId, title: docTitle.trim() || 'Policy Document', filePath: urlRes.filePath })
    setUploadingDoc(false)
    if (!res.success) { setError(res.error); return }
    setPolicyDocuments(await listPolicyDocuments(claim.policy_id))
    setDocFile(null)
  }

  // ── Stage 2 actions ──────────────────────────────────────────────────────
  function costBreakdownPayload() {
    const n = (s: string) => (s ? parseFloat(s) : null)
    const cbp = { room: n(costRoom), icu: n(costIcu), ot: n(costOt), professional: n(costProf), pharmacy: n(costPharm), implants: n(costImplants), other: n(costOther) }
    return Object.values(cbp).some((v) => v != null) ? cbp : null
  }

  async function saveEligibilityFields() {
    if (!claim) return
    setSavingFields(true); setError(null)
    const res = await updateEligibilityFields(claim.id, {
      estimated_amount: estimatedAmount ? parseFloat(estimatedAmount) : null,
      diagnosis: diagnosis || null,
      room_category_requested: roomCategory || null,
      icd_code: icdCode || null,
      admission_type: admissionType || null,
      cost_breakdown: costBreakdownPayload(),
    })
    setSavingFields(false)
    if (!res.success) { setError(res.error); return }
    await refreshClaim(claim.id)
  }

  async function saveIdentifiers() {
    if (!claim) return
    setSavingIds(true); setError(null)
    const res = await updateClaimIdentifiers(claim.id, {
      preauth_number: preauthNumber || null,
      insurer_claim_number: insurerClaimNumber || null,
    })
    setSavingIds(false)
    if (!res.success) { setError(res.error); return }
    await refreshClaim(claim.id)
  }

  async function handleAddDeduction() {
    if (!claim || !dedDesc.trim() || !(parseFloat(dedAmount) > 0)) return
    setAddingDed(true); setError(null)
    const res = await addDeduction({ claim_id: claim.id, description: dedDesc.trim(), amount: parseFloat(dedAmount), deduction_type: dedType })
    setAddingDed(false)
    if (!res.success) { setError(res.error); return }
    setDedDesc(''); setDedAmount('')
    setDeductions(await listDeductions(claim.id))
  }

  async function handleDeleteDeduction(id: string) {
    if (!claim) return
    const res = await deleteDeduction(id)
    if (!res.success) { setError(res.error); return }
    setDeductions(await listDeductions(claim.id))
  }

  async function decide(decision: 'approved' | 'rejected') {
    if (!claim) return
    if (decision === 'approved' && !estimatedAmount) { setError('Enter an estimated amount before approving'); return }
    setDecidingEligibility(decision); setError(null)
    const res = await decideEligibility({
      id: claim.id, decision,
      approved_amount: decision === 'approved' ? (parseFloat(approvedAmount) || parseFloat(estimatedAmount)) : null,
      denial_reason: decision === 'rejected' ? (denialReason || null) : null,
    })
    setDecidingEligibility(null)
    if (!res.success) { setError(res.error); return }
    await refreshClaim(claim.id)
  }

  async function handleAddNote() {
    if (!claim || !noteText.trim()) return
    setAddingNote(true); setError(null)
    const res = await addClaimNote(claim.id, noteText.trim())
    setAddingNote(false)
    if (!res.success) { setError(res.error); return }
    setNoteText('')
    setNotes(await listClaimNotes(claim.id))
  }

  async function handleSaveNoteEdit(noteId: string) {
    if (!editingNoteText.trim()) return
    const res = await updateClaimNote(noteId, editingNoteText.trim())
    if (!res.success) { setError(res.error); return }
    setEditingNoteId(null)
    if (claim) setNotes(await listClaimNotes(claim.id))
  }

  async function handleDeleteNote(noteId: string) {
    const res = await deleteClaimNote(noteId)
    if (!res.success) { setError(res.error); return }
    if (claim) { setNotes(await listClaimNotes(claim.id)); setHistory(await listClaimHistory(claim.id)) }
  }

  // ── Stage 3 actions ──────────────────────────────────────────────────────
  async function raiseClaim() {
    if (!claim) return
    if (!(parseFloat(claimAmount) > 0)) { setError('Enter a valid claim amount'); return }
    setClaimSubmitting('raise'); setError(null)
    const res = await advanceClaim(claim.id, { next_status: 'raised', claim_amount: parseFloat(claimAmount) })
    setClaimSubmitting(null)
    if (!res.success) { setError(res.error); return }
    await refreshClaim(claim.id)
  }

  async function markSubmitted() {
    if (!claim) return
    setClaimSubmitting('submit'); setError(null)
    const res = await advanceClaim(claim.id, { next_status: 'submitted' })
    setClaimSubmitting(null)
    if (!res.success) { setError(res.error); return }
    await refreshClaim(claim.id)
  }

  async function decideClaim(decision: 'approved' | 'rejected') {
    if (!claim) return
    setClaimSubmitting(decision); setError(null)
    const res = await advanceClaim(claim.id, {
      next_status: decision,
      approved_amount: decision === 'approved' ? (parseFloat(finalApprovedAmount) || parseFloat(claimAmount)) : null,
      copay_amount: decision === 'approved' && copay ? parseFloat(copay) : null,
      denial_reason: decision === 'rejected' ? (denialReason || null) : null,
    })
    setClaimSubmitting(null)
    if (!res.success) { setError(res.error); return }
    await refreshClaim(claim.id)
  }

  async function handleAppeal() {
    if (!claim) return
    setAppealing(true); setError(null)
    const res = await appealClaim(claim.id)
    setAppealing(false)
    if (!res.success) { setError(res.error); return }
    await refreshClaim(claim.id)
  }

  // ── Stage 4 action ───────────────────────────────────────────────────────
  const settleCovered = claim?.eligibility_approved_amount ?? 0
  const settleShortfall = Math.max(0, settleCovered - (parseFloat(settledAmount) || 0))

  async function handleSettle() {
    if (!claim) return
    if (!(parseFloat(settledAmount) >= 0)) { setError('Enter a valid settled amount'); return }
    if (!settlementAccountId) { setError('Select a bank account'); return }
    if (settleShortfall > 0 && !shortfallResolution) {
      setError('Choose how to resolve the shortfall — write it off or recover it from the patient.'); return
    }
    setSettling(true); setError(null)
    const res = await recordSettlement({
      id: claim.id, settled_amount: parseFloat(settledAmount),
      settlement_account_id: settlementAccountId, settlement_notes: settlementNotes || null,
      settlement_utr: settlementUtr || null,
      tds_amount: tdsAmount ? parseFloat(tdsAmount) : null,
      shortfall_resolution: settleShortfall > 0 ? (shortfallResolution || null) : null,
    })
    setSettling(false)
    if (!res.success) { setError(res.error); return }
    setNotice(res.warning ?? null)
    const [c, sp] = await Promise.all([getClaim(claim.id), listClaimSettlementPayments(claim.id)])
    if (c) setClaim(c)
    setSettlementPayments(sp)
  }

  // ── Stepper computation ──────────────────────────────────────────────────
  const isEligibilityRejected = claim?.eligibility_status === 'rejected'
  const isClaimRejected = claim?.status === 'rejected' && claim.eligibility_status !== 'rejected'
  const isRejected = isEligibilityRejected || isClaimRejected

  const steps: StepperStep[] = [
    { key: 'policy', label: 'Add Policy', state: claim ? 'done' : 'current' },
    {
      key: 'eligibility', label: 'Eligibility Check',
      state: !claim ? 'pending' : claim.eligibility_status === 'pending' ? 'current' : 'done',
    },
    {
      key: 'claim', label: 'Claim',
      state: !claim || claim.eligibility_status !== 'approved' ? 'pending'
        : ['approved', 'settled'].includes(claim.status) ? 'done' : 'current',
    },
    {
      key: 'settlement', label: 'Settlement',
      state: !claim || claim.status === 'settled' ? (claim?.status === 'settled' ? 'done' : 'pending')
        : claim.status === 'approved' ? 'current' : 'pending',
    },
  ]
  const rejectedAtLabel = isEligibilityRejected ? 'Eligibility Check' : isClaimRejected ? 'Claim' : undefined

  const claimAmt = claim?.claim_amount ?? claim?.estimated_amount ?? 0
  const suggestedCopay = Math.max(0, claimAmt - (parseFloat(finalApprovedAmount) || 0))

  // Aging / SLA — only meaningful while the claim is live.
  const terminal = !!claim && (claim.status === 'settled' || claim.status === 'rejected')
  const agingDays = claim && !terminal ? Math.floor((Date.now() - new Date(claim.submitted_at ?? claim.created_at).getTime()) / 86400000) : null
  const today = istToday()
  const overdue = !!claim?.follow_up_due && !terminal && claim.follow_up_due < today
  const requiredDocsMissing = checklist.filter((c) => !c.is_provided).length

  return (
    <div>
      <button onClick={() => router.push(`/insurance/${patientId}`)}
        className="flex items-center gap-1.5 text-sm mb-3" style={{ color: '#64748B' }}>
        <ArrowLeft className="w-4 h-4" /> Back to {patientName}
      </button>

      <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold" style={{ color: '#0F172A' }}>
              {encounterScope.type === 'admission' ? 'IPD Admission' : encounterScope.type === 'bill' ? 'OPD Consultation' : 'OPD Visit'} Claim
            </h1>
            {claim && <StatusBadge status={STATUS_MAP[claim.status]} label={STATUS_LABEL[claim.status]} />}
            {agingDays != null && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
                style={overdue ? { background: '#FAE7E0', color: '#B23A1E' } : { background: '#F1F5F9', color: '#64748B' }}>
                <Clock className="w-3 h-3" /> {agingDays}d{overdue ? ' · overdue' : ''}
              </span>
            )}
          </div>
          {claim && (
            <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>
              {claim.policy?.provider} · {claim.policy?.policy_no}
              {claim.preauth_number ? ` · AL ${claim.preauth_number}` : ''}
            </p>
          )}
        </div>
      </div>

      <GlassCard className="p-4 mb-5 overflow-x-auto">
        <Stepper steps={steps} rejected={isRejected} rejectedAtLabel={rejectedAtLabel} onStepClick={scrollTo} />
      </GlassCard>

      {/* ── Desk workbench — owner, follow-up, documents, enhancements ── */}
      {claim && (
        <GlassCard className="p-4 mb-4">
          <h3 className="text-sm font-semibold" style={{ color: '#0F172A' }}>Desk Workbench</h3>
          <p className="text-xs mt-0.5 mb-4" style={{ color: '#94A3B8' }}>
            The day-to-day follow-up that sits across every stage — who owns this claim and when it&apos;s next chased, which documents are still needed before it can be submitted, and any mid-treatment enhancement requests.
          </p>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div className="min-w-40">
              <label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>Owner</label>
              <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} disabled={!canWrite}>
                <option value="">— Unassigned —</option>
                {owners.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>Follow-up due</label>
              <input type="date" value={followUpDue} onChange={(e) => setFollowUpDue(e.target.value)} disabled={!canWrite}
                className="px-3 py-2.5 rounded-xl text-sm" style={inputStyle} />
            </div>
            {canWrite && (
              <button onClick={saveOwner} disabled={savingOwner}
                className="px-3 py-2.5 rounded-lg text-xs font-medium" style={{ border: '1px solid #0D9488', color: '#0D9488' }}>
                {savingOwner ? 'Saving…' : 'Save'}
              </button>
            )}
            {claim.owner?.full_name && (
              <span className="inline-flex items-center gap-1.5 text-xs ml-auto" style={{ color: '#64748B' }}>
                <UserRound className="w-3.5 h-3.5" /> {claim.owner.full_name}
              </span>
            )}
          </div>

          {/* Document checklist */}
          <div className="pt-3" style={{ borderTop: '1px dashed #E2E8F0' }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold" style={{ color: '#475569' }}>Document Checklist</p>
              {requiredDocsMissing > 0 && <span className="text-xs" style={{ color: '#B45309' }}>{requiredDocsMissing} pending</span>}
            </div>
            {checklist.length > 0 && (
              <div className="space-y-1 mb-2">
                {checklist.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg" style={{ background: '#F8FAFC' }}>
                    <button onClick={() => canWrite && handleToggleChecklist(c.id, !c.is_provided)} disabled={!canWrite}
                      className="flex-shrink-0" title={c.is_provided ? 'Provided' : 'Mark provided'}>
                      {c.is_provided
                        ? <span className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background: '#0D9488' }}><Check className="w-3 h-3" style={{ color: '#fff' }} /></span>
                        : <Circle className="w-4 h-4" style={{ color: '#CBD5E1' }} />}
                    </button>
                    <span className="flex-1" style={{ color: c.is_provided ? '#94A3B8' : '#0F172A', textDecoration: c.is_provided ? 'line-through' : 'none' }}>{c.item}</span>
                    {canWrite && <button onClick={() => handleDeleteChecklist(c.id)} title="Remove"><Trash2 className="w-3.5 h-3.5" style={{ color: '#EF4444' }} /></button>}
                  </div>
                ))}
              </div>
            )}
            {canWrite && (
              <div className="flex gap-2 flex-wrap items-center">
                <input type="text" value={newChecklistItem} onChange={(e) => setNewChecklistItem(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddChecklist(newChecklistItem) }}
                  placeholder="Add a required document…" className="flex-1 min-w-40 px-3 py-2 rounded-lg text-sm" style={inputStyle} />
                <button onClick={() => handleAddChecklist(newChecklistItem)} disabled={!newChecklistItem.trim()}
                  className="px-3 py-2 rounded-lg text-xs font-medium" style={{ border: '1px solid #0D9488', color: '#0D9488' }}>Add</button>
              </div>
            )}
            {canWrite && checklist.length === 0 && (
              <div className="flex gap-1.5 flex-wrap mt-2">
                {STANDARD_DOCS.map((d) => (
                  <button key={d} onClick={() => handleAddChecklist(d)}
                    className="text-xs px-2 py-1 rounded-md" style={{ background: '#F1F5F9', color: '#475569' }}>+ {d}</button>
                ))}
              </div>
            )}
          </div>

          {/* Enhancements */}
          <div className="pt-3 mt-3" style={{ borderTop: '1px dashed #E2E8F0' }}>
            <p className="text-xs font-semibold mb-2" style={{ color: '#475569' }}>Enhancement Requests</p>
            {enhancements.length > 0 && (
              <div className="space-y-1 mb-2">
                {enhancements.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-2 text-xs px-3 py-2 rounded-lg" style={{ background: '#F8FAFC' }}>
                    <span style={{ color: '#0F172A' }}>
                      Requested <Money amount={e.requested_amount} className="font-medium" />
                      {e.al_number ? ` · AL ${e.al_number}` : ''}
                      {e.status === 'approved' && e.approved_amount != null ? <> · approved <Money amount={e.approved_amount} /></> : ''}
                    </span>
                    {e.status === 'pending' ? (
                      canWrite ? (
                        <span className="flex gap-2">
                          <button onClick={() => handleDecideEnhancement(e.id, 'approved')} className="font-medium" style={{ color: '#0D9488' }}>Approve</button>
                          <button onClick={() => handleDecideEnhancement(e.id, 'rejected')} className="font-medium" style={{ color: '#DC2626' }}>Reject</button>
                        </span>
                      ) : <span style={{ color: '#B45309' }}>pending</span>
                    ) : (
                      <span style={{ color: e.status === 'approved' ? '#0D9488' : '#DC2626' }}>{e.status}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {canWrite && !terminal && (
              <div className="flex gap-2 flex-wrap items-center">
                <input type="number" min={0} value={enhAmount} onChange={(e) => setEnhAmount(e.target.value)} placeholder="Enhanced amount ₹" className="w-40 px-3 py-2 rounded-lg text-sm" style={inputStyle} />
                <input type="text" value={enhAl} onChange={(e) => setEnhAl(e.target.value)} placeholder="Revised AL no. (optional)" className="flex-1 min-w-40 px-3 py-2 rounded-lg text-sm" style={inputStyle} />
                <button onClick={handleAddEnhancement} disabled={addingEnh || !(parseFloat(enhAmount) > 0)}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium" style={{ border: '1px solid #0D9488', color: '#0D9488' }}>
                  {addingEnh ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Request
                </button>
              </div>
            )}
          </div>
        </GlassCard>
      )}

      {error && <div className="mb-4 px-3 py-2 rounded-xl text-sm" style={{ background: '#FEF2F2', color: '#EF4444' }}>{error}</div>}
      {notice && <div className="mb-4 px-3 py-2 rounded-xl text-sm" style={{ background: '#FFFBEB', color: '#B45309' }}>{notice}</div>}

      <div className="space-y-4">
        {/* ── Stage 1: Add Policy ── */}
        <Section id="stage-policy" title="1 · Add Policy" desc="The patient's insurance policy and card this claim is filed under. Capture the identity details a TPA form needs and attach a scan of the policy or e-card."
          action={claim && canWrite ? <EditBtn onClick={openPolicyEdit} editing={editStage === 'policy'} /> : undefined}>
          {claim && editStage === 'policy' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div><label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>Provider</label>
                  <input type="text" value={pEditProvider} onChange={(e) => setPEditProvider(e.target.value)} className="w-full px-3 py-2.5 rounded-xl text-sm" style={inputStyle} /></div>
                <div><label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>Policy Number</label>
                  <input type="text" value={pEditPolicyNo} onChange={(e) => setPEditPolicyNo(e.target.value)} className="w-full px-3 py-2.5 rounded-xl text-sm" style={inputStyle} /></div>
                <div><label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>Member / Card ID</label>
                  <input type="text" value={pEditMember} onChange={(e) => setPEditMember(e.target.value)} className="w-full px-3 py-2.5 rounded-xl text-sm" style={inputStyle} /></div>
                <div><label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>Sum Insured (₹)</label>
                  <input type="number" min={0} value={pEditCoverage} onChange={(e) => setPEditCoverage(e.target.value)} className="w-full px-3 py-2.5 rounded-xl text-sm" style={inputStyle} /></div>
                <div><label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>Room Rent Cap (₹/day)</label>
                  <input type="number" min={0} value={pEditRoomCap} onChange={(e) => setPEditRoomCap(e.target.value)} className="w-full px-3 py-2.5 rounded-xl text-sm" style={inputStyle} /></div>
                <div><label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>Co-pay (%)</label>
                  <input type="number" min={0} max={100} value={pEditCopayPct} onChange={(e) => setPEditCopayPct(e.target.value)} className="w-full px-3 py-2.5 rounded-xl text-sm" style={inputStyle} /></div>
              </div>
              <div className="flex justify-end">
                <button onClick={savePolicyEdit} disabled={savingEdit}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: savingEdit ? '#94A3B8' : '#0D9488', minHeight: '44px' }}>
                  {savingEdit && <Loader2 className="w-4 h-4 animate-spin" />} Save Policy
                </button>
              </div>
            </div>
          ) : claim ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <Field label="Provider" value={claim.policy?.provider} />
                <Field label="Policy Number" value={claim.policy?.policy_no} />
                <Field label="Member / Card ID" value={claim.policy?.member_id || '—'} />
                <Field label="Coverage / Sum Insured" value={claim.policy?.coverage_amount != null ? <Money amount={claim.policy.coverage_amount} /> : '—'} />
                {claim.policy?.policyholder_name && (
                  <Field label="Policyholder" value={`${claim.policy.policyholder_name}${claim.policy.policyholder_relationship ? ` (${claim.policy.policyholder_relationship})` : ''}`} />
                )}
                {claim.policy?.copay_percent != null && <Field label="Co-pay" value={`${claim.policy.copay_percent}%`} />}
                {claim.policy?.corporate_name && (
                  <Field label="Corporate" value={`${claim.policy.corporate_name}${claim.policy.employee_id ? ` · Emp ${claim.policy.employee_id}` : ''}`} />
                )}
                {claim.policy?.room_rent_limit_per_day != null && (
                  <Field label="Room Rent Limit / day" value={<Money amount={claim.policy.room_rent_limit_per_day} />} />
                )}
                {claim.policy?.sub_limit_notes && <Field label="Sub-limits" value={claim.policy.sub_limit_notes} />}
              </div>

              <div className="pt-3" style={{ borderTop: '1px dashed #E2E8F0' }}>
                <p className="text-xs font-semibold mb-2" style={{ color: '#475569' }}>Policy Documents</p>
                {policyDocuments.length === 0 ? (
                  <p className="text-xs mb-2" style={{ color: '#94A3B8' }}>No documents uploaded yet.</p>
                ) : (
                  <div className="space-y-1 mb-3">
                    {policyDocuments.map((d) => (
                      <div key={d.id} className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ background: '#F8FAFC' }}>
                        <FileText className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#64748B' }} />
                        <span className="flex-1 truncate" style={{ color: '#0F172A' }}>{d.title}</span>
                        <span style={{ color: '#94A3B8' }}><DateText date={d.uploaded_at} /></span>
                      </div>
                    ))}
                  </div>
                )}
                {canWrite && (
                  <div className="flex gap-2 flex-wrap items-center">
                    <input type="text" value={docTitle} onChange={(e) => setDocTitle(e.target.value)}
                      placeholder="Document title" className="px-3 py-2 rounded-lg text-sm flex-1 min-w-32" style={inputStyle} />
                    <input type="file" accept="image/*,application/pdf" onChange={(e) => setDocFile(e.target.files?.[0] ?? null)} className="text-sm" />
                    <button onClick={handleUploadDoc} disabled={uploadingDoc || !docFile}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
                      style={{ border: '1px solid #0D9488', color: '#0D9488' }}>
                      {uploadingDoc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      Upload
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : !canWrite ? (
            <p className="text-xs" style={{ color: '#94A3B8' }}>You don&apos;t have permission to start a claim.</p>
          ) : (
            <div className="space-y-3">
              {!addingPolicy && policies.length > 0 && (
                <>
                  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
                    {policies.map((pol, i) => (
                      <button key={pol.id} onClick={() => chooseExistingPolicy(pol.id)} disabled={startingPolicyId !== null}
                        className="w-full text-left px-4 py-3 flex items-center justify-between gap-2"
                        style={{ borderBottom: i < policies.length - 1 ? '1px solid #F1F5F9' : 'none', minHeight: '44px' }}>
                        <div>
                          <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>{pol.provider}</p>
                          <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                            {pol.policy_no}{pol.coverage_amount ? ` · Cover ₹${pol.coverage_amount}` : ''}
                          </p>
                        </div>
                        {startingPolicyId === pol.id && <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#0D9488' }} />}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setAddingPolicy(true)} className="flex items-center gap-2 text-sm font-medium" style={{ color: '#0D9488' }}>
                    <Plus className="w-4 h-4" /> Add a new policy
                  </button>
                </>
              )}

              {addingPolicy && (
                <div className="space-y-3">
                  {policies.length > 0 && (
                    <button onClick={() => setAddingPolicy(false)} className="text-xs font-medium" style={{ color: '#64748B' }}>← Use an existing policy</button>
                  )}
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Insurance Provider <span style={{ color: '#EF4444' }}>*</span></label>
                    <Combobox value={newProvider} onChange={setNewProvider} options={initialProviders} placeholder="Search or type an insurer…" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Policy Number <span style={{ color: '#EF4444' }}>*</span></label>
                    <input type="text" value={newPolicyNo} onChange={(e) => setNewPolicyNo(e.target.value)} className="w-full px-3 py-3 rounded-xl text-sm" style={inputStyle} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Valid Till</label>
                      <input type="date" value={newValidTill} onChange={(e) => setNewValidTill(e.target.value)} className="w-full px-3 py-3 rounded-xl text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Sum Assured (₹)</label>
                      <input type="number" min={0} value={newCoverage} onChange={(e) => setNewCoverage(e.target.value)} className="w-full px-3 py-3 rounded-xl text-sm" style={inputStyle} />
                    </div>
                  </div>
                  {initialTpas.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>TPA</label>
                      <Select value={newTpaId} onChange={(e) => setNewTpaId(e.target.value)}>
                        <option value="">— None —</option>
                        {initialTpas.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </Select>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Room Rent Limit (₹/day)</label>
                      <input type="number" min={0} value={newRoomRentLimit} onChange={(e) => setNewRoomRentLimit(e.target.value)} className="w-full px-3 py-3 rounded-xl text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Sub-limit Notes</label>
                      <input type="text" value={newSubLimitNotes} onChange={(e) => setNewSubLimitNotes(e.target.value)} placeholder="e.g. Cataract capped at ₹40,000" className="w-full px-3 py-3 rounded-xl text-sm" style={inputStyle} />
                    </div>
                  </div>

                  <p className="text-xs font-semibold pt-1" style={{ color: '#64748B' }}>Insured &amp; policyholder</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Member / Card ID</label>
                      <input type="text" value={newMemberId} onChange={(e) => setNewMemberId(e.target.value)} className="w-full px-3 py-3 rounded-xl text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Co-pay (%)</label>
                      <input type="number" min={0} max={100} value={newCopayPercent} onChange={(e) => setNewCopayPercent(e.target.value)} className="w-full px-3 py-3 rounded-xl text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Policyholder Name</label>
                      <input type="text" value={newPolicyholder} onChange={(e) => setNewPolicyholder(e.target.value)} placeholder="If not the patient" className="w-full px-3 py-3 rounded-xl text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Relationship to Patient</label>
                      <Select value={newRelationship} onChange={(e) => setNewRelationship(e.target.value)}>
                        {['self','spouse','parent','child','sibling','other'].map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
                      </Select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Corporate / Group Scheme</label>
                      <input type="text" value={newCorporate} onChange={(e) => setNewCorporate(e.target.value)} placeholder="If corporate cashless" className="w-full px-3 py-3 rounded-xl text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Employee ID</label>
                      <input type="text" value={newEmployeeId} onChange={(e) => setNewEmployeeId(e.target.value)} className="w-full px-3 py-3 rounded-xl text-sm" style={inputStyle} />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button onClick={saveNewPolicyAndStart} disabled={savingPolicy}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
                      style={{ background: savingPolicy ? '#94A3B8' : '#0D9488', minHeight: '44px' }}>
                      {savingPolicy && <Loader2 className="w-4 h-4 animate-spin" />}
                      Save & Start Claim
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Section>

        {/* ── Stage 2: Eligibility Check ── */}
        <Section id="stage-eligibility" title="2 · Eligibility Check" desc="The pre-authorisation stage. Confirm the policy covers this treatment, log the TPA back-and-forth, and record the sanctioned amount — this approval is what lets treatment proceed cashless." locked={!claim}
          action={claim && canWrite && claim.eligibility_status !== 'pending' ? <EditBtn onClick={() => toggleEdit('eligibility')} editing={editStage === 'eligibility'} /> : undefined}>
          {claim && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>Estimated Amount (₹)</label>
                  <input type="number" min={0} value={estimatedAmount} onChange={(e) => setEstimatedAmount(e.target.value)}
                    disabled={claim.eligibility_status !== 'pending' && editStage !== 'eligibility'}
                    className="w-full px-3 py-2.5 rounded-xl text-sm" style={inputStyle} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>Diagnosis / Treatment</label>
                  <input type="text" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)}
                    disabled={claim.eligibility_status !== 'pending' && editStage !== 'eligibility'}
                    className="w-full px-3 py-2.5 rounded-xl text-sm" style={inputStyle} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>Room Category Requested</label>
                  <input type="text" value={roomCategory} onChange={(e) => setRoomCategory(e.target.value)}
                    disabled={claim.eligibility_status !== 'pending' && editStage !== 'eligibility'}
                    className="w-full px-3 py-2.5 rounded-xl text-sm" style={inputStyle} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>ICD-10 Code</label>
                  <input type="text" value={icdCode} onChange={(e) => setIcdCode(e.target.value)}
                    disabled={claim.eligibility_status !== 'pending' && editStage !== 'eligibility'} placeholder="e.g. K35.80"
                    className="w-full px-3 py-2.5 rounded-xl text-sm" style={inputStyle} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>Admission Type</label>
                  <Select value={admissionType} onChange={(e) => setAdmissionType(e.target.value as ClaimAdmissionType | '')} disabled={claim.eligibility_status !== 'pending' && editStage !== 'eligibility'}>
                    <option value="">— Select —</option>
                    <option value="planned">Planned</option>
                    <option value="emergency">Emergency</option>
                  </Select>
                </div>
              </div>

              {/* Cost-head breakdown (as required on a TPA pre-auth form) */}
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: '#64748B' }}>Estimated Cost Breakdown</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {([['Room', costRoom, setCostRoom], ['ICU', costIcu, setCostIcu], ['OT', costOt, setCostOt], ['Professional', costProf, setCostProf], ['Pharmacy', costPharm, setCostPharm], ['Implants', costImplants, setCostImplants], ['Other', costOther, setCostOther]] as [string, string, (v: string) => void][]).map(([lbl, val, set]) => (
                    <div key={lbl}>
                      <label className="block text-[11px] mb-0.5" style={{ color: '#94A3B8' }}>{lbl}</label>
                      <input type="number" min={0} value={val} onChange={(e) => set(e.target.value)}
                        disabled={claim.eligibility_status !== 'pending' && editStage !== 'eligibility'}
                        className="w-full px-2.5 py-2 rounded-lg text-sm" style={inputStyle} />
                    </div>
                  ))}
                </div>
              </div>

              {claim.policy?.room_rent_limit_per_day != null && (
                <p className="text-xs" style={{ color: '#94A3B8' }}>
                  Policy room rent cap: <Money amount={claim.policy.room_rent_limit_per_day} className="font-medium" /> / day
                  {claim.policy.sub_limit_notes ? ` · Sub-limits: ${claim.policy.sub_limit_notes}` : ''}
                </p>
              )}

              {claim.eligibility_status === 'pending' && canWrite && (
                <div className="flex gap-2 flex-wrap">
                  <button onClick={saveEligibilityFields} disabled={savingFields}
                    className="px-3 py-2 rounded-lg text-xs font-medium" style={{ border: '1px solid #E2E8F0', color: '#475569' }}>
                    {savingFields ? 'Saving…' : 'Save Fields'}
                  </button>
                </div>
              )}

              {/* Edit mode (after eligibility already decided) — correct the fields + sanctioned amount */}
              {editStage === 'eligibility' && (
                <div className="pt-3 flex flex-wrap items-end gap-3" style={{ borderTop: '1px dashed #E2E8F0' }}>
                  {claim.eligibility_status === 'approved' && (
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>Sanctioned Amount (₹)</label>
                      <input type="number" min={0} value={approvedAmount} onChange={(e) => setApprovedAmount(e.target.value)}
                        className="px-3 py-2.5 rounded-xl text-sm" style={inputStyle} />
                    </div>
                  )}
                  <button onClick={() => saveClaimFields({
                    estimated_amount: estimatedAmount ? parseFloat(estimatedAmount) : null,
                    diagnosis: diagnosis || null, room_category_requested: roomCategory || null,
                    icd_code: icdCode || null, admission_type: admissionType || null,
                    cost_breakdown: costBreakdownPayload(),
                    ...(claim.eligibility_status === 'approved' && approvedAmount ? { eligibility_approved_amount: parseFloat(approvedAmount) } : {}),
                  })} disabled={savingEdit}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: savingEdit ? '#94A3B8' : '#0D9488', minHeight: '44px' }}>
                    {savingEdit && <Loader2 className="w-4 h-4 animate-spin" />} Save changes
                  </button>
                </div>
              )}

              {/* Insurer identifiers — arrive with the TPA's Authorisation Letter,
                  editable at any stage (not locked with the eligibility fields). */}
              <div className="pt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end" style={{ borderTop: '1px dashed #E2E8F0' }}>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>Pre-Auth / AL Number</label>
                  <input type="text" value={preauthNumber} onChange={(e) => setPreauthNumber(e.target.value)}
                    placeholder="TPA authorisation number" className="w-full px-3 py-2.5 rounded-xl text-sm" style={inputStyle} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>Insurer / TPA Claim No.</label>
                  <input type="text" value={insurerClaimNumber} onChange={(e) => setInsurerClaimNumber(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl text-sm" style={inputStyle} />
                </div>
                {canWrite && (
                  <button onClick={saveIdentifiers} disabled={savingIds}
                    className="px-3 py-2.5 rounded-lg text-xs font-medium" style={{ border: '1px solid #0D9488', color: '#0D9488' }}>
                    {savingIds ? 'Saving…' : 'Save Numbers'}
                  </button>
                )}
              </div>

              {/* Enquiry log */}
              <div className="pt-3" style={{ borderTop: '1px dashed #E2E8F0' }}>
                <p className="text-xs font-semibold mb-2" style={{ color: '#475569' }}>Enquiry Log</p>
                {notes.length === 0 ? (
                  <p className="text-xs mb-2" style={{ color: '#94A3B8' }}>No enquiries logged yet.</p>
                ) : (
                  <div className="space-y-2 mb-3">
                    {notes.map((n) => (
                      <div key={n.id} className="text-xs px-3 py-2 rounded-lg" style={{ background: '#F8FAFC', border: '1px solid #F1F5F9' }}>
                        {editingNoteId === n.id ? (
                          <div className="flex gap-2 items-center">
                            <input type="text" value={editingNoteText} onChange={(e) => setEditingNoteText(e.target.value)}
                              className="flex-1 px-2 py-1.5 rounded-lg text-xs" style={inputStyle} />
                            <button onClick={() => handleSaveNoteEdit(n.id)} className="px-2 py-1 rounded text-xs font-medium" style={{ color: '#0D9488' }}>Save</button>
                            <button onClick={() => setEditingNoteId(null)} className="px-2 py-1 rounded text-xs" style={{ color: '#94A3B8' }}>Cancel</button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center justify-between gap-2 mb-0.5">
                              <span className="font-medium" style={{ color: '#0F172A' }}>{n.author?.full_name ?? 'Staff'}</span>
                              <div className="flex items-center gap-2">
                                <span style={{ color: '#94A3B8' }}>{fmtDateTime(n.created_at)}</span>
                                {canWrite && (
                                  <>
                                    <button onClick={() => { setEditingNoteId(n.id); setEditingNoteText(n.note) }} title="Edit"><Pencil className="w-3 h-3" style={{ color: '#94A3B8' }} /></button>
                                    <button onClick={() => handleDeleteNote(n.id)} title="Delete"><Trash2 className="w-3 h-3" style={{ color: '#EF4444' }} /></button>
                                  </>
                                )}
                              </div>
                            </div>
                            <p style={{ color: '#475569' }}>{n.note}</p>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {canWrite && (
                  <div className="flex gap-2">
                    <input type="text" value={noteText} onChange={(e) => setNoteText(e.target.value)}
                      placeholder="e.g. Called TPA — asked to confirm room category…"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddNote() }}
                      className="flex-1 px-3 py-2 rounded-lg text-sm" style={inputStyle} />
                    <button onClick={handleAddNote} disabled={addingNote || !noteText.trim()}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap"
                      style={{ border: '1px solid #0D9488', color: '#0D9488' }}>
                      {addingNote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquarePlus className="w-3.5 h-3.5" />}
                      Add
                    </button>
                  </div>
                )}
              </div>

              {/* Decision */}
              {claim.eligibility_status === 'pending' ? (
                canWrite && (
                  <div className="pt-3" style={{ borderTop: '1px dashed #E2E8F0' }}>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>Sanctioned Amount (₹) — if approving</label>
                        <input type="number" min={0} value={approvedAmount} onChange={(e) => setApprovedAmount(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl text-sm" style={inputStyle} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>Denial reason — if rejecting</label>
                        <input type="text" value={denialReason} onChange={(e) => setDenialReason(e.target.value)}
                          placeholder="e.g. Ailment in waiting period" className="w-full px-3 py-2.5 rounded-xl text-sm" style={inputStyle} />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => decide('rejected')} disabled={decidingEligibility !== null}
                        className="px-4 py-2.5 rounded-xl text-sm font-medium" style={{ border: '1px solid #FECACA', color: '#DC2626', minHeight: '44px' }}>
                        {decidingEligibility === 'rejected' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Not Eligible'}
                      </button>
                      <button onClick={() => decide('approved')} disabled={decidingEligibility !== null}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
                        style={{ background: decidingEligibility !== null ? '#94A3B8' : '#0D9488', minHeight: '44px' }}>
                        {decidingEligibility === 'approved' && <Loader2 className="w-4 h-4 animate-spin" />}
                        Approve
                      </button>
                    </div>
                  </div>
                )
              ) : (
                <div className="pt-3 grid grid-cols-2 sm:grid-cols-3 gap-4" style={{ borderTop: '1px dashed #E2E8F0' }}>
                  <Field label="Decision" value={claim.eligibility_status === 'approved' ? 'Approved' : 'Rejected'} />
                  {claim.eligibility_status === 'approved' && (
                    <Field label="Sanctioned Amount" value={<Money amount={claim.eligibility_approved_amount ?? 0} />} />
                  )}
                  {claim.eligibility_decided_at && <Field label="Decided On" value={<DateText date={claim.eligibility_decided_at} />} />}
                </div>
              )}
            </div>
          )}
        </Section>

        {/* ── Stage 3: Claim ── */}
        <Section id="stage-claim" title="3 · Claim" desc="Raise the final claim on the actual treatment cost, submit it to the TPA, and record their approval or rejection." locked={!claim || claim.eligibility_status !== 'approved'}
          lockedNote={claim?.eligibility_status === 'rejected' ? 'Eligibility was rejected — this claim cannot proceed.' : 'Approve eligibility first.'}
          action={claim && canWrite && ['raised', 'submitted', 'approved', 'settled'].includes(claim.status) ? <EditBtn onClick={() => toggleEdit('claim')} editing={editStage === 'claim'} /> : undefined}>
          {claim && claim.eligibility_status === 'approved' && editStage === 'claim' ? (
            <div className="flex flex-wrap items-end gap-3">
              <div><label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>Claim Amount (₹)</label>
                <input type="number" min={0} value={claimAmount} onChange={(e) => setClaimAmount(e.target.value)} className="px-3 py-2.5 rounded-xl text-sm" style={inputStyle} /></div>
              <div><label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>Approved Amount (₹)</label>
                <input type="number" min={0} value={finalApprovedAmount} onChange={(e) => setFinalApprovedAmount(e.target.value)} className="px-3 py-2.5 rounded-xl text-sm" style={inputStyle} /></div>
              <div><label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>Patient Co-pay (₹)</label>
                <input type="number" min={0} value={copay} onChange={(e) => setCopay(e.target.value)} className="px-3 py-2.5 rounded-xl text-sm" style={inputStyle} /></div>
              <button onClick={() => saveClaimFields({
                claim_amount: claimAmount ? parseFloat(claimAmount) : null,
                approved_amount: finalApprovedAmount ? parseFloat(finalApprovedAmount) : null,
                copay_amount: copay ? parseFloat(copay) : null,
              })} disabled={savingEdit}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: savingEdit ? '#94A3B8' : '#0D9488', minHeight: '44px' }}>
                {savingEdit && <Loader2 className="w-4 h-4 animate-spin" />} Save changes
              </button>
            </div>
          ) : claim && claim.eligibility_status === 'approved' && (
            <div className="space-y-4">
              {claim.status === 'awaiting_eligibility' && canWrite && (
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>Claim Amount (₹) <span style={{ color: '#EF4444' }}>*</span></label>
                  <input type="number" min={0} value={claimAmount} onChange={(e) => setClaimAmount(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl text-sm mb-2" style={inputStyle} />
                  <p className="text-xs mb-2" style={{ color: '#94A3B8' }}>The finalized amount being formally raised, replacing the earlier estimate.</p>
                  <button onClick={raiseClaim} disabled={claimSubmitting !== null}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
                    style={{ background: claimSubmitting !== null ? '#94A3B8' : '#0D9488', minHeight: '44px' }}>
                    {claimSubmitting === 'raise' && <Loader2 className="w-4 h-4 animate-spin" />} Raise Claim
                  </button>
                </div>
              )}

              {claim.status === 'raised' && (
                <div className="space-y-3">
                  <Field label="Claim Amount" value={<Money amount={claim.claim_amount ?? 0} />} />
                  {canWrite && (
                    <button onClick={markSubmitted} disabled={claimSubmitting !== null}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
                      style={{ background: claimSubmitting !== null ? '#94A3B8' : '#0D9488', minHeight: '44px' }}>
                      {claimSubmitting === 'submit' && <Loader2 className="w-4 h-4 animate-spin" />} Submit Claim
                    </button>
                  )}
                </div>
              )}

              {claim.status === 'submitted' && (
                <div className="space-y-3">
                  <Field label="Claim Amount" value={<Money amount={claim.claim_amount ?? 0} />} />
                  {canWrite && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>Approved Amount (₹) <span style={{ color: '#EF4444' }}>*</span></label>
                          <input type="number" min={0} value={finalApprovedAmount} onChange={(e) => setFinalApprovedAmount(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-xl text-sm" style={inputStyle} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>Patient Co-pay (₹)</label>
                          <input type="number" min={0} value={copay} onChange={(e) => setCopay(e.target.value)}
                            placeholder={`Suggested ₹${suggestedCopay.toFixed(0)}`}
                            className="w-full px-3 py-2.5 rounded-xl text-sm" style={inputStyle} />
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => decideClaim('rejected')} disabled={claimSubmitting !== null}
                          className="px-4 py-2.5 rounded-xl text-sm font-medium" style={{ border: '1px solid #FECACA', color: '#DC2626', minHeight: '44px' }}>
                          {claimSubmitting === 'rejected' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Mark Rejected'}
                        </button>
                        <button onClick={() => decideClaim('approved')} disabled={claimSubmitting !== null}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
                          style={{ background: claimSubmitting !== null ? '#94A3B8' : '#0D9488', minHeight: '44px' }}>
                          {claimSubmitting === 'approved' && <Loader2 className="w-4 h-4 animate-spin" />} Mark Approved
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {(claim.status === 'approved' || claim.status === 'settled') && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Field label="Claim Amount" value={<Money amount={claim.claim_amount ?? 0} />} />
                  <Field label="Approved Amount" value={<Money amount={claim.approved_amount ?? 0} />} />
                  <Field label="Patient Co-pay" value={<Money amount={claim.copay_amount} />} />
                  {claim.approved_at && <Field label="Approved On" value={<DateText date={claim.approved_at} />} />}
                </div>
              )}
            </div>
          )}
        </Section>

        {/* ── Stage 4: Settlement ── */}
        <Section id="stage-settlement" title="4 · Settlement" desc="Record the money actually received and where it landed, itemise any deductions the TPA made, and resolve any shortfall against the approved amount." locked={!claim || !['approved', 'settled'].includes(claim.status)}
          lockedNote="Approve the claim first."
          action={claim && canWrite && claim.status === 'settled' ? <EditBtn onClick={() => toggleEdit('settlement')} editing={editStage === 'settlement'} /> : undefined}>
          {claim && claim.status === 'settled' && editStage === 'settlement' ? (
            <div className="flex flex-wrap items-end gap-3">
              <div><label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>Settled (gross ₹)</label>
                <input type="number" min={0} value={settledAmount} onChange={(e) => setSettledAmount(e.target.value)} className="px-3 py-2.5 rounded-xl text-sm" style={inputStyle} /></div>
              <div><label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>TDS (₹)</label>
                <input type="number" min={0} value={tdsAmount} onChange={(e) => setTdsAmount(e.target.value)} className="px-3 py-2.5 rounded-xl text-sm" style={inputStyle} /></div>
              <div><label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>UTR / Reference</label>
                <input type="text" value={settlementUtr} onChange={(e) => setSettlementUtr(e.target.value)} className="px-3 py-2.5 rounded-xl text-sm" style={inputStyle} /></div>
              <div className="flex-1 min-w-40"><label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>Notes</label>
                <input type="text" value={settlementNotes} onChange={(e) => setSettlementNotes(e.target.value)} className="w-full px-3 py-2.5 rounded-xl text-sm" style={inputStyle} /></div>
              <button onClick={() => saveClaimFields({
                settled_amount: settledAmount ? parseFloat(settledAmount) : null,
                tds_amount: tdsAmount ? parseFloat(tdsAmount) : null,
                settlement_utr: settlementUtr || null, settlement_notes: settlementNotes || null,
              })} disabled={savingEdit}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: savingEdit ? '#94A3B8' : '#0D9488', minHeight: '44px' }}>
                {savingEdit && <Loader2 className="w-4 h-4 animate-spin" />} Save changes
              </button>
            </div>
          ) : claim && ['approved', 'settled'].includes(claim.status) && (
            claim.status === 'settled' ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Field label="Settled (gross)" value={<Money amount={claim.settled_amount ?? 0} />} />
                  {claim.tds_amount != null && claim.tds_amount > 0 && (
                    <Field label="TDS withheld" value={<Money amount={claim.tds_amount} />} />
                  )}
                  <Field label="Account" value={claim.settlement_account?.account_name ?? '—'} />
                  {claim.settlement_utr && <Field label="UTR / Reference" value={claim.settlement_utr} />}
                  {claim.settled_at && <Field label="Settled On" value={<DateText date={claim.settled_at} />} />}
                  {claim.shortfall_amount != null && claim.shortfall_amount > 0 && (
                    <Field label="Shortfall" value={<span style={{ color: '#B23A1E' }}><Money amount={claim.shortfall_amount} /> · {claim.shortfall_resolution === 'write_off' ? 'written off' : 'billed to patient'}</span>} />
                  )}
                  {claim.settlement_notes && <Field label="Notes" value={claim.settlement_notes} />}
                </div>
                {deductions.length > 0 && (
                  <div className="pt-3" style={{ borderTop: '1px dashed #E2E8F0' }}>
                    <p className="text-xs font-semibold mb-2" style={{ color: '#475569' }}>Disallowances / Deductions</p>
                    <div className="space-y-1">
                      {deductions.map((d) => (
                        <div key={d.id} className="flex justify-between items-center text-xs px-3 py-2 rounded-lg" style={{ background: '#F8FAFC' }}>
                          <span style={{ color: '#0F172A' }}>{d.description} <span style={{ color: '#94A3B8' }}>· {DEDUCTION_LABEL[d.deduction_type]}</span></span>
                          <Money amount={d.amount} className="font-medium" style={{ color: '#B23A1E' }} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {settlementPayments.length > 0 && (
                  <div className="pt-3" style={{ borderTop: '1px dashed #E2E8F0' }}>
                    <p className="text-xs font-semibold mb-2" style={{ color: '#475569' }}>Payments Posted to Bills</p>
                    <div className="space-y-1">
                      {settlementPayments.map((p) => (
                        <div key={p.id} className="flex justify-between text-xs px-3 py-2 rounded-lg" style={{ background: '#F8FAFC' }}>
                          <span style={{ color: '#64748B' }}><DateText date={p.created_at} /></span>
                          <Money amount={p.amount} className="font-medium" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : canWrite ? (
              <div className="space-y-3">
                {initialBankAccounts.length === 0 && (
                  <p className="text-xs flex items-center gap-1.5" style={{ color: '#B45309' }}>
                    <AlertTriangle className="w-3.5 h-3.5" /> No bank accounts set up yet — add one from the Insurance page first.
                  </p>
                )}

                {/* Disallowance / deduction lines */}
                <div>
                  <p className="text-xs font-semibold mb-2" style={{ color: '#64748B' }}>Disallowances / Deductions</p>
                  {deductions.length > 0 && (
                    <div className="space-y-1 mb-2">
                      {deductions.map((d) => (
                        <div key={d.id} className="flex justify-between items-center text-xs px-3 py-2 rounded-lg" style={{ background: '#F8FAFC' }}>
                          <span style={{ color: '#0F172A' }}>{d.description} <span style={{ color: '#94A3B8' }}>· {DEDUCTION_LABEL[d.deduction_type]}</span></span>
                          <span className="flex items-center gap-2">
                            <Money amount={d.amount} className="font-medium" style={{ color: '#B23A1E' }} />
                            <button onClick={() => handleDeleteDeduction(d.id)} title="Remove"><Trash2 className="w-3 h-3" style={{ color: '#EF4444' }} /></button>
                          </span>
                        </div>
                      ))}
                      <p className="text-xs text-right" style={{ color: '#64748B' }}>Total deductions: <Money amount={deductions.reduce((s, d) => s + d.amount, 0)} className="font-semibold" /></p>
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap items-end">
                    <input type="text" value={dedDesc} onChange={(e) => setDedDesc(e.target.value)} placeholder="Reason (e.g. non-medical consumables)" className="flex-1 min-w-40 px-3 py-2 rounded-lg text-sm" style={inputStyle} />
                    <Select value={dedType} onChange={(e) => setDedType(e.target.value as DeductionType)} className="w-40">
                      {(Object.keys(DEDUCTION_LABEL) as DeductionType[]).map((t) => <option key={t} value={t}>{DEDUCTION_LABEL[t]}</option>)}
                    </Select>
                    <input type="number" min={0} value={dedAmount} onChange={(e) => setDedAmount(e.target.value)} placeholder="₹" className="w-24 px-3 py-2 rounded-lg text-sm" style={inputStyle} />
                    <button onClick={handleAddDeduction} disabled={addingDed || !dedDesc.trim() || !(parseFloat(dedAmount) > 0)}
                      className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium" style={{ border: '1px solid #0D9488', color: '#0D9488' }}>
                      {addingDed ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2" style={{ borderTop: '1px dashed #E2E8F0' }}>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>Settled Amount — gross (₹) <span style={{ color: '#EF4444' }}>*</span></label>
                    <input type="number" min={0} value={settledAmount} onChange={(e) => setSettledAmount(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl text-sm" style={inputStyle} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>TDS withheld (₹)</label>
                    <input type="number" min={0} value={tdsAmount} onChange={(e) => setTdsAmount(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl text-sm" style={inputStyle} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>Bank Account <span style={{ color: '#EF4444' }}>*</span></label>
                    <Select value={settlementAccountId} onChange={(e) => setSettlementAccountId(e.target.value)}>
                      <option value="">— Select account —</option>
                      {initialBankAccounts.map((a) => <option key={a.id} value={a.id}>{a.account_name}</option>)}
                    </Select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>UTR / Payment Reference</label>
                    <input type="text" value={settlementUtr} onChange={(e) => setSettlementUtr(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl text-sm" style={inputStyle} />
                  </div>
                </div>

                {/* Shortfall resolution — the revenue-leak guard */}
                {settleShortfall > 0 && (
                  <div className="p-3 rounded-xl" style={{ background: '#FAE7E0', border: '1px solid #B23A1E' }}>
                    <p className="text-xs font-semibold mb-1" style={{ color: '#B23A1E' }}>
                      Settlement is <Money amount={settleShortfall} className="font-bold" /> short of the <Money amount={settleCovered} /> covered at eligibility.
                    </p>
                    <p className="text-xs mb-2" style={{ color: '#7A2E1A' }}>How is the shortfall resolved?</p>
                    <div className="flex gap-2 flex-wrap">
                      {(['write_off', 'recover_from_patient'] as ShortfallResolution[]).map((r) => (
                        <button key={r} onClick={() => setShortfallResolution(r)}
                          className="px-3 py-2 rounded-lg text-xs font-medium"
                          style={shortfallResolution === r
                            ? { background: '#0D9488', color: '#fff' }
                            : { background: '#fff', color: '#475569', border: '1px solid #E2E8F0' }}>
                          {r === 'write_off' ? 'Hospital write-off' : 'Recover from patient'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>Notes</label>
                  <textarea value={settlementNotes} onChange={(e) => setSettlementNotes(e.target.value)} rows={2}
                    className="w-full px-3 py-2.5 rounded-xl text-sm resize-none" style={inputStyle} />
                </div>
                <div className="flex justify-end">
                  <button onClick={handleSettle} disabled={settling}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
                    style={{ background: settling ? '#94A3B8' : '#0D9488', minHeight: '44px' }}>
                    {settling && <Loader2 className="w-4 h-4 animate-spin" />} Record Settlement
                  </button>
                </div>
              </div>
            ) : null
          )}
        </Section>

        {/* ── Rejected banner ── */}
        {isRejected && claim && (
          <GlassCard className="p-4" style={{ background: 'rgba(220,38,38,0.04)', border: '1px solid rgba(220,38,38,0.2)' }}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-sm font-semibold mb-2" style={{ color: '#DC2626' }}>Rejected at {rejectedAtLabel}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Field label="Rejected On" value={claim.rejected_at ? <DateText date={claim.rejected_at} /> : (claim.eligibility_decided_at ? <DateText date={claim.eligibility_decided_at} /> : '—')} />
                  <Field label="Denial Reason" value={claim.denial_reason || claim.remarks || '—'} />
                </div>
              </div>
              {canWrite && (
                <button onClick={handleAppeal} disabled={appealing}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ border: '1px solid #0D9488', color: '#0D9488', minHeight: '44px' }}>
                  {appealing && <Loader2 className="w-4 h-4 animate-spin" />} Appeal / Re-open
                </button>
              )}
            </div>
          </GlassCard>
        )}

        {/* ── History ── */}
        {claim && (
          <Section id="stage-history" title="History" desc="Every action taken on this claim — stage changes, enquiry notes and edits — in order.">
            {history.length === 0 ? (
              <p className="text-xs" style={{ color: '#94A3B8' }}>No history yet.</p>
            ) : (
              <div className="space-y-1.5">
                {history.map((h) => (
                  <div key={`${h.kind}-${h.id}`} className="flex items-start justify-between gap-2 text-xs px-3 py-2 rounded-lg" style={{ background: '#F8FAFC' }}>
                    <div className="min-w-0">
                      <span className="font-medium" style={{ color: '#0F172A' }}>
                        {h.kind === 'note' ? `Note (${h.stage})` : h.action}
                      </span>
                      {h.note && <p style={{ color: '#64748B' }}>{h.note}</p>}
                      {h.actor_name && <span style={{ color: '#94A3B8' }}> — {h.actor_name}</span>}
                    </div>
                    <span className="flex-shrink-0" style={{ color: '#94A3B8' }}>{fmtDateTime(h.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}
      </div>
    </div>
  )
}
