'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Droplet, User, Phone, Mail, Clock,
  Stethoscope, Pencil, Receipt, BadgeIndianRupee, BedDouble, ChevronDown, ChevronUp,
} from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import StatusBadge from '@/components/ui/StatusBadge'
import DateText from '@/components/ui/DateText'
import EmptyState from '@/components/ui/EmptyState'
import Money from '@/components/ui/Money'
import AllergyBanner from '@/components/ui/AllergyBanner'
import EditPatientModal from './EditPatientModal'
import BillBuilderModal from '@/app/(dashboard)/billing/_components/BillBuilderModal'
import AllergiesTab from './AllergiesTab'
import TimelineTab from './TimelineTab'
import DocumentsTab from './DocumentsTab'
import type {
  Patient, Visit, Appointment, Bill, Admission,
  PatientAllergy, PatientDocument, TimelineEvent, DiagnosisSummary, Role,
} from '@/lib/types'
import { hasPermission } from '@/lib/rbac'

function computeAge(dob: string | null): string {
  if (!dob) return '—'
  const today = new Date()
  const birth = new Date(dob)
  let age = today.getFullYear() - birth.getFullYear()
  if (
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  ) age--
  return `${age} years`
}

const BILL_STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  draft:     { bg: '#F8FAFC', color: '#64748B', label: 'Draft' },
  unpaid:    { bg: '#FEF2F2', color: '#DC2626', label: 'Unpaid' },
  partial:   { bg: '#FEF3C7', color: '#B45309', label: 'Partial' },
  paid:      { bg: '#F0FDF4', color: '#15803D', label: 'Paid' },
  cancelled: { bg: '#F8FAFC', color: '#94A3B8', label: 'Cancelled' },
}

function yearMonthKey(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function yearMonthLabel(key: string) {
  const [y, m] = key.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

function groupByYearMonth<T>(items: T[], getDate: (item: T) => string): { key: string; label: string; items: T[] }[] {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const k = yearMonthKey(getDate(item))
    const arr = map.get(k) ?? []
    arr.push(item)
    map.set(k, arr)
  }
  return Array.from(map.entries()).map(([key, items]) => ({ key, label: yearMonthLabel(key), items }))
}

function MonthHeader({ label, open, onToggle, count }: { label: string; open: boolean; onToggle: () => void; count: number }) {
  return (
    <button onClick={onToggle} className="w-full flex items-center gap-3 pt-2 group">
      <span className="text-xs font-bold uppercase tracking-widest flex-shrink-0"
        style={{ color: '#64748B', letterSpacing: '0.1em' }}>
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: '#E2E8F0' }} />
      <span className="text-xs flex-shrink-0" style={{ color: '#CBD5E1' }}>{count}</span>
      {open
        ? <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#CBD5E1' }} />
        : <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#CBD5E1' }} />}
    </button>
  )
}

type Tab = 'timeline' | 'encounters' | 'bills' | 'allergies' | 'documents' | 'info'

interface Props {
  patient: Patient
  visits: Visit[]
  appointments: Appointment[]
  admissions: Admission[]
  bills: Bill[]
  allergies: PatientAllergy[]
  documents: PatientDocument[]
  timeline: TimelineEvent[]
  diagnoses: DiagnosisSummary[]
  role: Role
}

