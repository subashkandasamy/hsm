import { redirect } from 'next/navigation'

// Tube labels print as a generated PDF; old links land here.
export default async function PrintSampleLabelsPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  redirect(`/print/sample-labels/${orderId}/pdf`)
}
