'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, Search } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import StatusBadge from '@/components/ui/StatusBadge'
import DateText from '@/components/ui/DateText'
import EmptyState from '@/components/ui/EmptyState'
import { searchPatients } from '@/app/actions/patients'
import type { Patient } from '@/lib/types'
import RegisterModal from './RegisterModal'

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

interface Props { initialPatients: Patient[] }

export default function PatientsClient({ initialPatients }: Props) {
  const router = useRouter()
  const [patients, setPatients] = useState<Patient[]>(initialPatients)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [showRegister, setShowRegister] = useState(false)

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
            onClick={() => setShowRegister(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#0F766E' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#0D9488' }}
          >
            <UserPlus className="w-4 h-4" />
            Register Patient
          </button>
        }
      />

      {/* Search — full-width on mobile */}
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

      <GlassCard className="overflow-hidden">
        {patients.length === 0 ? (
          <EmptyState title="No patients found"
            description={query ? 'Try a different search term.' : 'Register the first patient to get started.'} />
        ) : (
          <>
            {/* ── MOBILE CARDS (< md) ── */}
            <div className="md:hidden divide-y" style={{ borderColor: '#F1F5F9' }}>
              {patients.map((p) => (
                <button key={p.id} onClick={() => router.push(`/patients/${p.id}`)}
                  className="w-full text-left px-4 py-3.5"
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-semibold text-sm truncate" style={{ color: '#0F172A' }}>{p.full_name}</p>
                    <span className="font-mono text-xs px-2 py-0.5 rounded-lg flex-shrink-0"
                      style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488' }}>{p.uhid}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs flex-wrap" style={{ color: '#64748B' }}>
                    {p.gender && <span className="capitalize">{p.gender}</span>}
                    <span>{computeAge(p.dob)}</span>
                    {p.phone && <span>{p.phone}</span>}
                    <DateText date={p.created_at} />
                  </div>
                </button>
              ))}
            </div>

            {/* ── DESKTOP TABLE (md+) ── */}
            <table className="hidden md:table w-full text-sm">
              <thead>
                <tr style={{ background: 'rgba(248,250,252,0.8)', borderBottom: '1px solid #E2E8F0' }}>
                  {['UHID', 'Name', 'Age', 'Gender', 'Phone', 'Registered'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 font-semibold" style={{ color: '#475569' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {patients.map((p, i) => (
                  <tr key={p.id} onClick={() => router.push(`/patients/${p.id}`)}
                    style={{ borderBottom: i < patients.length - 1 ? '1px solid #F1F5F9' : 'none', cursor: 'pointer' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(248,250,252,0.7)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs px-2 py-0.5 rounded-lg"
                        style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488' }}>{p.uhid}</span>
                    </td>
                    <td className="px-4 py-3 font-medium" style={{ color: '#0F172A' }}>{p.full_name}</td>
                    <td className="px-4 py-3" style={{ color: '#475569' }}>{computeAge(p.dob)}</td>
                    <td className="px-4 py-3">
                      {p.gender
                        ? <StatusBadge status={p.gender === 'male' ? 'info' : p.gender === 'female' ? 'success' : 'pending'}
                            label={p.gender.charAt(0).toUpperCase() + p.gender.slice(1)} />
                        : <span style={{ color: '#94A3B8' }}>—</span>}
                    </td>
                    <td className="px-4 py-3" style={{ color: '#475569' }}>{p.phone}</td>
                    <td className="px-4 py-3" style={{ color: '#475569' }}><DateText date={p.created_at} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </GlassCard>

      <RegisterModal
        open={showRegister}
        onClose={() => setShowRegister(false)}
        onSuccess={(patient) => {
          setPatients((prev) => [patient, ...prev])
          setShowRegister(false)
          router.push(`/patients/${patient.id}`)
        }}
      />
    </div>
  )
}
