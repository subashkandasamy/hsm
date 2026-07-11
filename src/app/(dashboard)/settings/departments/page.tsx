export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import { listDepartments } from '@/app/actions/departments'
import PageHeader from '@/components/ui/PageHeader'
import DepartmentManager from './_components/DepartmentManager'

export default async function DepartmentsSettingsPage() {
  const actor = await getActorProfile()
  if (!hasPermission(actor.role, 'departments:manage')) redirect('/dashboard')

  const departments = await listDepartments()

  return (
    <div>
      <PageHeader
        title="Departments"
        subtitle="Manage clinical departments and assign specialty templates."
      />
      <DepartmentManager initialDepartments={departments} />
    </div>
  )
}
