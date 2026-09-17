import { redirect } from 'next/navigation'

// The lab report prints as a generated PDF; old links land here.
export default async function PrintLabReportPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  redirect(`/print/lab/${orderId}/pdf`)
}
