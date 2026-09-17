import { redirect } from 'next/navigation'

// Patient-facing lab report prints as a generated PDF (ownership checked in the PDF route).
export default async function PortalPrintLabPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  redirect(`/portal/print/lab/${orderId}/pdf`)
}
