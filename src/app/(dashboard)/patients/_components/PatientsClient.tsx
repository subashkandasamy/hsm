'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, ScanBarcode } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import DateText from '@/components/ui/DateText'
import EmptyState from '@/components/ui/EmptyState'
import { listPatientsPage } from '@/app/actions/patients'
import Pager from '@/components/ui/Pager'
import ListSearch from '@/components/ui/ListSearch'
import { writeListUrl, rememberedSize, rememberSize, useDebounced } from '@/lib/listUrl'
import { DEFAULT_PAGE_SIZE, type Paged } from '@/lib/paging'
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

interface Props { initial: Paged<Patient>; initialQuery: string }

const LIST = 'patients'

export default function PatientsClient({ initial, initialQuery }: Props) {
  const router = useRouter()
  const isReadOnly = useIsReadOnly()
  const [patients, setPatients] = useState<Patient[]>(initial.rows)
  const [total, setTotal] = useState(initial.total)
  const [page, setPage] = useState(initial.page)
  const [size, setSize] = useState(initial.size)
  const [query, setQuery] = useState(initialQuery)
  const debounced = useDebounced(query.trim())
  const [searching, setSearching] = useState(false)
  const [showRegister, setShowRegister] = useState(false)
  const [newPatient, setNewPatient] = useState<Patient | null>(null)
  const [barcodePatient, setBarcodePatient] = useState<Patient | null>(null)

  // ── Loading a page: the newest request wins; the address follows. ──
  const view = useRef({ q: initialQuery.trim(), page: initial.page, size: initial.size })
  const ticket = useRef(0)
  async function load(next: Partial<typeof view.current>) {
    const v = { ...view.current, ...next }
    view.current = v
    const mine = ++ticket.current
    setSearching(true)
    const res = await listPatientsPage({ q: v.q, page: v.page, size: v.size })
    if (mine !== ticket.current) return   // a newer request has gone out
    setPatients(res.rows); setTotal(res.total); setPage(res.page); setSize(v.size)
    setSearching(false)
    writeListUrl({ q: v.q, page: res.page, size: v.size }, { page: 1, size: DEFAULT_PAGE_SIZE })
  }

  // Rows per page chosen before on this browser, when the address does not say.
  useEffect(() => {
    const remembered = rememberedSize(LIST)
    if (!remembered || remembered === initial.size || new URLSearchParams(window.location.search).get('size')) return
    const t = setTimeout(() => { void load({ size: remembered, page: 1 }) }, 0)
    return () => clearTimeout(t)
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps
  // A changed search starts again from page 1; opening page 3 from the address does not.
  useEffect(() => { if (debounced !== view.current.q) void load({ q: debounced, page: 1 }) }, [debounced])

  return (
    <div>
      <PageHeader
        title="Patients"
        subtitle={`${total.toLocaleString('en-IN')} patient${total !== 1 ? 's' : ''}${query.trim() ? ' found' : ''}`}
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

      <ListSearch value={query} onChange={setQuery} busy={searching} className="mb-4"
        placeholder="Name, phone, UHID, old no. (DRKMCH-…), old IP / lab no." />

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
                    {/* The UHID used to sit beside the name, and being
                        unshrinkable it left about sixty pixels for the name
                        itself — every patient on the list read "Anand Subra…".
                        The name gets the line; the number joins the details
                        below it, where nothing competes for width. */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm break-words" style={{ color: '#0F172A' }}>{p.full_name}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs flex-wrap" style={{ color: '#64748B' }}>
                        <span className="font-mono px-2 py-0.5 rounded-lg"
                          style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488' }}>{p.uhid}</span>
                        {p.legacy_uhid && <span className="font-mono" title="Number in the previous software">Old {p.legacy_uhid}</span>}
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
                        {p.legacy_uhid && (
                          <div className="font-mono text-xs mt-1" style={{ color: '#64748B' }} title="Number in the previous software">
                            Old {p.legacy_uhid}
                          </div>
                        )}
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

      {total > 0 && (
        <Pager page={page} size={size} total={total} busy={searching}
          onPage={(p) => { void load({ page: p }); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
          onSize={(n) => { rememberSize(LIST, n); setSize(n); void load({ size: n, page: 1 }) }} />
      )}

      <RegisterModal
        open={showRegister}
        onClose={() => setShowRegister(false)}
        onSuccess={(patient) => {
          setPatients((prev) => [patient, ...prev])
          setTotal((t) => t + 1)
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
