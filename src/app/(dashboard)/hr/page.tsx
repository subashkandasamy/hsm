import { redirect } from 'next/navigation'

// Was a "Coming in a later phase" placeholder (BUG-069). Staff, rosters and
// leave live under Staff & HR.
export default function HRStaffPage() {
  redirect('/staff')
}
