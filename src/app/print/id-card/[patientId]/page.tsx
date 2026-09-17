import { redirect } from 'next/navigation'

// The ID card prints as a generated PDF; old links land here.
export default async function PrintIdCardPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params
  redirect(`/print/id-card/${patientId}/pdf?layout=a4`)
}
