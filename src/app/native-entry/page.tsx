import type { Metadata } from 'next'
import HospitalEntryForm from './_components/HospitalEntryForm'

export const metadata: Metadata = { title: 'Uyirly' }

interface Props {
  searchParams: Promise<{ switch?: string }>
}

export default async function NativeEntryPage({ searchParams }: Props) {
  const { switch: sw } = await searchParams
  // ?switch=1 is linked from the logout flow to let staff change hospitals
  return <HospitalEntryForm forcePick={sw === '1'} />
}
