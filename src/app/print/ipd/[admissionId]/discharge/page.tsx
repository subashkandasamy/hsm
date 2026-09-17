import { redirect } from 'next/navigation'

// The discharge summary prints as a generated PDF; old links land here.
export default async function PrintDischargeSummaryPage({ params }: { params: Promise<{ admissionId: string }> }) {
  const { admissionId } = await params
  redirect(`/print/ipd/${admissionId}/discharge/pdf`)
}
