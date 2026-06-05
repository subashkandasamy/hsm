import { listSchedules, listRooms, listDoctors } from '@/app/actions/ot'
import OtClient from './_components/OtClient'

export default async function OtPage() {
  const today = new Date().toISOString().split('T')[0]
  const [schedules, rooms, doctors] = await Promise.all([
    listSchedules({ date: today }),
    listRooms(),
    listDoctors(),
  ])
  return <OtClient initialSchedules={schedules} rooms={rooms} doctors={doctors} initialDate={today} />
}
