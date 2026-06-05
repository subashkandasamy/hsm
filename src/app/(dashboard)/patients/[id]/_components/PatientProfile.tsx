'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, AlertTriangle, Droplet, User, Phone, Mail, MapPin, Clock, Stethoscope } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import StatusBadge from '@/components/ui/StatusBadge'
import DateText from '@/components/ui/DateText'
import EmptyState from '@/components/ui/EmptyState'
import type { Patient, Visit, Appointment } from '@/lib/types'

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

type Tab = 'visits' | 'appointments' | 'info'

interface Props {
  patient: Patient
  visits: Visit[]
  appointments: Appointment[]
}

export default function PatientProfile({ patient, visits, appointments }: Props) {
  const [tab, setTab] = useState<Tab>('visits')

  const TABS = [
    { key: 'visits' as Tab, label: 'Visits', count: visits.length },
    { key: 'appointments' as Tab, label: 'Appointments', count: appointments.length },
    { key: 'info' as Tab, label: 'Info', count: null },
  ]

  return (
    <div>
      {/* Back link */}
      <Link href="/patients" className="inline-flex items-center gap-1.5 text-sm mb-4"
        style={{ color: '#64748B' }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#0D9488' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = '#64748B' }}
      >
        <ArrowLeft className="w-4 h-4" /> Back to Patients
      </Link>

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
            </div>
          </div>

          {/* Blood group + allergies badges */}
          <div className="flex items-center gap-2 flex-wrap">
            {patient.blood_group && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold"
                style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
                <Droplet className="w-4 h-4" />
                {patient.blood_group}
              </div>
            )}
            {patient.allergies && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold"
                style={{ background: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A' }}>
                <AlertTriangle className="w-4 h-4" />
                Allergies
              </div>
            )}
          </div>
        </div>

        {/* Allergies detail */}
        {patient.allergies && (
          <div className="mt-4 p-3 rounded-xl text-sm"
            style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}>
            <span className="font-semibold">Allergies: </span>{patient.allergies}
          </div>
        )}
      </GlassCard>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 rounded-xl w-fit"
        style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid #E2E8F0' }}>
        {TABS.map(({ key, label, count }) => (
          <button key={key} onClick={() => setTab(key)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={tab === key
              ? { background: '#0D9488', color: '#fff' }
              : { color: '#64748B', background: 'transparent' }
            }
          >
            {label}
            {count !== null && (
              <span className="text-xs px-1.5 py-0.5 rounded-full"
                style={tab === key
                  ? { background: 'rgba(255,255,255,0.25)', color: '#fff' }
                  : { background: '#F1F5F9', color: '#64748B' }
                }>{count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'visits' && <VisitsTab visits={visits} />}
      {tab === 'appointments' && <AppointmentsTab appointments={appointments} />}
      {tab === 'info' && <InfoTab patient={patient} />}
    </div>
  )
}

function VisitsTab({ visits }: { visits: Visit[] }) {
  if (visits.length === 0) {
    return <EmptyState title="No visits yet" description="Visits will appear here after a consultation is completed." />
  }

  return (
    <div className="space-y-3">
      {visits.map((v) => (
        <GlassCard key={v.id} className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: 'rgba(13,148,136,0.08)', border: '1px solid rgba(13,148,136,0.15)' }}>
                <Stethoscope className="w-4 h-4" style={{ color: '#0D9488' }} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>
                    {v.diagnosis || 'No diagnosis recorded'}
                  </p>
                  <StatusBadge status={v.status} label={v.status === 'open' ? 'Open' : 'Closed'} />
                </div>
                <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                  {v.doctor?.full_name ?? 'Unknown doctor'} · <DateText date={v.visit_date} />
                </p>
                {v.complaint && (
                  <p className="text-xs mt-1" style={{ color: '#475569' }}>
                    <span className="font-medium">Complaint:</span> {v.complaint}
                  </p>
                )}
                {v.icd_code && (
                  <span className="inline-block text-xs px-2 py-0.5 rounded-md mt-1 font-mono"
                    style={{ background: '#DBEAFE', color: '#1D4ED8' }}>
                    ICD: {v.icd_code}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              {(v.prescriptions?.length ?? 0) > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: '#DCFCE7', color: '#15803D', border: '1px solid #BBF7D0' }}>
                  {v.prescriptions!.length} Rx
                </span>
              )}
              {v.status === 'open' && (
                <Link href={`/opd/${v.id}`}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                  style={{ background: '#0D9488', color: '#fff' }}
                >
                  Continue
                </Link>
              )}
            </div>
          </div>
        </GlassCard>
      ))}
    </div>
  )
}

function AppointmentsTab({ appointments }: { appointments: Appointment[] }) {
  if (appointments.length === 0) {
    return <EmptyState title="No appointments" description="Booked appointments will appear here." />
  }

  return (
    <div className="space-y-2">
      {appointments.map((a) => (
        <GlassCard key={a.id} className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 flex-shrink-0" style={{ color: '#94A3B8' }} />
              <div>
                <p className="text-sm font-medium" style={{ color: '#0F172A' }}>
                  {a.doctor?.full_name ?? 'Unknown'} · {a.department?.name}
                </p>
                <p className="text-xs" style={{ color: '#64748B' }}>
                  <DateText date={a.scheduled_at} />
                  {a.token_no && <> · Token #{a.token_no}</>}
                </p>
              </div>
            </div>
            <StatusBadge status={a.status} label={a.status.replace('_', ' ')} />
          </div>
        </GlassCard>
      ))}
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
    { label: 'Address', value: patient.address },
    { label: 'Allergies', value: patient.allergies },
    { label: 'Emergency Contact', value: patient.emergency_contact_name },
    { label: 'Emergency Phone', value: patient.emergency_contact_phone },
  ]

  return (
    <GlassCard className="p-6">
      <dl className="grid grid-cols-2 gap-x-8 gap-y-4">
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
