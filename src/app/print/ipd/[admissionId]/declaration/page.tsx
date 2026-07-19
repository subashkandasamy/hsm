import { notFound } from 'next/navigation'
import { getAdmission } from '@/app/actions/ipd'
import { getDeclaration } from '@/app/actions/ipdDeclaration'
import { getIpdConfig } from '@/app/actions/ipdConfig'
import { DEFAULT_DECLARATION_TEMPLATE } from '@/lib/ipdDeclarationTemplate'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import PrintDeclaration from './PrintDeclaration'

interface Props { params: Promise<{ admissionId: string }> }

export default async function PrintDeclarationPage({ params }: Props) {
  const { admissionId } = await params

  const [admission, declaration, config, tenantProfile] = await Promise.all([
    getAdmission(admissionId),
    getDeclaration(admissionId),
    getIpdConfig(),
    getTenantProfile(),
  ])

  if (!admission) notFound()

  // A declaration already exists (signed or manual-pending) — always show the
  // exact text that was in force when it was created, not today's template.
  // Otherwise (first print, nothing signed yet) show the tenant's current template.
  const text = declaration?.declaration_text_snapshot
    || config?.declaration_template
    || DEFAULT_DECLARATION_TEMPLATE

  return (
    <PrintDeclaration
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admission={admission as any}
      declaration={declaration}
      declarationText={text}
      tenantProfile={tenantProfile}
    />
  )
}
