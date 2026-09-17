export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import { listDepartments } from '@/app/actions/departments'
import PageHeader from '@/components/ui/PageHeader'
import DepartmentManager from './_components/DepartmentManager'
import VaccineLimitSetting from './_components/VaccineLimitSetting'
import { getVaccineDailyWarnLimit } from '@/app/actions/vaccination'

export default async function DepartmentsSettingsPage() {
  const actor = await getActorProfile()
  if (!hasPermission(actor.role, 'departments:manage')) redirect('/dashboard')

  const [departments, vaccineLimit] = await Promise.all([listDepartments(), getVaccineDailyWarnLimit()])

  return (
    <div>
      <PageHeader
        title="Departments"
        subtitle="Manage clinical departments and assign specialty templates."
      />
      <DepartmentManager initialDepartments={departments} />
      {departments.some((d) => d.clinical_template === 'paediatrics') && <VaccineLimitSetting initial={vaccineLimit} />}
    </div>
  )
}
