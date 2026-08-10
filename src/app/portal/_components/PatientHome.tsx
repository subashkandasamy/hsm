'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import BrandMark from '@/components/ui/BrandMark'
import Link from 'next/link'
import { Hospital, LogOut, ChevronRight, Search, User, Plus, X, Trash2 } from 'lucide-react'
import { signOutPatient, addFamilyMember, removeFamilyMember, type MyHospital, type PatientMemberView } from '@/app/actions/patientPortal'

const TEAL = '#0D9488'
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px', borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 14, outline: 'none', color: '#0F172A' }

export default function PatientHome({ members, hospitals, phone }: { members: PatientMemberView[]; hospitals: MyHospital[]; phone: string }) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ full_name: '', aadhaar: '', relationship: 'child' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signOut() { await signOutPatient(); router.refresh() }

  async function submitMember() {
    setBusy(true); setError(null)
    const res = await addFamilyMember({ full_name: form.full_name, aadhaar: form.aadhaar, relationship: form.relationship })
    setBusy(false)
    if (!res.success) { setError(res.error); return }
    setAdding(false); setForm({ full_name: '', aadhaar: '', relationship: 'child' })
    router.refresh()
  }

  async function removeMember(id: string) {
    if (!confirm('Remove this family member? Their hospital records stay with the hospital.')) return
    await removeFamilyMember(id)
    router.refresh()
  }

  const byMember = new Map<string, MyHospital[]>()
  for (const h of hospitals) {
    const k = h.member_id ?? 'unassigned'
    if (!byMember.has(k)) byMember.set(k, [])
    byMember.get(k)!.push(h)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC' }}>
      <header style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BrandMark size={32} />
          <span style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>Uyirly</span>
        </div>
        <button onClick={signOut} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: '#64748B', fontSize: 13, cursor: 'pointer' }}>
          <LogOut style={{ width: 15, height: 15 }} /> Sign out
        </button>
      </header>

      <main style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', marginBottom: 2 }}>Your family</h1>
        <p style={{ fontSize: 14, color: '#64748B', marginBottom: 22 }}>
          +{phone} · {members.length} member{members.length !== 1 ? 's' : ''}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {members.map((m) => {
            const mh = byMember.get(m.id) ?? []
            return (
              <div key={m.id} style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                <div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12, borderBottom: mh.length ? '1px solid #F1F5F9' : 'none' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(13,148,136,0.08)', border: '1px solid rgba(13,148,136,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <User style={{ width: 18, height: 18, color: TEAL }} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: '#0F172A' }}>{m.full_name}
                      <span style={{ fontSize: 11, fontWeight: 600, color: TEAL, background: 'rgba(13,148,136,0.08)', borderRadius: 6, padding: '1px 6px', marginLeft: 8 }}>{m.is_self ? 'You' : (m.relationship ?? 'family')}</span>
                    </p>
                    {m.aadhaar_masked && <p style={{ fontSize: 12, color: '#94A3B8', fontFamily: 'monospace' }}>{m.aadhaar_masked}</p>}
                  </div>
                  {!m.is_self && (
                    <button onClick={() => removeMember(m.id)} title="Remove" style={{ background: 'none', border: 'none', color: '#CBD5E1', cursor: 'pointer' }}><Trash2 style={{ width: 16, height: 16 }} /></button>
                  )}
                </div>

                {mh.map((h) => (
                  <Link key={h.patient_id} href={`/h/${h.patient_id}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderTop: '1px solid #F8FAFC' }}>
                    <Hospital style={{ width: 15, height: 15, color: '#94A3B8', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, color: '#0F172A' }}>{h.hospital}</p>
                      <p style={{ fontSize: 12, color: '#94A3B8' }}>UHID {h.uhid}</p>
                    </div>
                    <ChevronRight style={{ width: 16, height: 16, color: '#CBD5E1' }} />
                  </Link>
                ))}

                <Link href={`/find?member=${m.id}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '11px 16px', borderTop: '1px solid #F1F5F9', color: TEAL, fontSize: 13.5, fontWeight: 600 }}>
                  <Search style={{ width: 15, height: 15 }} /> Find a hospital &amp; book for {m.is_self ? 'yourself' : m.full_name}
                </Link>
              </div>
            )
          })}
        </div>

        {/* Add family member */}
        {adding ? (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', padding: 16, marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#0F172A' }}>Add family member</p>
              <button onClick={() => { setAdding(false); setError(null) }} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}><X style={{ width: 18, height: 18 }} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input value={form.full_name} onChange={(e) => { setForm((f) => ({ ...f, full_name: e.target.value })); setError(null) }} placeholder="Full name" style={inputStyle} />
              <input value={form.aadhaar} onChange={(e) => { setForm((f) => ({ ...f, aadhaar: e.target.value.replace(/\D/g, '').slice(0, 12) })); setError(null) }} inputMode="numeric" placeholder="Aadhaar (12 digits)" style={inputStyle} />
              <select value={form.relationship} onChange={(e) => setForm((f) => ({ ...f, relationship: e.target.value }))} style={inputStyle}>
                {['spouse', 'child', 'parent', 'sibling', 'other'].map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
              </select>
              {error && <p style={{ fontSize: 13, color: '#DC2626' }}>{error}</p>}
              <button onClick={submitMember} disabled={busy} style={{ padding: '11px', borderRadius: 10, background: busy ? '#94A3B8' : TEAL, color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}>
                {busy ? 'Adding…' : 'Add member'}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} style={{ width: '100%', marginTop: 16, padding: '13px', borderRadius: 14, background: '#fff', border: '1px dashed #CBD5E1', color: TEAL, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Plus style={{ width: 16, height: 16 }} /> Add family member
          </button>
        )}
      </main>
    </div>
  )
}
