import { redirect } from 'next/navigation'

// The declaration prints as a generated PDF; old links land here.
export default async function PrintDeclarationPage({ params }: { params: Promise<{ admissionId: string }> }) {
  const { admissionId } = await params
  redirect(`/print/ipd/${admissionId}/declaration/pdf`)
}
