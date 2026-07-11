export const dynamic = 'force-dynamic'
import { notFound } from 'next/navigation'
import { getSchedule } from '@/app/actions/ot'
import { listDrugs } from '@/app/actions/pharmacy'
import { getWardBoard } from '@/app/actions/wards'
import OtDetailClient from './_components/OtDetailClient'

interface Props { params: Promise<{ scheduleId: string }> }

export default async function OtDetailPage({ params }: Props) {
  const { scheduleId } = await params
  const [schedule, drugs, wardBoard] = await Promise.all([
    getSchedule(scheduleId),
    listDrugs(),
    getWardBoard(),
  ])
  if (!schedule) notFound()
  return <OtDetailClient schedule={schedule} drugs={drugs} wardBoard={wardBoard} />
}
