'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Building2, Hospital, LogOut, ChevronRight, Search, User } from 'lucide-react'
import { signOutPatient, type MyHospital } from '@/app/actions/patientPortal'

const TEAL = '#0D9488'

export default function PatientHome({ hospitals, phone }: { hospitals: MyHospital[]; phone: string }) {
  const router = useRouter()

  async function signOut() {
    await signOutPatient()
    router.refresh()
  }

  // One phone can carry several people (a family sharing a number). Show each
  // registered person as a profile; count distinct hospitals separately.
  const people = hospitals.length
  const hospitalCount = new Set(hospitals.map((h) => h.tenant_id)).size
  const greeting = people === 1 ? `Hi, ${hospitals[0].patient_name}` : 'Welcome'

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC' }}>
      {/* Header */}
      <header style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(13,148,136,0.12)', border: '1px solid rgba(13,148,136,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Building2 style={{ width: 16, height: 16, color: TEAL }} />
          </div>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>Uyirly</span>
        </div>
        <button onClick={signOut} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: '#64748B', fontSize: 13, cursor: 'pointer' }}>
          <LogOut style={{ width: 15, height: 15 }} /> Sign out
        </button>
      </header>

      <main style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', marginBottom: 2 }}>{greeting}</h1>
        <p style={{ fontSize: 14, color: '#64748B', marginBottom: 22 }}>
          +{phone}{people > 0 ? ` · ${people} profile${people !== 1 ? 's' : ''} · ${hospitalCount} hospital${hospitalCount !== 1 ? 's' : ''}` : ''}
        </p>

        <h2 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94A3B8', marginBottom: 10 }}>
          {people > 1 ? 'Select a profile' : 'Your profile'}
        </h2>

        {hospitals.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', padding: '28px 20px', textAlign: 'center' }}>
            <Hospital style={{ width: 28, height: 28, color: '#CBD5E1', margin: '0 auto 10px' }} />
            <p style={{ fontSize: 15, fontWeight: 600, color: '#0F172A', marginBottom: 4 }}>No records found yet</p>
            <p style={{ fontSize: 13, color: '#64748B' }}>
              When you visit a Uyirly hospital and register with this mobile number, your records will appear here automatically.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {hospitals.map((h) => (
              <Link key={h.patient_id} href={`/h/${h.patient_id}`} style={{ textDecoration: 'none', background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(13,148,136,0.08)', border: '1px solid rgba(13,148,136,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <User style={{ width: 18, height: 18, color: TEAL }} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: 15, fontWeight: 600, color: '#0F172A' }}>{h.patient_name}</p>
                  <p style={{ fontSize: 12, color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Hospital style={{ width: 12, height: 12 }} /> {h.hospital} · UHID {h.uhid}
                  </p>
                </div>
                <ChevronRight style={{ width: 18, height: 18, color: '#CBD5E1', flexShrink: 0 }} />
              </Link>
            ))}
          </div>
        )}

        <Link href="/find" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, marginTop: 24, padding: '14px 16px', background: TEAL, borderRadius: 14 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Search style={{ width: 16, height: 16, color: '#fff' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>Find a hospital &amp; book</p>
            <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.85)' }}>Browse hospitals on Uyirly and book an appointment</p>
          </div>
          <ChevronRight style={{ width: 18, height: 18, color: 'rgba(255,255,255,0.9)', flexShrink: 0 }} />
        </Link>
      </main>
    </div>
  )
}