export default function PatientProfile({
  patient, visits, appointments, admissions, bills,
  allergies, documents, timeline, diagnoses, role,
}: Props) {
  const [tab, setTab] = useState<Tab>('timeline')
  const [showEdit, setShowEdit] = useState(false)
  const [showBillBuilder, setShowBillBuilder] = useState(false)
  const router = useRouter()

  const outstanding = bills
    .filter((b) => !['paid', 'cancelled'].includes(b.status))
    .reduce((s, b) => s + (b.total - b.paid), 0)

  const unbilledVisits = visits.filter((v) => v.billing_status === 'unbilled' && v.status === 'closed')

  // Detect active encounter for bill generation context
  const activeAdmission = admissions.find((a) => (a.status as string) === 'admitted')
  const today = new Date().toISOString().slice(0, 10)
  const activeVisit = !activeAdmission
    ? visits.find((v) => (v.visit_date as string).slice(0, 10) === today && v.status === 'open')
    : undefined

  const canReadEMR       = hasPermission(role, 'emr:read')
  const canWriteAllergy  = hasPermission(role, 'emr:allergy:write')
  const canUploadDoc     = hasPermission(role, 'emr:document:upload')
  const canDeleteDoc     = hasPermission(role, 'emr:document:delete')

  const encounterCount = admissions.length + visits.length + appointments.length
  const regularBillCount = bills.filter(b => b.bill_source !== 'advance_refund').length

  const ALL_TABS: { key: Tab; label: string; count?: number; hidden?: boolean }[] = [
    { key: 'timeline',   label: 'Timeline',   count: timeline.length,  hidden: !canReadEMR },
    { key: 'encounters', label: 'Encounters', count: encounterCount },
    { key: 'bills',      label: 'Bills',      count: regularBillCount },
    { key: 'allergies',  label: 'Allergies',  count: allergies.length },
    { key: 'documents',  label: 'Documents',  count: documents.length, hidden: !canUploadDoc && !canReadEMR },
    { key: 'info',       label: 'Info' },
  ]
  const TABS = ALL_TABS.filter((t) => !t.hidden) as { key: Tab; label: string; count?: number }[]

  const severeAllergies = allergies.filter((a) => a.severity === 'severe')

  return (
    <div>
      <Link href="/patients" className="inline-flex items-center gap-1.5 text-sm mb-4"
        style={{ color: '#64748B' }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#0D9488' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = '#64748B' }}
      >
        <ArrowLeft className="w-4 h-4" /> Back to Patients
      </Link>

      {/* Allergy banner — always visible, above the header card */}
      {allergies.length > 0 && (
        <AllergyBanner allergies={allergies} className="mb-4" />
      )}

      {/* Header card */}
      <GlassCard className="p-6 mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(13,148,136,0.1)', border: '1px solid rgba(13,148,136,0.2)' }}>
              <User className="w-6 h-6" style={{ color: '#0D9488' }} />
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-bold" style={{ color: '#0F172A' }}>{patient.full_name}</h1>
                <span className="font-mono text-xs px-2.5 py-1 rounded-lg"
                  style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.15)' }}>
                  {patient.uhid}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-1.5 flex-wrap text-sm" style={{ color: '#475569' }}>
                {patient.dob && <span>{computeAge(patient.dob)}</span>}
                {patient.gender && <span className="capitalize">{patient.gender}</span>}
                {patient.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5" />{patient.phone}
                  </span>
                )}
                {patient.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5" />{patient.email}
                  </span>
                )}
              </div>

              {outstanding > 0 && (
                <div className="flex items-center gap-1.5 mt-2 text-sm font-semibold" style={{ color: '#DC2626' }}>
                  <BadgeIndianRupee className="w-4 h-4" />
                  Outstanding: <Money amount={outstanding} />
                </div>
              )}
              {unbilledVisits.length > 0 && (
                <p className="text-xs mt-1" style={{ color: '#B45309' }}>
                  {unbilledVisits.length} closed visit{unbilledVisits.length > 1 ? 's' : ''} pending billing
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowEdit(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all min-h-[36px]"
              style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.2)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(13,148,136,0.15)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(13,148,136,0.08)' }}
            >
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
            <button
              onClick={() => setShowBillBuilder(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all min-h-[36px]"
              style={{ background: '#0D9488', color: '#fff', border: 'none' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#0F766E' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#0D9488' }}
            >
              <Receipt className="w-3.5 h-3.5" /> Generate Bill
            </button>
            {patient.blood_group && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold"
                style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
                <Droplet className="w-4 h-4" />
                {patient.blood_group}
              </div>
            )}
            {severeAllergies.length > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold"
                style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                ⚠ Severe Allergy
              </div>
            )}
          </div>
        </div>
      </GlassCard>

      {/* Tabs — scrollable on mobile */}
      <div className="overflow-x-auto mb-4">
        <div className="flex gap-1 p-1 rounded-xl w-fit min-w-full sm:min-w-0"
          style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid #E2E8F0' }}>
          {TABS.map(({ key, label, count }) => (
            <button key={key} onClick={() => setTab(key)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
              style={tab === key
                ? { background: '#0D9488', color: '#fff' }
                : { color: '#64748B', background: 'transparent' }
              }
            >
              {label}
              {count !== undefined && (
                <span className="text-xs px-1.5 py-0.5 rounded-full"
                  style={tab === key
                    ? { background: 'rgba(255,255,255,0.25)', color: '#fff' }
                    : { background: '#F1F5F9', color: '#64748B' }
                  }>{count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {tab === 'timeline' && canReadEMR && (
        <TimelineTab patientId={patient.id} initialEvents={timeline} diagnoses={diagnoses} />
      )}
      {tab === 'encounters' && (
        <EncountersTab admissions={admissions} visits={visits} appointments={appointments} />
      )}
      {tab === 'bills' && (
        <BillsTab bills={bills} admissions={admissions} visits={visits} outstanding={outstanding} />
      )}
      {tab === 'allergies'    && (
        <AllergiesTab patientId={patient.id} initialAllergies={allergies} canWrite={canWriteAllergy} freeText={patient.allergies} />
      )}
      {tab === 'documents' && (
        <DocumentsTab
          patientId={patient.id}
          initialDocuments={documents}
          canUpload={canUploadDoc}
          canDelete={canDeleteDoc}
        />
      )}
      {tab === 'info' && <InfoTab patient={patient} />}

      {showEdit && (
        <EditPatientModal
          patient={patient}
          onClose={() => setShowEdit(false)}
          onSuccess={() => { setShowEdit(false); router.refresh() }}
        />
      )}

      {showBillBuilder && (
        <BillBuilderModal
          preselectedPatient={patient}
          admissionId={activeAdmission?.id}
          visitId={activeVisit?.id}
          onClose={() => setShowBillBuilder(false)}
          onGenerated={(billId) => {
            setShowBillBuilder(false)
            router.push(`/billing/${billId}`)
          }}
        />
      )}
    </div>
  )
}

function EncountersTab({ admissions, visits, appointments }: {
  admissions: Admission[]; visits: Visit[]; appointments: Appointment[]
}) {
  type Item =
    | { kind: 'admission'; date: string; data: Admission }
    | { kind: 'visit'; date: string; data: Visit }
    | { kind: 'appointment'; date: string; data: Appointment }

  const items: Item[] = [
    ...admissions.map((a) => ({ kind: 'admission' as const, date: a.admitted_at as string, data: a })),
    ...visits.map((v) => ({ kind: 'visit' as const, date: v.visit_date as string, data: v })),
    ...appointments.map((a) => ({ kind: 'appointment' as const, date: a.scheduled_at as string, data: a })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  if (items.length === 0) {
    return <EmptyState title="No encounters yet" description="IPD admissions, OPD visits and appointments will appear here." />
  }

  const monthGroups = groupByYearMonth(items, (i) => i.date)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  function toggleMonth(key: string) {
    setCollapsed(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })
  }

  return (
    <div className="space-y-3">
      {monthGroups.map(({ key, label, items: monthItems }) => (
        <div key={key} className="space-y-3">
          <MonthHeader label={label} open={!collapsed.has(key)} onToggle={() => toggleMonth(key)} count={monthItems.length} />
          {!collapsed.has(key) && monthItems.map((item) => {
        if (item.kind === 'admission') {
          const a = item.data
          const ward = (a.ward as Record<string,unknown> | null | undefined)
          const bed  = (a.bed  as Record<string,unknown> | null | undefined)
          const doc  = (a.doctor as Record<string,unknown> | null | undefined)
          const isDischarged = (a.status as string) === 'discharged'
          return (
            <GlassCard key={a.id} className="p-4" style={{ borderLeft: '3px solid #7C3AED' }}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: '#EDE9FE', border: '1px solid #DDD6FE' }}>
                    <BedDouble className="w-4 h-4" style={{ color: '#7C3AED' }} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                        style={{ background: '#EDE9FE', color: '#7C3AED' }}>IPD Admission</span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={isDischarged
                          ? { background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }
                          : { background: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A' }}>
                        {isDischarged ? 'Discharged' : 'Admitted'}
                      </span>
                    </div>
                    <p className="text-sm font-semibold mt-1" style={{ color: '#0F172A' }}>
                      {ward?.name as string ?? 'Ward'} · Bed {bed?.bed_no as string ?? '—'}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                      <DateText date={a.admitted_at as string} />
                      {(a.discharged_at as string | null) && (
                        <> → <DateText date={a.discharged_at as string} /></>
                      )}
                      {doc?.full_name ? <> · {String(doc.full_name)}</> : null}
                    </p>
                    {(a.reason as string | null) && (
                      <p className="text-xs mt-1" style={{ color: '#475569' }}>
                        <span className="font-medium">Reason:</span> {a.reason as string}
                      </p>
                    )}
                  </div>
                </div>
                <Link href={`/ipd/${a.id}`}
                  className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium min-h-[36px] flex items-center"
                  style={{ background: '#EDE9FE', color: '#7C3AED', border: '1px solid #DDD6FE', whiteSpace: 'nowrap' }}>
                  View →
                </Link>
              </div>
            </GlassCard>
          )
        }

        if (item.kind === 'visit') {
          const v = item.data
          return (
            <GlassCard key={v.id} className="p-4" style={{ borderLeft: '3px solid #0D9488' }}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: 'rgba(13,148,136,0.08)', border: '1px solid rgba(13,148,136,0.2)' }}>
                    <Stethoscope className="w-4 h-4" style={{ color: '#0D9488' }} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                        style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488' }}>OPD Visit</span>
                      <StatusBadge status={v.status} label={v.status === 'open' ? 'Open' : 'Closed'} />
                      {v.status === 'closed' && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={v.billing_status === 'billed'
                            ? { background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }
                            : v.billing_status === 'waived'
                            ? { background: '#F8FAFC', color: '#64748B', border: '1px solid #E2E8F0' }
                            : { background: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A' }}>
                          {v.billing_status === 'billed' ? 'Billed' : v.billing_status === 'waived' ? 'Waived' : 'Unbilled'}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold mt-1" style={{ color: '#0F172A' }}>
                      {v.diagnosis || 'No diagnosis recorded'}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                      {v.doctor?.full_name ?? 'Unknown doctor'} · <DateText date={v.visit_date} />
                    </p>
                    {v.complaint && (
                      <p className="text-xs mt-1" style={{ color: '#475569' }}>
                        <span className="font-medium">Complaint:</span> {v.complaint}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {(v.prescriptions?.length ?? 0) > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: '#DCFCE7', color: '#15803D', border: '1px solid #BBF7D0' }}>
                      {v.prescriptions!.length} Rx
                    </span>
                  )}
                  <Link href={`/opd/${v.id}`}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                    style={v.status === 'open'
                      ? { background: '#0D9488', color: '#fff' }
                      : { background: '#EDE9FE', color: '#7C3AED', border: '1px solid #DDD6FE' }}>
                    {v.status === 'open' ? 'Continue' : 'View →'}
                  </Link>
                </div>
              </div>
            </GlassCard>
          )
        }

        // appointment
        const ap = item.data
        return (
          <GlassCard key={ap.id} className="p-4" style={{ borderLeft: '3px solid #94A3B8' }}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: '#F1F5F9', border: '1px solid #E2E8F0' }}>
                  <Clock className="w-4 h-4" style={{ color: '#64748B' }} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: '#F1F5F9', color: '#64748B' }}>Appointment</span>
                  </div>
                  <p className="text-sm font-medium mt-1" style={{ color: '#0F172A' }}>
                    {ap.doctor?.full_name ?? 'Unknown'} · {ap.department?.name}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                    <DateText date={ap.scheduled_at} />
                    {ap.token_no && <> · Token #{ap.token_no}</>}
                  </p>
                </div>
              </div>
              <StatusBadge status={ap.status} label={ap.status.replace('_', ' ')} />
            </div>
          </GlassCard>
        )
      })}
        </div>
      ))}
    </div>
  )
}

function BillRow({ b }: { b: Bill }) {
  const style = b.bill_source === 'advance_refund'
    ? { bg: '#FEF3C7', color: '#B45309', label: 'Advance Refund' }
    : BILL_STATUS_STYLE[b.status] ?? BILL_STATUS_STYLE.draft
  const isRefund = b.bill_source === 'advance_refund'
  const balance = b.total - b.paid
  return (
    <Link href={`/billing/${b.id}`} className="block"
      onMouseEnter={(e) => { const c = e.currentTarget.firstElementChild as HTMLElement; if (c) c.style.background = 'rgba(13,148,136,0.04)' }}
      onMouseLeave={(e) => { const c = e.currentTarget.firstElementChild as HTMLElement; if (c) c.style.background = '' }}
    >
      <GlassCard className="p-3 cursor-pointer transition-all">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-sm font-semibold font-mono flex-shrink-0" style={{ color: '#0F172A' }}>{b.bill_no}</p>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
              style={{ background: style.bg, color: style.color }}>
              {style.label}
            </span>
            <p className="text-xs truncate" style={{ color: '#94A3B8' }}>
              <DateText date={b.billing_date ?? b.created_at} />
              {b.items && <> · {b.items.length} item{b.items.length !== 1 ? 's' : ''}</>}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-sm font-bold" style={{ color: isRefund ? '#B45309' : '#0F172A' }}>
              {isRefund ? '−' : ''}<Money amount={Math.abs(b.total)} />
            </p>
            {!isRefund && balance > 0 && b.status !== 'cancelled' && (
              <p className="text-xs font-medium" style={{ color: '#DC2626' }}>Due: <Money amount={balance} /></p>
            )}
          </div>
        </div>
      </GlassCard>
    </Link>
  )
}

function BillsTab({ bills, admissions, visits, outstanding }: {
  bills: Bill[]; admissions: Admission[]; visits: Visit[]; outstanding: number
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['__standalone__']))

  if (bills.length === 0) {
    return <EmptyState title="No bills yet" description="Bills will appear here once generated." />
  }

  // Build encounter groups
  type Group = { id: string; label: string; subLabel: string; date: string; bills: Bill[]; accentColor: string }
  const groups: Group[] = []
  const linkedIds = new Set<string>()

  // Build a set of visit dates → visit ids for date-based fallback matching
  const visitsByDate = new Map<string, Visit>()
  for (const v of visits) {
    const d = (v.visit_date as string).slice(0, 10)
    // If multiple visits on same day, prefer the latest one (overwrite)
    visitsByDate.set(d, v)
  }

  for (const adm of admissions) {
    const ward = (adm.ward as Record<string,unknown> | null | undefined)
    const bed  = (adm.bed  as Record<string,unknown> | null | undefined)
    // Primary: explicit admission_id link
    const admBills = bills.filter(b => b.admission_id === adm.id)
    if (admBills.length === 0) continue
    admBills.forEach(b => linkedIds.add(b.id))
    const regularTotal = admBills.filter(b => b.bill_source !== 'advance_refund').reduce((s,b) => s + b.total, 0)
    const refundTotal  = admBills.filter(b => b.bill_source === 'advance_refund').reduce((s,b) => s + Math.abs(b.total), 0)
    const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
    groups.push({
      id: adm.id,
      label: `IPD Admission — ${ward?.name as string ?? 'Ward'} · Bed ${bed?.bed_no as string ?? '—'}`,
      subLabel: `${fmtDate(adm.admitted_at as string)}${(adm.discharged_at as string|null) ? ` → ${fmtDate(adm.discharged_at as string)}` : ' · Admitted'}  |  Total ₹${regularTotal.toLocaleString('en-IN')}${refundTotal > 0 ? `  ·  Refunded ₹${refundTotal.toLocaleString('en-IN')}` : ''}`,
      date: adm.admitted_at as string,
      bills: admBills,
      accentColor: '#7C3AED',
    })
  }

  for (const v of visits) {
    const visitDate = (v.visit_date as string).slice(0, 10)
    const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
    const visitBills = bills.filter(b => {
      if (b.admission_id) return false                         // belongs to IPD — skip
      if (b.visit_id) return b.visit_id === v.id               // explicit link
      // Fallback: no link at all — match by same calendar date
      const billDate = (b.billing_date ?? b.created_at).slice(0, 10)
      return billDate === visitDate && visitsByDate.get(visitDate)?.id === v.id
    })
    if (visitBills.length === 0) continue
    visitBills.forEach(b => linkedIds.add(b.id))
    const total = visitBills.filter(b => b.bill_source !== 'advance_refund').reduce((s,b) => s + b.total, 0)
    groups.push({
      id: v.id,
      label: `OPD Visit — ${v.doctor?.full_name ?? 'Unknown doctor'}`,
      subLabel: `${fmtDate(v.visit_date as string)}  |  Total ₹${total.toLocaleString('en-IN')}`,
      date: v.visit_date as string,
      bills: visitBills,
      accentColor: '#0D9488',
    })
  }

  // Sort groups newest first
  groups.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const standalone = bills.filter(b => !linkedIds.has(b.id))

  const regularBills = bills.filter(b => b.bill_source !== 'advance_refund' && !b.admission_id || b.bill_source !== 'advance_refund')
  const totalPaid = bills.filter(b => b.bill_source !== 'advance_refund').reduce((s,b) => s + b.paid, 0)
  const totalBillCount = bills.filter(b => b.bill_source !== 'advance_refund').length

  function toggle(id: string) {
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set())
  function toggleMonth(key: string) {
    setCollapsedMonths(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })
  }

  return (
    <div className="space-y-3">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <GlassCard className="p-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#94A3B8' }}>Total Bills</p>
          <p className="text-xl font-bold" style={{ color: '#0F172A' }}>{totalBillCount}</p>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#94A3B8' }}>Outstanding</p>
          <p className="text-xl font-bold" style={{ color: outstanding > 0 ? '#DC2626' : '#15803D' }}>
            <Money amount={outstanding} />
          </p>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#94A3B8' }}>Total Paid</p>
          <p className="text-xl font-bold" style={{ color: '#15803D' }}><Money amount={totalPaid} /></p>
        </GlassCard>
      </div>

      {/* Encounter groups — by year/month */}
      {groupByYearMonth(groups, (g) => g.date).map(({ key, label, items: monthGroups }) => (
        <div key={key} className="space-y-3">
          <MonthHeader label={label} open={!collapsedMonths.has(key)} onToggle={() => toggleMonth(key)} count={monthGroups.length} />
          {!collapsedMonths.has(key) && monthGroups.map(group => {
            const open = expanded.has(group.id)
            return (
              <div key={group.id} style={{ border: `1px solid ${group.accentColor}30`, borderRadius: '12px', overflow: 'hidden' }}>
                <button className="w-full flex items-center justify-between gap-3 p-4 text-left"
                  style={{ background: `${group.accentColor}08`, borderBottom: open ? `1px solid ${group.accentColor}20` : 'none' }}
                  onClick={() => toggle(group.id)}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{group.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>{group.subLabel}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${group.accentColor}15`, color: group.accentColor }}>
                      {group.bills.length} bill{group.bills.length !== 1 ? 's' : ''}
                    </span>
                    {open ? <ChevronUp className="w-4 h-4" style={{ color: '#94A3B8' }} /> : <ChevronDown className="w-4 h-4" style={{ color: '#94A3B8' }} />}
                  </div>
                </button>
                {open && (
                  <div className="p-3 space-y-2" style={{ background: '#fff' }}>
                    {group.bills.map(b => <BillRow key={b.id} b={b} />)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}

      {/* Standalone bills */}
      {standalone.length > 0 && (
        <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
          <button className="w-full flex items-center justify-between gap-3 p-4 text-left"
            style={{ background: '#F8FAFC', borderBottom: expanded.has('__standalone__') ? '1px solid #E2E8F0' : 'none' }}
            onClick={() => toggle('__standalone__')}>
            <div>
              <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>Standalone Bills</p>
              <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>Not linked to an admission or visit</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#F1F5F9', color: '#64748B' }}>
                {standalone.length} bill{standalone.length !== 1 ? 's' : ''}
              </span>
              {expanded.has('__standalone__') ? <ChevronUp className="w-4 h-4" style={{ color: '#94A3B8' }} /> : <ChevronDown className="w-4 h-4" style={{ color: '#94A3B8' }} />}
            </div>
          </button>
          {expanded.has('__standalone__') && (
            <div className="p-3 space-y-2" style={{ background: '#fff' }}>
              {standalone.map(b => <BillRow key={b.id} b={b} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function InfoTab({ patient }: { patient: Patient }) {
  const fields: { label: string; value: string | null }[] = [
    { label: 'Full Name', value: patient.full_name },
    { label: 'UHID', value: patient.uhid },
    { label: 'Date of Birth', value: patient.dob },
    { label: 'Gender', value: patient.gender },
    { label: 'Phone', value: patient.phone },
    { label: 'Email', value: patient.email },
    { label: 'Blood Group', value: patient.blood_group },
    { label: 'Aadhaar Number', value: patient.aadhaar_no ?? null },
    { label: 'Address', value: patient.address },
    { label: 'Allergies (free text)', value: patient.allergies },
    { label: 'Emergency Contact', value: patient.emergency_contact_name },
    { label: 'Emergency Phone', value: patient.emergency_contact_phone },
  ]

  return (
    <GlassCard className="p-6">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
        {fields.map(({ label, value }) => (
          <div key={label}>
            <dt className="text-xs font-semibold uppercase tracking-wider mb-0.5" style={{ color: '#94A3B8' }}>
              {label}
            </dt>
            <dd className="text-sm" style={{ color: value ? '#0F172A' : '#CBD5E1' }}>
              {label === 'Date of Birth' && value ? <DateText date={value} /> : (value || '—')}
            </dd>
          </div>
        ))}
      </dl>
    </GlassCard>
  )
}
