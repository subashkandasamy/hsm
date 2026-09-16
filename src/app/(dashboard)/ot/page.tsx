export const dynamic = 'force-dynamic'
import { listSchedules, listRooms, listDoctors } from '@/app/actions/ot'
import OtClient from './_components/OtClient'
import { istToday } from '@/lib/istDate'

export default async function OtPage() {
  const today = istToday()
  const [schedules, rooms, doctors] = await Promise.all([
    listSchedules({ date: today, tab: 'active' }),
    listRooms(),
    listDoctors(),
  ])
  return <OtClient initialSchedules={schedules} rooms={rooms} doctors={doctors} initialDate={today} />
}
