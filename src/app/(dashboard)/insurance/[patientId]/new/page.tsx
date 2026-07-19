export const dynamic = 'force-dynamic'
import { notFound } from 'next/navigation'
import { getPatient } from '@/app/actions/patients'
import { getAdmission } from '@/app/actions/ipd'
import { getVisit } from '@/app/actions/opd'
import { listPolicies, listTpas, listProviders, listBankAccounts, listInsuranceOwners } from '@/app/actions/insurance'
import { createClient } from '@/lib/supabase/server'
import ClaimStepperView from '../[claimId]/_components/ClaimStepperView'

interface Props {
  params: Promise<{ patientId: string }>
  searchParams: Promise<{ type?: string; id?: string }>
}

export default async function NewClaimPage({ params, searchParams }: Props) {
  const { patientId } = await params
  const { type, id } = await searchParams
  if ((type !== 'admission' && type !== 'visit' && type !== 'bill') || !id) notFound()

  const [patient, policies, tpas, providers, bankAccounts, owners, encounter] = await Promise.all([
    getPatient(patientId),
    listPolicies(patientId),
    listTpas(),
    listProviders(),
    listBankAccounts(),
    listInsuranceOwners(),
    type === 'admission' ? getAdmission(id)
      : type === 'visit' ? getVisit(id)
      : createClient().then((s) => s.from('bills').select('id').eq('id', id).maybeSingle().then((r) => r.data)),
  ])
  if (!patient || !encounter) notFound()

  return (
    <ClaimStepperView
      patientId={patientId}
      patientName={patient.full_name}
      encounterScope={{ type, id }}
      treatmentValue={type === 'admission' ? (encounter as { treatment_value?: number | null }).treatment_value ?? null : null}
      initialClaim={null}
      initialPolicies={policies}
      initialTpas={tpas.filter((t) => t.is_active)}
      initialProviders={providers.map((p) => p.name)}
      initialBankAccounts={bankAccounts.filter((a) => a.is_active)}
      initialNotes={[]}
      initialHistory={[]}
      initialSettlementPayments={[]}
      initialPolicyDocuments={[]}
      initialDeductions={[]}
      initialChecklist={[]}
      initialEnhancements={[]}
      owners={owners}
    />
  )
}
