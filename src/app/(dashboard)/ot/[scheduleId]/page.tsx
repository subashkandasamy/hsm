export const dynamic = 'force-dynamic'
import { notFound } from 'next/navigation'
import { getSchedule } from '@/app/actions/ot'
import { getWardBoard } from '@/app/actions/wards'
import OtDetailClient from './_components/OtDetailClient'

interface Props { params: Promise<{ scheduleId: string }> }

export default async function OtDetailPage({ params }: Props) {
  const { scheduleId } = await params
  const [schedule, wardBoard] = await Promise.all([
    getSchedule(scheduleId),
    getWardBoard(),
  ])
  if (!schedule) notFound()
  return <OtDetailClient schedule={schedule} wardBoard={wardBoard} />
}
