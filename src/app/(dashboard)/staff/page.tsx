import { listStaff, getAttendance, getRoster } from '@/app/actions/hr'
import StaffClient from './_components/StaffClient'

export default async function StaffPage() {
  const today = new Date()
  const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - today.getDay())

  const [staff, attendance, roster] = await Promise.all([
    listStaff(),
    getAttendance({ month }),
    getRoster({ weekStart: weekStart.toISOString().slice(0, 10) }),
  ])

  return (
    <StaffClient
      initialStaff={staff}
      initialAttendance={attendance}
      initialRoster={roster}
      currentMonth={month}
      weekStart={weekStart.toISOString().slice(0, 10)}
    />
  )
}
