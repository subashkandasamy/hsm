import { headers } from 'next/headers'
import AddPhoneForm from './_components/AddPhoneForm'

export const metadata = { title: 'Add Phone Number — Uyirly' }

export default async function AddPhonePage() {
  const hdrs = await headers()
  const hospitalName = hdrs.get('x-tenant-name')
  return <AddPhoneForm hospitalName={hospitalName} />
}
