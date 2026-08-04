import { notFound } from 'next/navigation'
import SolutionShell from '@/components/marketing/SolutionShell'
import { citySlugs, getCityMeta, cityMetadata } from '@/lib/locations/registry'

export const dynamicParams = false

export function generateStaticParams() {
  return citySlugs().map((city) => ({ city }))
}

export async function generateMetadata({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params
  return cityMetadata(city)
}

export default async function CityPage({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params
  const meta = getCityMeta(city)
  if (!meta) notFound()
  return <SolutionShell meta={meta} />
}
