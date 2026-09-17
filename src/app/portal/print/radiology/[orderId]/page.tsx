import { redirect } from 'next/navigation'

// Patient-facing radiology report prints as a generated PDF (ownership checked in the PDF route).
export default async function PortalPrintRadiologyPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  redirect(`/portal/print/radiology/${orderId}/pdf`)
}
