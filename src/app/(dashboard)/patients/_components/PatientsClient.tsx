'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, Search, ScanBarcode } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import DateText from '@/components/ui/DateText'
import EmptyState from '@/components/ui/EmptyState'
import { searchPatients } from '@/app/actions/patients'
import type { Patient } from '@/lib/types'
import RegisterModal from './RegisterModal'
import PatientBarcodeModal from '@/components/barcode/PatientBarcodeModal'
import { useIsReadOnly } from '@/context/ReadOnlyContext'

function computeAge(dob: string | null): string {
  if (!dob) return '—'
  const today = new Date()
  const birth = new Date(dob)
  let age = today.getFullYear() - birth.getFullYear()
  if (
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  ) age--
  return `${age}y`
}

function getInitials(name: string): string {
  const parts = name.trim().split(' ').filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const AVATAR_COLORS = [
  { bg: 'rgba(13,148,136,0.12)', color: '#0D9488' },
  { bg: 'rgba(59,130,246,0.12)', color: '#2563EB' },
  { bg: 'rgba(139,92,246,0.12)', color: '#7C3AED' },
  { bg: 'rgba(236,72,153,0.12)', color: '#DB2777' },
  { bg: 'rgba(245,158,11,0.12)', color: '#D97706' },
]

function avatarColor(name: string) {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length
  return AVATAR_COLORS[idx]
}

interface Props { initialPatients: Patient[] }

export default function PatientsClient({ initialPatients }: Props) {
  const router = useRouter()
  const isReadOnly = useIsReadOnly()
  const [patients, setPatients] = useState<Patient[]>(initialPatients)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [showRegister, setShowRegister] = useState(false)
  const [newPatient, setNewPatient] = useState<Patient | null>(null)
  const [barcodePatient, setBarcodePatient] = useState<Patient | null>(null)

  const doSearch = useCallback(async (q: string) => {
    setSearching(true)
    const results = await searchPatients(q)
    setPatients(results)
    setSearching(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => doSearch(query), 300)
    return () => clearTimeout(t)
  }, [query, doSearch])

  return (
    <div>
      <PageHeader
        title="Patients"
        subtitle={`${patients.length} record${patients.length !== 1 ? 's' : ''}`}
        action={
          <button
            onClick={() => !isReadOnly && setShowRegister(true)}
            disabled={isReadOnly}
            title={isReadOnly ? 'Renew subscription to register patients' : undefined}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: isReadOnly ? 'not-allowed' : 'pointer', opacity: isReadOnly ? 0.5 : 1 }}
            onMouseEnter={(e) => { if (!isReadOnly) e.currentTarget.style.background = '#0F766E' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#0D9488' }}
          >
            <UserPlus className="w-4 h-4" />
            Register Patient
          </button>
        }
      />

      {/* Search */}
      <div className="mb-4 relative w-full md:max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#94A3B8' }} />
        <input
          type="search"
          placeholder="Search by name, phone, or UHID…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm"
          style={{ minHeight: '44px', background: 'rgba(255,255,255,0.85)', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none' }}
          onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488' }}
          onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}
        />
        {searching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: '#94A3B8' }}>Searching…</span>
        )}
      </div>

      {patients.length === 0 ? (
        <GlassCard>
          <EmptyState title="No patients found"
            description={query ? 'Try a different search term.' : 'Register the first patient to get started.'} />
        </GlassCard>
      ) : (
        <>
          {/* ── MOBILE CARDS (< md) ── */}
          <div className="md:hidden space-y-2">
            {patients.map((p) => {
              const av = avatarColor(p.full_name)
              const initials = getInitials(p.full_name)
              return (
                <div key={p.id} className="flex items-center rounded-2xl overflow-hidden"
                  style={{ background: 'rgba(255,255,255,0.92)', border: '1px solid #E2E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                  <button onClick={() => router.push(`/patients/${p.id}`)}
                    className="flex-1 min-w-0 text-left flex items-center gap-3 px-3.5 py-3"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-sm font-bold"
                      style={{ background: av.bg, color: av.color }}>
                      {initials}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-sm truncate" style={{ color: '#0F172A' }}>{p.full_name}</p>
                        <span className="font-mono text-xs px-2 py-0.5 rounded-lg flex-shrink-0"
                          style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488' }}>{p.uhid}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs flex-wrap" style={{ color: '#64748B' }}>
                        {p.gender && <span className="capitalize">{p.gender}</span>}
                        {p.dob && <span>{computeAge(p.dob)}</span>}
                        {p.phone && <span>{p.phone}</span>}
                        {!p.phone && <DateText date={p.created_at} />}
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setBarcodePatient(p) }}
                    className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl mx-2.5"
                    style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: 'none', cursor: 'pointer' }}
                    title="View barcode / Print ID card"
                  >
                    <ScanBarcode className="w-4 h-4" />
                  </button>
                </div>
              )
            })}
          </div>

          {/* ── DESKTOP TABLE (md+) ── */}
          <GlassCard className="hidden md:block overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'rgba(248,250,252,0.8)', borderBottom: '2px solid #E2E8F0' }}>
                  <th className="px-4 py-3.5 w-10" />
                  {['UHID', 'Name', 'Age', 'Gender', 'Phone', 'Registered', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3.5 font-semibold text-xs uppercase tracking-wide" style={{ color: '#64748B' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {patients.map((p, i) => {
                  const av = avatarColor(p.full_name)
                  return (
                    <tr key={p.id} onClick={() => router.push(`/patients/${p.id}`)}
                      style={{ borderBottom: i < patients.length - 1 ? '1px solid #F1F5F9' : 'none', cursor: 'pointer' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(13,148,136,0.02)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                      <td className="px-4 py-3.5">
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold"
                          style={{ background: av.bg, color: av.color }}>
                          {getInitials(p.full_name)}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-xs px-2 py-0.5 rounded-lg"
                          style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488' }}>{p.uhid}</span>
                      </td>
                      <td className="px-4 py-3.5 font-medium" style={{ color: '#0F172A' }}>{p.full_name}</td>
                      <td className="px-4 py-3.5" style={{ color: '#475569' }}>{computeAge(p.dob)}</td>
                      <td className="px-4 py-3.5">
                        {p.gender ? (
                          <span className="capitalize text-xs px-2 py-0.5 rounded-lg"
                            style={p.gender === 'male'
                              ? { background: '#DBEAFE', color: '#1D4ED8' }
                              : p.gender === 'female'
                              ? { background: '#FCE7F3', color: '#9D174D' }
                              : { background: '#F1F5F9', color: '#64748B' }}>
                            {p.gender}
                          </span>
                        ) : <span style={{ color: '#94A3B8' }}>—</span>}
                      </td>
                      <td className="px-4 py-3.5" style={{ color: '#475569' }}>{p.phone ?? <span style={{ color: '#94A3B8' }}>—</span>}</td>
                      <td className="px-4 py-3.5" style={{ color: '#64748B' }}><DateText date={p.created_at} /></td>
                      <td className="px-4 py-3.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); setBarcodePatient(p) }}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium"
                          style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.2)', cursor: 'pointer' }}
                          onMouseEnter={(ev) => { ev.currentTarget.style.background = 'rgba(13,148,136,0.15)' }}
                          onMouseLeave={(ev) => { ev.currentTarget.style.background = 'rgba(13,148,136,0.08)' }}
                          title="View barcode / Print ID card"
                        >
                          <ScanBarcode className="w-3.5 h-3.5" />
                          ID Card
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </GlassCard>
        </>
      )}

      <RegisterModal
        open={showRegister}
        onClose={() => setShowRegister(false)}
        onSuccess={(patient) => {
          setPatients((prev) => [patient, ...prev])
          setShowRegister(false)
          setNewPatient(patient)
        }}
      />

      {newPatient && (
        <PatientBarcodeModal
          patient={newPatient}
          onClose={() => {
            router.push(`/patients/${newPatient.id}`)
            setNewPatient(null)
          }}
        />
      )}

      {barcodePatient && (
        <PatientBarcodeModal
          patient={barcodePatient}
          inline
          onClose={() => setBarcodePatient(null)}
        />
      )}
    </div>
  )
}
