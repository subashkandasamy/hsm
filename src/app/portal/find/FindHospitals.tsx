'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Search, Hospital, MapPin, ChevronRight, UserPlus } from 'lucide-react'
import { listDirectoryHospitals, selfRegisterPatient, type DirectoryHospital } from '@/app/actions/patientPortal'

const TEAL = '#0D9488'
const card: React.CSSProperties = { background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', padding: 16 }

export default function FindHospitals({ initial }: { initial: DirectoryHospital[] }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [list, setList] = useState<DirectoryHospital[]>(initial)
  const [searching, setSearching] = useState(false)

  // Registration
  const [regFor, setRegFor] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [gender, setGender] = useState('')
  const [dob, setDob] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function search(term: string) {
    setQ(term); setSearching(true)
    setList(await listDirectoryHospitals(term))
    setSearching(false)
  }

  async function register(tenantId: string) {
    if (!name.trim()) { setError("Enter the patient's name"); return }
    setBusy(true); setError(null)
    const res = await selfRegisterPatient(tenantId, { full_name: name, gender: gender || null, dob: dob || null })
    setBusy(false)
    if (!res.success) { setError(res.error); return }
    router.push(`/h/${res.patientId}`)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC' }}>
      <header style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '14px 16px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/" style={{ color: '#64748B', display: 'flex' }}><ArrowLeft style={{ width: 20, height: 20 }} /></Link>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>Find a hospital</p>
        </div>
      </header>

      <main style={{ maxWidth: 640, margin: '0 auto', padding: '16px' }}>
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <Search style={{ width: 16, height: 16, color: '#94A3B8', position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={q} onChange={(e) => search(e.target.value)} placeholder="Search by hospital or city…"
            style={{ width: '100%', padding: '12px 12px 12px 36px', borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 15, outline: 'none', color: '#0F172A' }} />
        </div>

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
                      View <ChevronRight style={{ width: 16, height: 16 }} />
                    </Link>
                  ) : (
                    <button onClick={() => { setRegFor(regFor === h.tenantId ? null : h.tenantId); setError(null); setName(''); setGender(''); setDob('') }}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: '#fff', background: TEAL, border: 'none', borderRadius: 10, padding: '8px 12px', cursor: 'pointer' }}>
                      <UserPlus style={{ width: 14, height: 14 }} /> Register
                    </button>
                  )}
                </div>

                {regFor === h.tenantId && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #F1F5F9' }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', marginBottom: 8 }}>Register at {h.name}</p>
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Patient's full name"
                      style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 14, marginBottom: 8, color: '#0F172A' }} />
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <select value={gender} onChange={(e) => setGender(e.target.value)}
                        style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 14, background: '#fff', color: gender ? '#0F172A' : '#94A3B8' }}>
                        <option value="">Gender</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
                      </select>
                      <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} placeholder="DOB"
                        style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 14, color: '#0F172A' }} />
                    </div>
                    {error && <p style={{ fontSize: 13, color: '#DC2626', marginBottom: 8 }}>{error}</p>}
                    <button onClick={() => register(h.tenantId)} disabled={busy}
                      style={{ width: '100%', padding: 10, borderRadius: 10, background: busy ? '#94A3B8' : TEAL, color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                      {busy ? 'Registering…' : 'Register & continue'}
                    </button>
                    <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 6, textAlign: 'center' }}>The hospital will verify your details on your first visit.</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
