import { redirect } from 'next/navigation'

// The radiology report prints as a generated PDF; old links land here.
export default async function PrintRadiologyReportPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  redirect(`/print/radiology/${orderId}/pdf`)
}
