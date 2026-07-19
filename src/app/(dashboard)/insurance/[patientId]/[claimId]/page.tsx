export const dynamic = 'force-dynamic'
import { notFound } from 'next/navigation'
import {
  getClaim, listClaimNotes, listClaimHistory, listClaimSettlementPayments,
  listPolicies, listTpas, listProviders, listBankAccounts, listPolicyDocuments, listDeductions,
  listChecklist, listEnhancements, listInsuranceOwners,
} from '@/app/actions/insurance'
import { getPatient } from '@/app/actions/patients'
import ClaimStepperView from './_components/ClaimStepperView'

interface Props { params: Promise<{ patientId: string; claimId: string }> }

export default async function InsuranceClaimPage({ params }: Props) {
  const { patientId, claimId } = await params
  const [claim, notes, history, patient, tpas, providers, bankAccounts, deductions, checklist, enhancements, owners] = await Promise.all([
    getClaim(claimId),
    listClaimNotes(claimId),
    listClaimHistory(claimId),
    getPatient(patientId),
    listTpas(),
    listProviders(),
    listBankAccounts(),
    listDeductions(claimId),
    listChecklist(claimId),
    listEnhancements(claimId),
    listInsuranceOwners(),
  ])
  if (!claim || !patient) notFound()

  const [policies, settlementPayments, policyDocuments] = await Promise.all([
    listPolicies(patientId),
    claim.status === 'settled' ? listClaimSettlementPayments(claimId) : Promise.resolve([]),
    listPolicyDocuments(claim.policy_id),
  ])

  const encounterScope = claim.admission_id
    ? { type: 'admission' as const, id: claim.admission_id }
    : claim.visit_id
      ? { type: 'visit' as const, id: claim.visit_id }
      : { type: 'bill' as const, id: claim.bill_id! }

  return (
    <ClaimStepperView
      patientId={patientId}
      patientName={patient.full_name}
      encounterScope={encounterScope}
      treatmentValue={null}
      initialClaim={claim}
      initialPolicies={policies}
      initialTpas={tpas.filter((t) => t.is_active)}
      initialProviders={providers.map((p) => p.name)}
      initialBankAccounts={bankAccounts.filter((a) => a.is_active)}
      initialNotes={notes}
      initialHistory={history}
      initialSettlementPayments={settlementPayments}
      initialPolicyDocuments={policyDocuments}
      initialDeductions={deductions}
      initialChecklist={checklist}
      initialEnhancements={enhancements}
      owners={owners}
    />
  )
}
