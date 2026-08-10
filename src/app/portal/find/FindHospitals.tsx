'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Search, Hospital, MapPin, ChevronRight, UserPlus } from 'lucide-react'
import { listDirectoryHospitals, selfRegisterPatient, type DirectoryHospital } from '@/app/actions/patientPortal'

const TEAL = '#0D9488'
const card: React.CSSProperties = { background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', padding: 16 }

export default function FindHospitals({ initial, memberId, memberName }: { initial: DirectoryHospital[]; memberId: string; memberName: string }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [list, setList] = useState<DirectoryHospital[]>(initial)
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function search(term: string) {
    setQ(term); setSearching(true)
    setList(await listDirectoryHospitals(memberId, term))
    setSearching(false)
  }

  async function register(tenantId: string) {
    setBusy(tenantId); setError(null)
    const res = await selfRegisterPatient(tenantId, memberId)
    setBusy(null)
    if (!res.success) { setError(res.error); return }
    router.push(`/h/${res.patientId}`)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC' }}>
      <header style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '14px 16px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/" style={{ color: '#64748B', display: 'flex' }}><ArrowLeft style={{ width: 20, height: 20 }} /></Link>
          <div>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>Find a hospital</p>
            <p style={{ fontSize: 12, color: '#94A3B8' }}>Booking for {memberName}</p>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 640, margin: '0 auto', padding: '16px' }}>
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <Search style={{ width: 16, height: 16, color: '#94A3B8', position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={q} onChange={(e) => search(e.target.value)} placeholder="Search by hospital or city…"
            style={{ width: '100%', padding: '12px 12px 12px 36px', borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 15, outline: 'none', color: '#0F172A' }} />
        </div>

        {error && <p style={{ fontSize: 13, color: '#DC2626', marginBottom: 12 }}>{error}</p>}

        {searching ? (
          <p style={{ textAlign: 'center', color: '#94A3B8', fontSize: 14, padding: 20 }}>Searching…</p>
        ) : list.length === 0 ? (
          <div style={{ ...card, textAlign: 'center', color: '#64748B' }}>
            <Hospital style={{ width: 28, height: 28, color: '#CBD5E1', margin: '0 auto 10px' }} />
            <p style={{ fontSize: 15, fontWeight: 600, color: '#0F172A', marginBottom: 4 }}>No hospitals found</p>
            <p style={{ fontSize: 13 }}>Try a different search, or ask your hospital to list on Uyirly.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {list.map((h) => (
              <div key={h.tenantId} style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(13,148,136,0.08)', border: '1px solid rgba(13,148,136,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Hospital style={{ width: 18, height: 18, color: TEAL }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: '#0F172A' }}>{h.name}</p>
                    {h.city && <p style={{ fontSize: 12, color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 3 }}><MapPin style={{ width: 12, height: 12 }} /> {h.city}</p>}
                  </div>
                  {h.patientId ? (
                    <Link href={`/h/${h.patientId}`} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: TEAL, textDecoration: 'none' }}>
                      Open <ChevronRight style={{ width: 16, height: 16 }} />
                    </Link>
                  ) : (
                    <button onClick={() => register(h.tenantId)} disabled={busy === h.tenantId}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: '#fff', background: busy === h.tenantId ? '#94A3B8' : TEAL, border: 'none', borderRadius: 10, padding: '8px 12px', cursor: busy === h.tenantId ? 'not-allowed' : 'pointer' }}>
                      <UserPlus style={{ width: 14, height: 14 }} /> {busy === h.tenantId ? 'Registering…' : 'Register'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 12, textAlign: 'center' }}>The hospital will verify {memberName}&apos;s details on the first visit.</p>
      </main>
    </div>
  )
}
