export const dynamic = 'force-dynamic'
import { listPatientsPage } from '@/app/actions/patients'
import PatientsClient from './_components/PatientsClient'

interface Props { searchParams: Promise<{ q?: string; page?: string; size?: string }> }

export default async function PatientsPage({ searchParams }: Props) {
  const sp = await searchParams
  const first = await listPatientsPage({ q: sp.q, page: Number(sp.page) || 1, size: Number(sp.size) || undefined })
  return <PatientsClient initial={first} initialQuery={sp.q ?? ''} />
}
