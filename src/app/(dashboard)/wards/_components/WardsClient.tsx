'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, RefreshCw, Settings } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import EmptyState from '@/components/ui/EmptyState'
import StatusBadge from '@/components/ui/StatusBadge'
import { useAuth } from '@/context/AuthContext'
import { hasPermission } from '@/lib/rbac'
import { getWardBoard } from '@/app/actions/wards'
import type { WardWithBeds, BedWithOccupant, Ward, Bed } from '@/lib/types'
import CreateWardModal from './CreateWardModal'
import AddBedsModal from './AddBedsModal'
import AdmitModal from './AdmitModal'

interface Doctor { id: string; full_name: string }
interface Dept { id: string; name: string }

interface Props {
  initialBoard: WardWithBeds[]
  wards: Ward[]
  departments: Dept[]
  doctors: Doctor[]
}

const BED_COLORS = {
  available:   { bg: '#DCFCE7', border: '#86EFAC', text: '#15803D', hover: '#BBF7D0' },
  occupied:    { bg: '#FEE2E2', border: '#FCA5A5', text: '#DC2626', hover: '#FECACA' },
  maintenance: { bg: '#FEF3C7', border: '#FCD34D', text: '#B45309', hover: '#FDE68A' },
}

function BedTile({
  bed,
  onAdmitHere,
  onViewPatient,
}: {
  bed: BedWithOccupant
  onAdmitHere: (bed: BedWithOccupant) => void
  onViewPatient: (admissionId: string) => void
}) {
  const colors = BED_COLORS[bed.status]
  const isOccupied = bed.status === 'occupied'

  return (
    <button
      onClick={() => {
        if (isOccupied && bed.admission_id) onViewPatient(bed.admission_id)
        else if (bed.status === 'available') onAdmitHere(bed)
      }}
      title={
        isOccupied
          ? `${bed.patient_name ?? 'Patient'} (${bed.patient_uhid ?? ''})`
          : bed.status === 'available'
          ? 'Click to admit patient'
          : 'Under maintenance'
      }
      style={{
        width: '100%', minHeight: '4.5rem',
        background: colors.bg,
        border: `2px solid ${colors.border}`,
        borderRadius: '0.75rem',
        cursor: bed.status === 'maintenance' ? 'default' : 'pointer',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: '0.125rem',
        transition: 'all 0.15s',
        padding: '0.375rem',
      }}
      onMouseEnter={(e) => {
        if (bed.status !== 'maintenance') {
          e.currentTarget.style.borderColor = colors.text
          e.currentTarget.style.transform = 'scale(1.05)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = colors.border
        e.currentTarget.style.transform = 'scale(1)'
      }}
    >
      <span style={{ fontSize: '0.6rem', fontWeight: 700, color: colors.text, letterSpacing: '0.05em' }}>
        {bed.bed_no}
      </span>
      {isOccupied && bed.patient_name && (
        <span style={{ fontSize: '0.5rem', color: colors.text, textAlign: 'center', lineHeight: 1.2, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {bed.patient_name.split(' ')[0]}
        </span>
      )}
      {bed.status === 'maintenance' && (
        <span style={{ fontSize: '0.55rem', color: colors.text }}>⚙</span>
      )}
    </button>
  )
}

export default function WardsClient({ initialBoard, wards, departments, doctors }: Props) {
  const router = useRouter()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const canAdmit = profile && hasPermission(profile.role, 'ipd:write')

  const [board, setBoard] = useState<WardWithBeds[]>(initialBoard)
  const [loading, setLoading] = useState(false)
  const [showCreateWard, setShowCreateWard] = useState(false)
  const [addBedsWard, setAddBedsWard] = useState<Ward | null>(null)
  const [admitBed, setAdmitBed] = useState<BedWithOccupant | null>(null)

  async function refresh() {
    setLoading(true)
    const b = await getWardBoard()
    setBoard(b)
    setLoading(false)
  }

  const totalBeds = board.reduce((s, w) => s + w.beds.length, 0)
  const availBeds = board.reduce((s, w) => s + w.beds.filter((b) => b.status === 'available').length, 0)
  const occupBeds = board.reduce((s, w) => s + w.beds.filter((b) => b.status === 'occupied').length, 0)

  return (
    <div>
      <PageHeader
        title="Ward Board"
        subtitle="Live bed availability across all wards"
        action={
          <div className="flex items-center gap-2">
            <button onClick={refresh}
              className="p-2 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#64748B', cursor: 'pointer' }}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {isAdmin && (
              <button onClick={() => setShowCreateWard(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold"
                style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                <Plus className="w-4 h-4" /> Add Ward
              </button>
            )}
          </div>
        }
      />

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-2 md:gap-3 mb-5">
        {[
          { label: 'Total Beds', value: totalBeds, color: '#0D9488', bg: 'rgba(13,148,136,0.08)' },
          { label: 'Available', value: availBeds, color: '#15803D', bg: '#DCFCE7' },
          { label: 'Occupied', value: occupBeds, color: '#DC2626', bg: '#FEE2E2' },
        ].map(({ label, value, color, bg }) => (
          <GlassCard key={label} className="p-4 flex items-center gap-3">
            <span className="text-2xl font-bold" style={{ color }}>{value}</span>
            <span className="text-sm font-medium" style={{ color: '#64748B' }}>{label}</span>
          </GlassCard>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center flex-wrap gap-3 md:gap-4 mb-4 text-xs">
        {Object.entries(BED_COLORS).map(([status, colors]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded-md"
              style={{ background: colors.bg, border: `2px solid ${colors.border}` }} />
            <span className="capitalize" style={{ color: '#64748B' }}>{status}</span>
          </div>
        ))}
      </div>

      {board.length === 0 ? (
        <GlassCard className="p-6">
          <EmptyState
            title="No wards configured"
            description={isAdmin ? 'Click "Add Ward" to create the first ward and add beds.' : 'No wards have been set up yet.'}
          />
        </GlassCard>
      ) : (
        <div className="space-y-5">
          {board.map((ward) => (
            <GlassCard key={ward.id} className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold" style={{ color: '#0F172A' }}>{ward.name}</h3>
                  <div className="flex items-center gap-3 mt-0.5">
                    {ward.ward_type && (
                      <span className="text-xs px-2 py-0.5 rounded-full capitalize"
                        style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488' }}>
                        {ward.ward_type}
                      </span>
                    )}
                    <span className="text-xs" style={{ color: '#94A3B8' }}>
                      {ward.beds.filter(b => b.status === 'available').length} / {ward.beds.length} available
                    </span>
                  </div>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => setAddBedsWard(ward as Ward)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                    <Settings className="w-3.5 h-3.5" /> Add Beds
                  </button>
                )}
              </div>
              {ward.beds.length === 0 ? (
                <p className="text-sm" style={{ color: '#94A3B8' }}>No beds in this ward yet.</p>
              ) : (
                <div className="grid gap-2" style={{
                  gridTemplateColumns: 'repeat(auto-fill, minmax(4.5rem, 1fr))',
                }}>
                  {ward.beds.map((bed) => (
                    <BedTile
                      key={bed.id}
                      bed={bed}
                      onAdmitHere={(b) => canAdmit && setAdmitBed(b)}
                      onViewPatient={(admissionId) => router.push(`/ipd/${admissionId}`)}
                    />
                  ))}
                </div>
              )}
            </GlassCard>
          ))}
        </div>
      )}

      <CreateWardModal
        open={showCreateWard}
        onClose={() => setShowCreateWard(false)}
        departments={departments}
        onSuccess={(ward) => {
          setBoard((b) => [...b, { ...ward, beds: [] }])
          setShowCreateWard(false)
        }}
      />

      {addBedsWard && (
        <AddBedsModal
          open={true}
          ward={addBedsWard}
          onClose={() => setAddBedsWard(null)}
          onSuccess={() => { setAddBedsWard(null); refresh() }}
        />
      )}

      {admitBed && (
        <AdmitModal
          open={true}
          preselectedBed={{ id: admitBed.id, bed_no: admitBed.bed_no, ward_name: board.find(w => w.id === admitBed.ward_id)?.name ?? '' }}
          doctors={doctors}
          wards={board.map(w => ({ id: w.id, name: w.name, availableBeds: w.beds.filter(b => b.status === 'available') }))}
          onClose={() => setAdmitBed(null)}
          onSuccess={(admissionId) => { setAdmitBed(null); router.push(`/ipd/${admissionId}`); refresh() }}
        />
      )}
    </div>
  )
}
