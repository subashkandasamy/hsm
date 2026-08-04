import type { Metadata } from 'next'
import BrandMark from '@/components/ui/BrandMark'
import FindHospitalForm from './_components/FindHospitalForm'

export const metadata: Metadata = {
  title: 'Find your hospital — Uyirly',
  description: 'Enter your hospital’s Uyirly web address to go to your sign-in page.',
  robots: { index: false, follow: false },
}

export default function FindHospitalPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <BrandMark size={56} className="mb-4" />
          <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>Find your hospital</h1>
          <p className="mt-1 text-sm text-center" style={{ color: '#64748B' }}>
            Each hospital signs in from its own web address. Enter yours to continue.
          </p>
        </div>

        <div className="glass-card p-8">
          <FindHospitalForm />
        </div>
      </div>
    </main>
  )
}
