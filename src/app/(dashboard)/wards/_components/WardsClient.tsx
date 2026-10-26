'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, RefreshCw, Scissors, Pencil, Check, X,
  IndianRupee, Trash2, MapPin, BedDouble, DoorOpen,
  ChevronDown, ChevronRight, Search, Building2,
} from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import EmptyState from '@/components/ui/EmptyState'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { useAuth } from '@/context/AuthContext'
import {
  getWardBoard,
  updateWardRoomTypeRate,
  updateWardRoomType,
  updateWardRate,
  deleteWardRoomType,
  createWardRoomType,
  deleteWard,
  listNursingUnits,
} from '@/app/actions/wards'
import { createRoom as createOtRoom, updateRoom as updateOtRoom, deleteRoom as deleteOtRoom } from '@/app/actions/ot'
import type { WardWithBeds, BedWithOccupant, Ward, OtRoom, WardRoomType, NursingUnit } from '@/lib/types'
import CreateWardModal from './CreateWardModal'
import EditWardModal from './EditWardModal'
import AddBedsModal from './AddBedsModal'
import NursingUnitsModal from './NursingUnitsModal'

interface Doctor { id: string; full_name: string }
interface Dept   { id: string; name: string }

interface Props {
  initialBoard:    WardWithBeds[]
  wards:           Ward[]
  departments:     Dept[]
  doctors:         Doctor[]
  initialOtRooms:  OtRoom[]
  initialRoomTypes: WardRoomType[]
  initialNursingUnits: NursingUnit[]
}

// ---- Private room tile (single bed) ----
function RoomTile({ ward, bed, onView, isAdmin, onEdit, onDelete }: {
  ward: WardWithBeds
  bed: BedWithOccupant | null
  onView: (id: string) => void
  isAdmin?: boolean
  onEdit?: () => void
  onDelete?: () => void
}) {
  const status = bed?.status ?? 'available'
  const isOccupied = status === 'occupied'

  const palette = {
    available:   { bg: '#F0FDF4', border: '#86EFAC', title: '#15803D', sub: '#4ADE80' },
    occupied:    { bg: '#FFF1F2', border: '#FCA5A5', title: '#DC2626', sub: '#F87171' },
    maintenance: { bg: '#FFFBEB', border: '#FCD34D', title: '#B45309', sub: '#FBBF24' },
  }
  const p = palette[status]
  const locationParts: { label: string; value: string }[] = [
    ...(ward.floor ? [{ label: 'Floor', value: ward.floor }] : []),
    ...(ward.block ? [{ label: 'Block', value: ward.block }] : []),
  ]

  function handleCardClick() {
    if (isOccupied && bed?.admission_id) onView(bed.admission_id)
  }

  return (
    <div
      role="button"
      tabIndex={status === 'maintenance' ? -1 : 0}
      onClick={handleCardClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardClick() } }}
      onMouseEnter={e => { if (isOccupied) { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 4px 12px ${p.border}60` } }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ''; (e.currentTarget as HTMLDivElement).style.boxShadow = '' }}
      title={isOccupied ? `${bed?.patient_name ?? ''} · Click to view` : status === 'available' ? 'Available' : 'Under maintenance'}
      style={{
        minWidth: 0,
        background: p.bg, border: `1.5px solid ${p.border}`, borderRadius: '0.75rem',
        cursor: isOccupied ? 'pointer' : 'default',
        textAlign: 'left', padding: '0.5rem 0.625rem',
        transition: 'transform 0.1s, box-shadow 0.1s',
        display: 'flex', flexDirection: 'column', gap: '0.125rem',
        outline: 'none',
      }}
    >
      {/* Name row with inline action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: p.title, letterSpacing: '-0.01em', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ward.name}</span>
        {isAdmin && (
          <div style={{ display: 'flex', gap: '0.15rem', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <button onClick={onEdit}
              style={{ padding: '0.1rem', borderRadius: '0.25rem', background: 'rgba(255,255,255,0.7)', color: '#64748B', border: 'none', cursor: 'pointer', lineHeight: 0 }}>
              <Pencil style={{ width: '0.6rem', height: '0.6rem' }} />
            </button>
            <button onClick={onDelete}
              style={{ padding: '0.1rem', borderRadius: '0.25rem', background: 'rgba(254,242,242,0.8)', color: '#EF4444', border: 'none', cursor: 'pointer', lineHeight: 0 }}>
              <Trash2 style={{ width: '0.6rem', height: '0.6rem' }} />
            </button>
          </div>
        )}
      </div>
      {isOccupied && bed?.patient_name && (
        <span style={{ fontSize: '0.65rem', color: p.title, opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {bed.patient_name}
        </span>
      )}
      {locationParts.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }}>
          {locationParts.map(({ label, value }) => (
            <span key={label} style={{ fontSize: '0.55rem', display: 'inline-flex', alignItems: 'center', gap: '0.15rem', background: 'rgba(148,163,184,0.12)', borderRadius: '0.25rem', padding: '0.05rem 0.3rem' }}>
              <span style={{ color: '#94A3B8', fontWeight: 500 }}>{label}</span>
              <span style={{ fontWeight: 600, color: '#475569' }}>{value}</span>
            </span>
          ))}
        </div>
      )}
      {isOccupied && bed?.patient_uhid && (
        <span style={{ fontSize: '0.6rem', color: p.sub, fontFamily: 'monospace' }}>{bed.patient_uhid}</span>
      )}
      {status === 'maintenance' && (
        <span style={{ fontSize: '0.6rem', color: p.title }}>Under maintenance</span>
      )}
    </div>
  )
}

// ---- Bed chip for multi-bed / general ward ----
function BedChip({ bed, onView }: {
  bed: BedWithOccupant
  onView: (id: string) => void
}) {
  const colors = {
    available:   { bg: '#DCFCE7', border: '#86EFAC', text: '#15803D' },
    occupied:    { bg: '#FEE2E2', border: '#FCA5A5', text: '#DC2626' },
    maintenance: { bg: '#FEF3C7', border: '#FCD34D', text: '#B45309' },
  }
  const c = colors[bed.status]
  const isOccupied = bed.status === 'occupied'
  return (
    <button
      onClick={() => { if (isOccupied && bed.admission_id) onView(bed.admission_id) }}
      title={isOccupied ? `${bed.patient_name ?? ''} · ${bed.patient_uhid ?? ''}` : bed.status === 'available' ? 'Available' : 'Maintenance'}
      style={{
        background: c.bg, border: `1.5px solid ${c.border}`, borderRadius: '0.5rem', color: c.text,
        cursor: isOccupied ? 'pointer' : 'default',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '0.1rem', padding: '0.25rem 0.125rem', minHeight: '3.5rem', width: '100%',
        transition: 'transform 0.1s',
      }}
      onMouseEnter={e => { if (isOccupied) e.currentTarget.style.transform = 'scale(1.05)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = '' }}
    >
      <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.03em' }}>{bed.bed_no}</span>
      {isOccupied && bed.patient_name && (
        <span style={{ fontSize: '0.5rem', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.1 }}>
          {bed.patient_name.split(' ')[0]}
        </span>
      )}
    </button>
  )
}

// ---- Collapsible status group (inside a room type section) ----
function StatusGroup({ label, count, dotColor, defaultOpen, children }: {
  label: string; count: number; dotColor: string; defaultOpen: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (count === 0) return null
  return (
    <div>
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 w-full py-1.5 px-1 rounded-lg"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        {open ? <ChevronDown className="w-3 h-3 flex-shrink-0" style={{ color: '#94A3B8' }} />
               : <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: '#94A3B8' }} />}
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }} />
        <span className="text-xs font-semibold" style={{ color: dotColor }}>{label}</span>
        <span className="text-xs" style={{ color: '#94A3B8' }}>({count})</span>
      </button>
      {open && <div className="mt-1 mb-2">{children}</div>}
    </div>
  )
}

// ---- Room type section ----
function RoomTypeSection({
  roomType, wards, isAdmin, forceExpand,
  onView, onAddRoom, onAddBeds, onEditWard, onDeleteWard, onEditType, onRateUpdate, onDeleteType,
}: {
  roomType: WardRoomType
  wards: WardWithBeds[]
  isAdmin: boolean
  forceExpand?: boolean
  onView:        (admissionId: string) => void
  onAddRoom:     (typeId: string) => void
  onAddBeds:     (ward: WardWithBeds) => void
  onEditWard:    (ward: WardWithBeds) => void
  onDeleteWard:  (id: string) => void
  onEditType:    (rt: WardRoomType) => void
  onRateUpdate:  (typeId: string, rate: number) => void
  onDeleteType:  (id: string) => void
}) {
  const [sectionOpen, setSectionOpen] = useState(true)
  const [editingRate, setEditingRate]  = useState(false)
  const [rateInput, setRateInput]      = useState(String(roomType.daily_rate))
  const [saving, setSaving]            = useState(false)

  const isOpen = forceExpand || sectionOpen

  const totalRooms     = wards.length
  const availableCount = roomType.is_multi_bed
    ? wards.reduce((s, w) => s + w.beds.filter(b => b.status === 'available').length, 0)
    : wards.filter(w => (w.beds[0]?.status ?? 'available') === 'available').length
  const occupiedCount  = roomType.is_multi_bed
    ? wards.reduce((s, w) => s + w.beds.filter(b => b.status === 'occupied').length, 0)
    : wards.filter(w => w.beds[0]?.status === 'occupied').length

  // For private rooms: group by bed status
  const availRooms = roomType.is_multi_bed ? [] : wards.filter(w => (w.beds[0]?.status ?? 'available') === 'available')
  const occRooms   = roomType.is_multi_bed ? [] : wards.filter(w => w.beds[0]?.status === 'occupied')
  const maintRooms = roomType.is_multi_bed ? [] : wards.filter(w => w.beds[0]?.status === 'maintenance')

  async function saveRate() {
    const rate = parseFloat(rateInput)
    if (isNaN(rate) || rate < 0) return
    setSaving(true)
    const res = await updateWardRoomTypeRate(roomType.id, rate)
    setSaving(false)
    if (res.success) { onRateUpdate(roomType.id, rate); setEditingRate(false) }
  }

  function privateRoomGrid(list: WardWithBeds[]) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(9rem, 1fr))', gap: '0.5rem' }}>
        {list.map(ward => (
          <RoomTile
            key={ward.id}
            ward={ward} bed={ward.beds[0] ?? null}
            onView={onView}
            isAdmin={isAdmin}
            onEdit={() => onEditWard(ward)}
            onDelete={() => onDeleteWard(ward.id)}
          />
        ))}
      </div>
    )
  }

  return (
    <GlassCard className="overflow-hidden">
      {/* Type header — two-row layout for mobile */}
      <div className="px-3 py-3 space-y-2" style={{ borderBottom: isOpen ? '1px solid rgba(226,232,240,0.6)' : 'none' }}>

        {/* Row 1: chevron + icon + name + edit pencil + delete */}
        <div className="flex items-center gap-2">
          <button onClick={() => setSectionOpen(o => !o)}
            style={{ padding: '0.1rem', background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0, lineHeight: 0 }}>
            {isOpen
              ? <ChevronDown  className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
              : <ChevronRight className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
            }
          </button>

          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: roomType.is_multi_bed ? 'rgba(13,148,136,0.1)' : 'rgba(99,102,241,0.1)' }}>
            {roomType.is_multi_bed
              ? <BedDouble className="w-3.5 h-3.5" style={{ color: '#0D9488' }} />
              : <DoorOpen  className="w-3.5 h-3.5" style={{ color: '#4F46E5' }} />
            }
          </div>

          <h3 className="font-semibold text-sm leading-tight flex-1 min-w-0 truncate" style={{ color: '#0F172A' }}>
            {roomType.name}
          </h3>

          {isAdmin && (
            <button onClick={() => onEditType(roomType)} title="Edit room type"
              style={{ padding: '0.2rem', borderRadius: '0.3rem', background: 'transparent', color: '#CBD5E1', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
              <Pencil className="w-3 h-3" />
            </button>
          )}

          {isAdmin && (
            <button onClick={() => onDeleteType(roomType.id)} title="Delete room type"
              style={{ padding: '0.2rem', borderRadius: '0.375rem', background: '#FEF2F2', color: '#EF4444', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Row 2: availability + rate + Add Room */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs flex-1" style={{ color: '#94A3B8', minWidth: '6rem' }}>
            {roomType.is_multi_bed
              ? `${availableCount} avail · ${occupiedCount} occ · ${totalRooms} ward${totalRooms !== 1 ? 's' : ''}`
              : `${availableCount} avail · ${occupiedCount} occ · ${totalRooms} room${totalRooms !== 1 ? 's' : ''}`
            }
          </span>

          {/* Rate */}
          {editingRate ? (
            <div className="flex items-center gap-1">
              <div className="relative" style={{ width: '6.5rem' }}>
                <IndianRupee className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2" style={{ color: '#94A3B8' }} />
                <input type="number" min={0} step={1} value={rateInput}
                  onChange={e => setRateInput(e.target.value)} autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') saveRate(); if (e.key === 'Escape') setEditingRate(false) }}
                  style={{ width: '100%', paddingLeft: '1.4rem', paddingRight: '2.2rem', paddingTop: '0.25rem', paddingBottom: '0.25rem', borderRadius: '0.5rem', border: '1.5px solid #0D9488', fontSize: '0.75rem', color: '#0F172A', outline: 'none' }} />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: '#94A3B8' }}>/day</span>
              </div>
              <button onClick={saveRate} disabled={saving}
                style={{ padding: '0.25rem', borderRadius: '0.375rem', background: '#DCFCE7', color: '#16A34A', border: 'none', cursor: 'pointer' }}>
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => { setEditingRate(false); setRateInput(String(roomType.daily_rate)) }}
                style={{ padding: '0.25rem', borderRadius: '0.375rem', background: '#F1F5F9', color: '#64748B', border: 'none', cursor: 'pointer' }}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <div className="flex items-center gap-0.5 px-2 py-1 rounded-lg"
                style={{ background: roomType.daily_rate > 0 ? 'rgba(13,148,136,0.07)' : '#F8FAFC', border: '1px solid', borderColor: roomType.daily_rate > 0 ? 'rgba(13,148,136,0.2)' : '#E2E8F0' }}>
                <IndianRupee className="w-2.5 h-2.5" style={{ color: '#64748B' }} />
                <span className="text-xs font-semibold" style={{ color: roomType.daily_rate > 0 ? '#0D9488' : '#94A3B8' }}>
                  {roomType.daily_rate > 0 ? `${roomType.daily_rate.toLocaleString('en-IN')}/day` : '—/day'}
                </span>
              </div>
              {isAdmin && (
                <button onClick={() => { setEditingRate(true); setRateInput(String(roomType.daily_rate)) }} title="Edit rate"
                  style={{ padding: '0.2rem', borderRadius: '0.375rem', background: '#F1F5F9', color: '#64748B', border: 'none', cursor: 'pointer' }}>
                  <Pencil className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {isAdmin && (
            <button onClick={() => onAddRoom(roomType.id)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
              <Plus className="w-3 h-3" /> Add Room
            </button>
          )}
        </div>
      </div>

      {/* Rooms/beds content — only when expanded */}
      {isOpen && (
        <div className="p-3">
          {wards.length === 0 ? (
            <p className="text-xs text-center py-3" style={{ color: '#CBD5E1' }}>
              No rooms added yet. Click "Add Room" to create one.
            </p>
          ) : roomType.is_multi_bed ? (
            // General ward: each ward with its own collapse + bed grid
            <div className="space-y-1">
              {wards.map(ward => {
                const locationStr = [
                  ward.floor ? `Floor ${ward.floor}` : null,
                  ward.block ? `Block ${ward.block}` : null,
                ].filter(Boolean).join(' · ')
                const avail = ward.beds.filter(b => b.status === 'available').length
                const occ   = ward.beds.filter(b => b.status === 'occupied').length
                return (
                  <MultiWardRow
                    key={ward.id} ward={ward} locationStr={locationStr}
                    avail={avail} occ={occ} isAdmin={isAdmin}
                    onView={onView}
                    onEdit={() => onEditWard(ward)}
                    onAddBeds={() => onAddBeds(ward)}
                    onDelete={() => onDeleteWard(ward.id)}
                  />
                )
              })}
            </div>
          ) : (
            // Private single rooms: grouped by availability status
            <div className="space-y-1">
              <StatusGroup label="Occupied" count={occRooms.length} dotColor="#DC2626" defaultOpen={true}>
                {privateRoomGrid(occRooms)}
              </StatusGroup>
              <StatusGroup label="Available" count={availRooms.length} dotColor="#15803D" defaultOpen={true}>
                {privateRoomGrid(availRooms)}
              </StatusGroup>
              <StatusGroup label="Maintenance" count={maintRooms.length} dotColor="#B45309" defaultOpen={false}>
                {privateRoomGrid(maintRooms)}
              </StatusGroup>
            </div>
          )}
        </div>
      )}
    </GlassCard>
  )
}

// ---- Multi-bed ward row (collapsible) ----
function MultiWardRow({ ward, locationStr, avail, occ, isAdmin, onView, onEdit, onAddBeds, onDelete }: {
  ward: WardWithBeds; locationStr: string; avail: number; occ: number
  isAdmin: boolean
  onView: (id: string) => void
  onEdit: () => void; onAddBeds: () => void; onDelete: () => void
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="rounded-lg" style={{ border: '1px solid #F1F5F9' }}>
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button onClick={() => setOpen(o => !o)}
          style={{ padding: '0.1rem', background: 'transparent', border: 'none', cursor: 'pointer', lineHeight: 0, flexShrink: 0 }}>
          {open ? <ChevronDown className="w-3 h-3" style={{ color: '#94A3B8' }} />
                : <ChevronRight className="w-3 h-3" style={{ color: '#94A3B8' }} />}
        </button>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.05rem' }}>
          <span className="text-xs font-semibold truncate" style={{ color: '#374151' }}>{ward.name}</span>
          {locationStr && (
            <span style={{ fontSize: '0.65rem', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
              <MapPin style={{ width: '0.55rem', height: '0.55rem', flexShrink: 0 }} />
              {locationStr}
            </span>
          )}
        </div>
        <span className="text-xs" style={{ color: '#94A3B8' }}>
          <span style={{ color: '#15803D', fontWeight: 600 }}>{avail}</span>
          {occ > 0 && <> · <span style={{ color: '#DC2626', fontWeight: 600 }}>{occ}</span> occ</>}
          {' '}· {ward.beds.length}
        </span>
        {isAdmin && (
          <div className="flex items-center gap-1">
            <button onClick={onEdit} style={{ padding: '0.15rem', borderRadius: '0.25rem', background: 'transparent', color: '#94A3B8', border: 'none', cursor: 'pointer' }}><Pencil className="w-3 h-3" /></button>
            <button onClick={onAddBeds} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs" style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>+Beds</button>
            <button onClick={onDelete} style={{ padding: '0.15rem', borderRadius: '0.25rem', background: '#FEF2F2', color: '#EF4444', border: 'none', cursor: 'pointer' }}><Trash2 className="w-3 h-3" /></button>
          </div>
        )}
      </div>
      {open && ward.beds.length > 0 && (
        <div className="px-2 pb-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(3.5rem, 1fr))', gap: '0.3rem' }}>
          {ward.beds.map(bed => (
            <BedChip key={bed.id} bed={bed} onView={onView} />
          ))}
        </div>
      )}
      {open && ward.beds.length === 0 && <p className="px-3 pb-2 text-xs" style={{ color: '#CBD5E1' }}>No beds — use "+Beds"</p>}
    </div>
  )
}

const OT_TYPES = [
  'Major OT', 'Minor OT', 'Emergency OT', 'Cardiac OT', 'Neurosurgery OT',
  'Orthopaedic OT', 'Laparoscopy OT', 'Obstetric / Gynae OT',
  'Ophthalmic OT', 'ENT OT', 'Dental OT', 'Burns OT', 'General Surgery OT',
]

const OT_STATUS_META = {
  active:      { label: 'Active',      bg: '#DCFCE7', color: '#15803D' },
  maintenance: { label: 'Maintenance', bg: '#FEF3C7', color: '#B45309' },
  inactive:    { label: 'Inactive',    bg: '#F1F5F9', color: '#94A3B8' },
}

// A status nobody here recognises must not take the page down with it. This
// read used to be OT_STATUS_META[room.status], and one demo row seeded as
// 'available' was enough to turn the whole OT tab into "This page couldn't
// load" — a theatre list lost to a colour lookup.
function otStatusMeta(status: string | null | undefined) {
  return OT_STATUS_META[status as keyof typeof OT_STATUS_META]
    ?? { label: status || 'Unknown', bg: '#F1F5F9', color: '#94A3B8' }
}

// ---- OT Room form (shared by Add and Edit) ----
function OtRoomForm({ initial, onSubmit, onCancel }: {
  initial?: Partial<OtRoom>
  onSubmit: (data: { name: string; ot_type: string | null; floor: string | null; block: string | null; notes: string | null; status: 'active' | 'maintenance' | 'inactive' }) => Promise<void>
  onCancel: () => void
}) {
  const [name,    setName]    = useState(initial?.name    ?? '')
  const [otType,  setOtType]  = useState(initial?.ot_type ?? '')
  const [floor,   setFloor]   = useState(initial?.floor   ?? '')
  const [block,   setBlock]   = useState(initial?.block   ?? '')
  const [notes,   setNotes]   = useState(initial?.notes   ?? '')
  const [status,  setStatus]  = useState<'active' | 'maintenance' | 'inactive'>(initial?.status ?? 'active')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Room name is required'); return }
    setLoading(true); setError(null)
    try {
      await onSubmit({
        name:    name.trim(),
        ot_type: otType.trim() || null,
        floor:   floor.trim()  || null,
        block:   block.trim()  || null,
        notes:   notes.trim()  || null,
        status,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="text-xs font-medium block mb-1" style={{ color: '#374151' }}>Room Name / Number <span style={{ color: '#EF4444' }}>*</span></label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. OT-01, Major OT 1" required autoFocus />
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs font-medium block mb-1" style={{ color: '#374151' }}>OT Type</label>
          <Select value={otType} onChange={e => setOtType(e.target.value)}>
            <option value="">— Select type —</option>
            {OT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </Select>
        </div>

        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: '#374151' }}>Floor</label>
          <Input value={floor} onChange={e => setFloor(e.target.value)} placeholder="e.g. 2nd Floor" />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: '#374151' }}>Block / Wing</label>
          <Input value={block} onChange={e => setBlock(e.target.value)} placeholder="e.g. Block B" />
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs font-medium block mb-1" style={{ color: '#374151' }}>Status</label>
          <div className="flex gap-2">
            {(['active', 'maintenance', 'inactive'] as const).map(s => (
              <button key={s} type="button" onClick={() => setStatus(s)}
                style={{
                  flex: 1, padding: '0.375rem 0.5rem', borderRadius: '0.5rem', fontSize: '0.75rem', fontWeight: 500,
                  cursor: 'pointer', border: `1.5px solid ${status === s ? OT_STATUS_META[s].color : '#E2E8F0'}`,
                  background: status === s ? OT_STATUS_META[s].bg : '#FAFAFA',
                  color: status === s ? OT_STATUS_META[s].color : '#94A3B8',
                }}>
                {OT_STATUS_META[s].label}
              </button>
            ))}
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs font-medium block mb-1" style={{ color: '#374151' }}>Notes <span style={{ color: '#94A3B8', fontWeight: 400 }}>(optional)</span></label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Special equipment, usage notes..."
            rows={2}
            style={{ width: '100%', borderRadius: '0.75rem', border: '1px solid #E2E8F0', padding: '0.5rem 0.75rem', fontSize: '0.875rem', color: '#0F172A', resize: 'vertical', outline: 'none', fontFamily: 'inherit' }} />
        </div>
      </div>

      {error && <p className="text-xs" style={{ color: '#DC2626' }}>{error}</p>}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="flex-1 py-2 rounded-xl text-sm"
          style={{ background: '#F1F5F9', color: '#475569', border: 'none', cursor: 'pointer' }}>Cancel</button>
        <button type="submit" disabled={loading} className="flex-1 py-2 rounded-xl text-sm font-semibold"
          style={{ background: loading ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? 'Saving…' : (initial ? 'Save Changes' : 'Add OT Room')}
        </button>
      </div>
    </form>
  )
}

function OtRoomModal({ title, initial, onClose, onSave }: {
  title: string
  initial?: Partial<OtRoom>
  onClose: () => void
  onSave: (data: Parameters<React.ComponentProps<typeof OtRoomForm>['onSubmit']>[0]) => Promise<void>
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-4 sm:pb-0"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" style={{ padding: '1.5rem', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 className="font-semibold text-base mb-4" style={{ color: '#0F172A' }}>{title}</h2>
        <OtRoomForm initial={initial} onSubmit={onSave} onCancel={onClose} />
      </div>
    </div>
  )
}

// ---- Temp ward row with inline rate editing ----
function TempWardRow({ ward, isAdmin, onView, onEdit, onDelete, onRateUpdate }: {
  ward: WardWithBeds
  isAdmin: boolean
  onView: (id: string) => void
  onEdit: () => void
  onDelete: () => void
  onRateUpdate: (wardId: string, rate: number) => void
}) {
  const [editingRate, setEditingRate] = useState(false)
  const [rateInput, setRateInput]     = useState(String(ward.daily_rate ?? 0))
  const [saving, setSaving]           = useState(false)

  async function saveRate() {
    const rate = parseFloat(rateInput)
    if (isNaN(rate) || rate < 0) return
    setSaving(true)
    const res = await updateWardRate(ward.id, rate)
    setSaving(false)
    if (res.success) { onRateUpdate(ward.id, rate); setEditingRate(false) }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <span className="text-sm font-medium" style={{ color: '#374151' }}>{ward.name}</span>
        <span className="text-xs" style={{ color: '#94A3B8' }}>{ward.beds.filter(b => b.status === 'occupied').length} occupied</span>

        {/* Rate */}
        {editingRate ? (
          <div className="flex items-center gap-1">
            <div className="relative" style={{ width: '6.5rem' }}>
              <IndianRupee className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2" style={{ color: '#94A3B8' }} />
              <input
                type="number" min={0} step={1} value={rateInput}
                onChange={e => setRateInput(e.target.value)} autoFocus
                onKeyDown={e => { if (e.key === 'Enter') saveRate(); if (e.key === 'Escape') setEditingRate(false) }}
                style={{ width: '100%', paddingLeft: '1.4rem', paddingRight: '2.2rem', paddingTop: '0.25rem', paddingBottom: '0.25rem', borderRadius: '0.5rem', border: '1.5px solid #F59E0B', fontSize: '0.75rem', color: '#0F172A', outline: 'none' }}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: '#94A3B8' }}>/day</span>
            </div>
            <button onClick={saveRate} disabled={saving}
              style={{ padding: '0.25rem', borderRadius: '0.375rem', background: '#DCFCE7', color: '#16A34A', border: 'none', cursor: 'pointer' }}>
              <Check className="w-3 h-3" />
            </button>
            <button onClick={() => { setEditingRate(false); setRateInput(String(ward.daily_rate ?? 0)) }}
              style={{ padding: '0.25rem', borderRadius: '0.375rem', background: '#F1F5F9', color: '#64748B', border: 'none', cursor: 'pointer' }}>
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-lg"
              style={{ background: (ward.daily_rate ?? 0) > 0 ? 'rgba(245,158,11,0.08)' : '#F8FAFC', border: '1px solid', borderColor: (ward.daily_rate ?? 0) > 0 ? 'rgba(245,158,11,0.25)' : '#E2E8F0' }}>
              <IndianRupee className="w-2.5 h-2.5" style={{ color: '#64748B' }} />
              <span className="text-xs font-semibold" style={{ color: (ward.daily_rate ?? 0) > 0 ? '#B45309' : '#94A3B8' }}>
                {(ward.daily_rate ?? 0) > 0 ? `${Number(ward.daily_rate).toLocaleString('en-IN')}/day` : '—/day'}
              </span>
            </div>
            {isAdmin && (
              <button onClick={() => { setEditingRate(true); setRateInput(String(ward.daily_rate ?? 0)) }}
                title="Edit rate"
                style={{ padding: '0.15rem', borderRadius: '0.375rem', background: 'transparent', color: '#94A3B8', border: 'none', cursor: 'pointer' }}>
                <Pencil className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        )}

        {isAdmin && (
          <div className="ml-auto flex items-center gap-1">
            <button onClick={onEdit} style={{ padding: '0.2rem', borderRadius: '0.375rem', background: '#F1F5F9', color: '#64748B', border: 'none', cursor: 'pointer' }}>
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={onDelete} style={{ padding: '0.2rem', borderRadius: '0.375rem', background: '#FEF2F2', color: '#EF4444', border: 'none', cursor: 'pointer' }}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
      {ward.beds.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(3.5rem, 1fr))', gap: '0.3rem' }}>
          {ward.beds.map(bed => (
            <BedChip key={bed.id} bed={bed} onView={onView} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---- Delete confirmation modal ----
function DeleteConfirmModal({ wardName, onConfirm, onCancel, loading, error }: {
  wardName: string
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
  error?: string | null
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 text-center">
        <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3"
          style={{ background: '#FEF2F2' }}>
          <Trash2 className="w-5 h-5" style={{ color: '#EF4444' }} />
        </div>
        <h3 className="font-semibold text-base mb-1" style={{ color: '#0F172A' }}>Delete Room</h3>
        <p className="text-sm mb-1" style={{ color: '#64748B' }}>
          <span className="font-medium" style={{ color: '#0F172A' }}>{wardName}</span> will be permanently deleted.
        </p>
        <p className="text-xs mb-4" style={{ color: '#94A3B8' }}>Only rooms with no admitted patients can be deleted.</p>
        {error && (
          <div className="text-xs font-medium mb-4 px-3 py-2 rounded-lg" style={{ background: '#FEF2F2', color: '#DC2626' }}>
            {error}
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: 'none', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading || !!error} className="flex-1 py-2 rounded-xl text-sm font-semibold"
            style={{ background: (loading || error) ? '#94A3B8' : '#EF4444', color: '#fff', border: 'none', cursor: (loading || error) ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- Delete Room Type confirmation modal ----
function DeleteTypeConfirmModal({ typeName, roomCount, onConfirm, onCancel, loading, error }: {
  typeName: string
  roomCount: number
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
  error?: string | null
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 text-center">
        <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3"
          style={{ background: '#FEF2F2' }}>
          <Trash2 className="w-5 h-5" style={{ color: '#EF4444' }} />
        </div>
        <h3 className="font-semibold text-base mb-1" style={{ color: '#0F172A' }}>Delete Room Type</h3>
        <p className="text-sm mb-1" style={{ color: '#64748B' }}>
          <span className="font-medium" style={{ color: '#0F172A' }}>{typeName}</span> will be permanently deleted.
        </p>
        {roomCount > 0 && !error && (
          <p className="text-xs mb-4 px-2 py-1.5 rounded-lg" style={{ background: '#FFF7ED', color: '#C2410C' }}>
            This will also delete <strong>{roomCount} room{roomCount !== 1 ? 's' : ''}</strong> under this type.
          </p>
        )}
        {!roomCount && !error && (
          <p className="text-xs mb-4" style={{ color: '#94A3B8' }}>Only types with no admitted patients can be deleted.</p>
        )}
        {error && (
          <div className="text-xs font-medium mb-4 px-3 py-2 rounded-lg" style={{ background: '#FEF2F2', color: '#DC2626' }}>
            {error}
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: 'none', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading || !!error} className="flex-1 py-2 rounded-xl text-sm font-semibold"
            style={{ background: (loading || error) ? '#94A3B8' : '#EF4444', color: '#fff', border: 'none', cursor: (loading || error) ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- Edit Room Type modal ----
function EditRoomTypeModal({ roomType, onClose, onSave }: {
  roomType: WardRoomType
  onClose: () => void
  onSave: (updated: { name: string; daily_rate: number }) => void
}) {
  const [name, setName]   = useState(roomType.name)
  const [rate, setRate]   = useState(String(roomType.daily_rate))
  const [isIcu, setIsIcu] = useState(!!roomType.is_icu)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const dailyRate = rate === '' ? 0 : parseFloat(rate)
    if (isNaN(dailyRate) || dailyRate < 0) { setError('Enter a valid rate'); return }
    if (!name.trim()) { setError('Name is required'); return }
    setLoading(true); setError(null)
    const res = await updateWardRoomType(roomType.id, { name: name.trim(), daily_rate: dailyRate, is_icu: isIcu })
    setLoading(false)
    if (!res.success) { setError(res.error); return }
    onSave({ name: name.trim(), daily_rate: dailyRate })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-4 sm:pb-0"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" style={{ padding: '1.5rem' }}>
        <h2 className="font-semibold text-base mb-4" style={{ color: '#0F172A' }}>Edit Room Type</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: '#374151' }}>Name <span style={{ color: '#EF4444' }}>*</span></label>
            <Input value={name} onChange={e => setName(e.target.value)} required autoFocus />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: '#374151' }}>Daily Rate (₹)</label>
            <div className="relative">
              <IndianRupee className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#94A3B8' }} />
              <Input type="number" min={0} step={1} value={rate} onChange={e => setRate(e.target.value)} placeholder="0" style={{ paddingLeft: '1.875rem' }} />
            </div>
          </div>
          <p className="text-xs" style={{ color: '#94A3B8' }}>Changing the rate updates all rooms of this type.</p>
          <label className="flex items-center gap-3 cursor-pointer rounded-xl p-3"
            style={{ border: `1px solid ${isIcu ? '#DC2626' : '#E2E8F0'}`, background: isIcu ? 'rgba(220,38,38,0.04)' : '#FAFAFA' }}>
            <input type="checkbox" checked={isIcu} onChange={e => setIsIcu(e.target.checked)}
              style={{ width: '1rem', height: '1rem', accentColor: '#DC2626', cursor: 'pointer' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: '#0F172A' }}>ICU / Critical Care</p>
              <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>Admit/transfer into this room auto-enables critical care.</p>
            </div>
          </label>
          {error && <p className="text-xs" style={{ color: '#DC2626' }}>{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-xl text-sm"
              style={{ background: '#F1F5F9', color: '#475569', border: 'none', cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 py-2 rounded-xl text-sm font-semibold"
              style={{ background: loading ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---- Add Room Type modal (inline in WardsClient) ----
function AddRoomTypeModal({ open, onClose, onAdd }: {
  open: boolean
  onClose: () => void
  onAdd: (rt: WardRoomType) => void
}) {
  const [name, setName] = useState('')
  const [rate, setRate] = useState('')
  const [isMultiBed, setIsMultiBed] = useState(false)
  const [isIcu, setIsIcu] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const dailyRate = rate === '' ? 0 : parseFloat(rate)
    if (isNaN(dailyRate) || dailyRate < 0) { setError('Enter a valid rate'); return }
    if (!name.trim()) { setError('Name is required'); return }
    setLoading(true); setError(null)
    const res = await createWardRoomType({ name: name.trim(), daily_rate: dailyRate, is_multi_bed: isMultiBed, is_icu: isIcu })
    setLoading(false)
    if (!res.success) { setError(res.error); return }
    onAdd(res.roomType)
    setName(''); setRate(''); setIsMultiBed(false); setIsIcu(false)
    onClose()
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-4 sm:pb-0"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm"
        style={{ padding: '1.5rem' }}>
        <h2 className="font-semibold text-base mb-4" style={{ color: '#0F172A' }}>New Room Type</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: '#374151' }}>Name <span style={{ color: '#EF4444' }}>*</span></label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. AC, Suite Room, General Ward" required autoFocus />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: '#374151' }}>Daily Rate (₹)</label>
            <div className="relative">
              <IndianRupee className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#94A3B8' }} />
              <Input type="number" min={0} step={1} value={rate} onChange={e => setRate(e.target.value)} placeholder="0" style={{ paddingLeft: '1.875rem' }} />
            </div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer rounded-xl p-3"
            style={{ border: `1px solid ${isMultiBed ? '#0D9488' : '#E2E8F0'}`, background: isMultiBed ? 'rgba(13,148,136,0.04)' : '#FAFAFA' }}>
            <input type="checkbox" checked={isMultiBed} onChange={e => setIsMultiBed(e.target.checked)}
              style={{ width: '1rem', height: '1rem', accentColor: '#0D9488', cursor: 'pointer' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: '#0F172A' }}>General ward (multiple beds)</p>
              <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>Beds are numbered and added manually. Leave unchecked for single private rooms.</p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer rounded-xl p-3"
            style={{ border: `1px solid ${isIcu ? '#DC2626' : '#E2E8F0'}`, background: isIcu ? 'rgba(220,38,38,0.04)' : '#FAFAFA' }}>
            <input type="checkbox" checked={isIcu} onChange={e => setIsIcu(e.target.checked)}
              style={{ width: '1rem', height: '1rem', accentColor: '#DC2626', cursor: 'pointer' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: '#0F172A' }}>ICU / Critical Care</p>
              <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>Admitting or transferring into this room auto-enables critical care (flow sheet, NEWS, ICU charges).</p>
            </div>
          </label>
          {error && <p className="text-xs" style={{ color: '#DC2626' }}>{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-xl text-sm"
              style={{ background: '#F1F5F9', color: '#475569', border: 'none', cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 py-2 rounded-xl text-sm font-semibold"
              style={{ background: loading ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Adding…' : 'Add Type'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---- Main client ----

export default function WardsClient({ initialBoard, wards, departments, doctors, initialOtRooms, initialRoomTypes, initialNursingUnits }: Props) {
  const router = useRouter()
  const { profile } = useAuth()
  const isAdmin   = profile?.role === 'admin'


  const [board, setBoard]             = useState<WardWithBeds[]>(initialBoard)
  const [loading, setLoading]         = useState(false)
  const [roomTypes, setRoomTypes]     = useState<WardRoomType[]>(initialRoomTypes)
  const [nursingUnits, setNursingUnits] = useState<NursingUnit[]>(initialNursingUnits)
  const [showUnits, setShowUnits]     = useState(false)
  const reloadUnits = async () => setNursingUnits(await listNursingUnits())
  const [activeTab, setActiveTab]           = useState<'wards' | 'ot'>('wards')
  const [searchQuery, setSearchQuery]       = useState('')
  const [showAddType, setShowAddType]       = useState(false)
  const [editingRoomType, setEditingRoomType] = useState<WardRoomType | null>(null)
  const [showCreateWard, setShowCreateWard] = useState<string | null>(null) // stores pre-selected room_type_id
  const [editingWard, setEditingWard] = useState<WardWithBeds | null>(null)
  const [addBedsWard, setAddBedsWard] = useState<WardWithBeds | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting]       = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [pendingDeleteType, setPendingDeleteType] = useState<WardRoomType | null>(null)
  const [deletingType, setDeletingType] = useState(false)
  const [deleteTypeError, setDeleteTypeError] = useState<string | null>(null)

  // OT Rooms
  const [otRooms, setOtRooms]           = useState<OtRoom[]>(initialOtRooms)
  const [showAddOtRoom, setShowAddOtRoom] = useState(false)
  const [editingOtRoom, setEditingOtRoom] = useState<OtRoom | null>(null)
  const [pendingDeleteOt, setPendingDeleteOt] = useState<OtRoom | null>(null)
  const [deletingOt, setDeletingOt]     = useState(false)
  const [deleteOtError, setDeleteOtError] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    const b = await getWardBoard()
    setBoard(b)
    setLoading(false)
  }

  function handleRateUpdate(typeId: string, rate: number) {
    setRoomTypes(rts => rts.map(rt => rt.id === typeId ? { ...rt, daily_rate: rate } : rt))
    setBoard(b => b.map(w => w.room_type_id === typeId ? { ...w, daily_rate: rate } : w))
  }

  function handleDeleteType(id: string) {
    const rt = roomTypes.find(r => r.id === id)
    if (!rt) return
    setDeleteTypeError(null)
    setPendingDeleteType(rt)
  }

  async function confirmDeleteType() {
    if (!pendingDeleteType) return
    const typeId = pendingDeleteType.id
    setDeletingType(true)
    const res = await deleteWardRoomType(typeId)
    if (!res.success) {
      setDeletingType(false)
      setDeleteTypeError(res.error)
      return
    }
    // Batch all success updates — avoids transient render where board is empty but type still shows
    setDeletingType(false)
    setRoomTypes(rts => rts.filter(rt => rt.id !== typeId))
    setBoard(b => b.filter(w => w.room_type_id !== typeId))
    setPendingDeleteType(null)
    setDeleteTypeError(null)
  }

  function handleDeleteWard(id: string) {
    const ward = board.find(w => w.id === id)
    if (ward) { setDeleteError(null); setPendingDelete({ id, name: ward.name }) }
  }

  async function confirmDeleteWard() {
    if (!pendingDelete) return
    setDeleting(true)
    const res = await deleteWard(pendingDelete.id)
    setDeleting(false)
    if (!res.success) { setDeleteError(res.error); return }
    setBoard(b => b.filter(w => w.id !== pendingDelete.id))
    setPendingDelete(null)
    setDeleteError(null)
  }

  function handleWardRateUpdate(wardId: string, rate: number) {
    setBoard(b => b.map(w => w.id === wardId ? { ...w, daily_rate: rate } : w))
  }

  function handleWardUpdate(wardId: string, updates: Partial<WardWithBeds>) {
    setBoard(b => b.map(w => w.id === wardId ? { ...w, ...updates } : w))
    setEditingWard(null)
  }

  // Group board by room_type_id; wards without a type go in "Uncategorised"
  const byType = new Map<string | null, WardWithBeds[]>()
  for (const w of board) {
    const key = w.room_type_id ?? null
    if (!byType.has(key)) byType.set(key, [])
    byType.get(key)!.push(w)
  }

  // Overflow (is_temp) wards are shown in their own section regardless of type
  const tempWards     = board.filter(w => w.is_temp)
  const nonTempByType = new Map<string | null, WardWithBeds[]>()
  for (const w of board.filter(w => !w.is_temp)) {
    const key = w.room_type_id ?? null
    if (!nonTempByType.has(key)) nonTempByType.set(key, [])
    nonTempByType.get(key)!.push(w)
  }

  // Search filtering
  const searchLower = searchQuery.toLowerCase().trim()
  const filteredNonTempByType = new Map<string | null, WardWithBeds[]>()
  for (const [typeId, ws] of nonTempByType) {
    const filtered = searchLower
      ? ws.filter(w =>
          w.name.toLowerCase().includes(searchLower) ||
          w.beds.some(b => b.patient_name?.toLowerCase().includes(searchLower))
        )
      : ws
    if (filtered.length > 0 || !searchLower) filteredNonTempByType.set(typeId, filtered)
  }
  const filteredRoomTypes = searchLower
    ? roomTypes.filter(rt =>
        rt.name.toLowerCase().includes(searchLower) ||
        filteredNonTempByType.has(rt.id)
      )
    : roomTypes

  const totalRooms = board.filter(w => !w.is_temp).length
  const availCount = board.filter(w => !w.is_temp).reduce((s, w) => {
    const rt = roomTypes.find(r => r.id === w.room_type_id)
    const isMultiBed = rt?.is_multi_bed ?? (w.beds.length > 1)
    if (isMultiBed) return s + w.beds.filter(b => b.status === 'available').length
    return s + (w.beds[0]?.status === 'available' ? 1 : 0)
  }, 0)
  const occCount = board.reduce((s, w) => s + w.beds.filter(b => b.status === 'occupied').length, 0)

  return (
    <div>
      <PageHeader
        title="Wards & OT"
        subtitle="Rooms, beds and operation theatres"
        action={
          <div className="flex items-center gap-2">
            {activeTab === 'wards' && (
              <>
                <button onClick={refresh}
                  style={{ padding: '0.5rem', borderRadius: '0.75rem', background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#64748B', cursor: 'pointer' }}>
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                {isAdmin && (
                  <button onClick={() => setShowUnits(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold"
                    style={{ background: 'rgba(255,255,255,0.8)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.3)', cursor: 'pointer' }}>
                    <Building2 className="w-4 h-4" /> Nursing Units
                  </button>
                )}
                {isAdmin && (
                  <button onClick={() => setShowAddType(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold"
                    style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                    <Plus className="w-4 h-4" /> Add Room Type
                  </button>
                )}
              </>
            )}
          </div>
        }
      />

      {/* Tab strip */}
      <div className="flex gap-1 mb-4 p-1 rounded-xl" style={{ background: '#F1F5F9', width: 'fit-content' }}>
        {([
          { key: 'wards', label: 'Ward Board',  Icon: BedDouble },
          { key: 'ot',    label: 'OT Rooms',    Icon: Scissors  },
        ] as const).map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={{
              background: activeTab === key ? '#fff' : 'transparent',
              color: activeTab === key ? '#0D9488' : '#64748B',
              border: 'none', cursor: 'pointer',
              boxShadow: activeTab === key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {/* ── Ward Board tab ── */}
      {activeTab === 'wards' && (<>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: 'Total Rooms', value: totalRooms, color: '#0D9488', bg: 'rgba(13,148,136,0.06)', bc: 'rgba(13,148,136,0.15)' },
          { label: 'Available',   value: availCount, color: '#15803D', bg: '#DCFCE7',               bc: '#86EFAC' },
          { label: 'Occupied',    value: occCount,   color: '#DC2626', bg: '#FEE2E2',               bc: '#FCA5A5' },
        ].map(({ label, value, color, bg, bc }) => (
          <div key={label} className="rounded-xl p-3 flex items-center gap-2"
            style={{ background: bg, border: `1px solid ${bc}` }}>
            <span className="text-xl font-bold leading-none" style={{ color }}>{value}</span>
            <span className="text-xs font-medium" style={{ color: '#64748B' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* No room types yet */}
      {roomTypes.length === 0 && (
        <GlassCard className="p-8 text-center">
          <DoorOpen className="w-8 h-8 mx-auto mb-3" style={{ color: '#CBD5E1' }} />
          <p className="font-medium text-sm mb-1" style={{ color: '#64748B' }}>No room types configured</p>
          <p className="text-xs mb-4" style={{ color: '#94A3B8' }}>
            Create room types first (e.g. AC, Non-AC, Suite, General Ward) — each type sets the daily rate for its rooms.
          </p>
          {isAdmin && (
            <button onClick={() => setShowAddType(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
              <Plus className="w-4 h-4" /> Add First Room Type
            </button>
          )}
        </GlassCard>
      )}

      {/* Search bar */}
      <div className="relative mb-3">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#94A3B8' }} />
        <input
          type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search room or patient…"
          style={{ width: '100%', paddingLeft: '2.25rem', paddingRight: searchQuery ? '2rem' : '0.75rem', paddingTop: '0.5rem', paddingBottom: '0.5rem', borderRadius: '0.75rem', border: '1px solid #E2E8F0', fontSize: '0.875rem', color: '#0F172A', outline: 'none', background: '#fff' }}
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')}
            style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', lineHeight: 0 }}>
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Sections per room type */}
      <div className="space-y-3">
        {filteredRoomTypes.map(rt => (
          <RoomTypeSection
            key={rt.id}
            roomType={rt}
            wards={filteredNonTempByType.get(rt.id) ?? []}
            isAdmin={isAdmin}
            forceExpand={!!searchLower}
            onView={id => router.push(`/ipd/${id}`)}
            onAddRoom={typeId => setShowCreateWard(typeId)}
            onAddBeds={w => setAddBedsWard(w)}
            onEditWard={w => setEditingWard(w)}
            onDeleteWard={handleDeleteWard}
            onEditType={rt => setEditingRoomType(rt)}
            onRateUpdate={handleRateUpdate}
            onDeleteType={handleDeleteType}
          />
        ))}

        {/* Uncategorised wards (no room_type_id) */}
        {(nonTempByType.get(null)?.length ?? 0) > 0 && (
          <GlassCard className="overflow-hidden">
            <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(226,232,240,0.6)' }}>
              <h3 className="text-sm font-semibold" style={{ color: '#94A3B8' }}>Uncategorised Wards</h3>
              <p className="text-xs mt-0.5" style={{ color: '#CBD5E1' }}>Assign a room type via edit to move these into a section</p>
            </div>
            <div className="p-3 space-y-2">
              {(nonTempByType.get(null) ?? []).map(ward => {
                const locationStr = [
                  ward.floor ? `Floor ${ward.floor}` : null,
                  ward.block ? `Block ${ward.block}` : null,
                ].filter(Boolean).join(' · ')
                const avail = ward.beds.filter(b => b.status === 'available').length
                return (
                  <div key={ward.id} className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium" style={{ color: '#374151' }}>{ward.name}</span>
                        {ward.ward_type && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: '#F1F5F9', color: '#64748B' }}>{ward.ward_type}</span>}
                        {locationStr && <span className="text-xs" style={{ color: '#94A3B8' }}>{locationStr}</span>}
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{avail} / {ward.beds.length} available</p>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => setEditingWard(ward)} style={{ padding: '0.25rem', borderRadius: '0.375rem', background: '#F1F5F9', color: '#64748B', border: 'none', cursor: 'pointer' }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDeleteWard(ward.id)} style={{ padding: '0.25rem', borderRadius: '0.375rem', background: '#FEF2F2', color: '#EF4444', border: 'none', cursor: 'pointer' }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </GlassCard>
        )}

        {/* Overflow / temp wards */}
        {tempWards.length > 0 && (
          <GlassCard className="overflow-hidden">
            <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(226,232,240,0.6)', background: 'rgba(254,243,199,0.3)' }}>
              <span className="text-xs font-semibold" style={{ color: '#B45309' }}>⚠ Overflow Wards</span>
              <span className="text-xs" style={{ color: '#94A3B8' }}>{tempWards.reduce((s, w) => s + w.beds.filter(b => b.status === 'occupied').length, 0)} patients currently placed</span>
            </div>
            <div className="p-3 space-y-3">
              {tempWards.map(ward => (
                <TempWardRow
                  key={ward.id}
                  ward={ward}
                  isAdmin={isAdmin}
                  onView={id => router.push(`/ipd/${id}`)}
                  onEdit={() => setEditingWard(ward)}
                  onDelete={() => handleDeleteWard(ward.id)}
                  onRateUpdate={handleWardRateUpdate}
                />
              ))}
            </div>
          </GlassCard>
        )}
      </div>

      </>)}

      {/* ── OT Rooms tab ── */}
      {activeTab === 'ot' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs" style={{ color: '#94A3B8' }}>{otRooms.length} room{otRooms.length !== 1 ? 's' : ''} configured</p>
            {isAdmin && (
              <button onClick={() => setShowAddOtRoom(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold"
                style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                <Plus className="w-4 h-4" /> Add OT Room
              </button>
            )}
          </div>

          {otRooms.length === 0 ? (
            <GlassCard className="p-8 text-center">
              <Scissors className="w-8 h-8 mx-auto mb-3" style={{ color: '#CBD5E1' }} />
              <p className="font-medium text-sm mb-1" style={{ color: '#64748B' }}>No OT rooms added yet</p>
              <p className="text-xs" style={{ color: '#94A3B8' }}>Add your first operation theatre room to get started.</p>
            </GlassCard>
          ) : (
            <div className="space-y-2">
              {otRooms.map(room => {
                const sm = otStatusMeta(room.status)
                const locationStr = [
                  room.floor ? `Floor ${room.floor}` : null,
                  room.block ? `Block ${room.block}` : null,
                ].filter(Boolean).join(' · ')
                return (
                  <GlassCard key={room.id} className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: 'rgba(13,148,136,0.08)' }}>
                        <Scissors className="w-4 h-4" style={{ color: '#0D9488' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm" style={{ color: '#0F172A' }}>{room.name}</span>
                          {room.ot_type && (
                            <span className="text-xs px-2 py-0.5 rounded-full"
                              style={{ background: 'rgba(99,102,241,0.08)', color: '#4F46E5' }}>
                              {room.ot_type}
                            </span>
                          )}
                          <span className="text-xs px-2 py-0.5 rounded-full ml-auto"
                            style={{ background: sm.bg, color: sm.color }}>
                            {sm.label}
                          </span>
                        </div>
                        {locationStr && (
                          <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: '#94A3B8' }}>
                            <MapPin className="w-3 h-3" />{locationStr}
                          </p>
                        )}
                        {room.notes && (
                          <p className="text-xs mt-1" style={{ color: '#64748B' }}>{room.notes}</p>
                        )}
                      </div>
                      {isAdmin && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => setEditingOtRoom(room)}
                            style={{ padding: '0.3rem', borderRadius: '0.375rem', background: '#F1F5F9', color: '#64748B', border: 'none', cursor: 'pointer' }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => { setDeleteOtError(null); setPendingDeleteOt(room) }}
                            style={{ padding: '0.3rem', borderRadius: '0.375rem', background: '#FEF2F2', color: '#EF4444', border: 'none', cursor: 'pointer' }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </GlassCard>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* OT Room modals */}
      {showAddOtRoom && (
        <OtRoomModal
          title="Add OT Room"
          onClose={() => setShowAddOtRoom(false)}
          onSave={async (data) => {
            const res = await createOtRoom(data as Record<string, unknown>)
            if (!res.success) throw new Error(res.error)
            setOtRooms(prev => [...prev, res.room].sort((a, b) => a.name.localeCompare(b.name)))
            setShowAddOtRoom(false)
          }}
        />
      )}

      {editingOtRoom && (
        <OtRoomModal
          title={`Edit — ${editingOtRoom.name}`}
          initial={editingOtRoom}
          onClose={() => setEditingOtRoom(null)}
          onSave={async (data) => {
            const res = await updateOtRoom(editingOtRoom.id, data as Record<string, unknown>)
            if (!res.success) throw new Error(res.error)
            setOtRooms(prev => prev.map(r => r.id === editingOtRoom.id
              ? { ...r, ...data, is_active: data.status === 'active' } : r))
            setEditingOtRoom(null)
          }}
        />
      )}

      {pendingDeleteOt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={e => { if (e.target === e.currentTarget && !deletingOt) { setPendingDeleteOt(null); setDeleteOtError(null) } }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 text-center">
            <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: '#FEF2F2' }}>
              <Trash2 className="w-5 h-5" style={{ color: '#EF4444' }} />
            </div>
            <h3 className="font-semibold text-base mb-1" style={{ color: '#0F172A' }}>Delete OT Room</h3>
            <p className="text-sm mb-4" style={{ color: '#64748B' }}>
              <span className="font-medium" style={{ color: '#0F172A' }}>{pendingDeleteOt.name}</span> will be permanently removed.
            </p>
            {deleteOtError ? (
              <div className="text-xs font-medium mb-4 px-3 py-2 rounded-lg text-left" style={{ background: '#FEF2F2', color: '#DC2626' }}>
                {deleteOtError}
              </div>
            ) : (
              <p className="text-xs mb-4" style={{ color: '#94A3B8' }}>Rooms with existing surgery records cannot be deleted — set them to Inactive instead.</p>
            )}
            <div className="flex gap-3">
              <button onClick={() => { if (!deletingOt) { setPendingDeleteOt(null); setDeleteOtError(null) } }} className="flex-1 py-2 rounded-xl text-sm font-medium"
                style={{ background: '#F1F5F9', color: '#475569', border: 'none', cursor: 'pointer' }}>Cancel</button>
              <button disabled={deletingOt || !!deleteOtError} className="flex-1 py-2 rounded-xl text-sm font-semibold"
                style={{ background: (deletingOt || deleteOtError) ? '#94A3B8' : '#EF4444', color: '#fff', border: 'none', cursor: (deletingOt || deleteOtError) ? 'not-allowed' : 'pointer' }}
                onClick={async () => {
                  setDeletingOt(true)
                  const res = await deleteOtRoom(pendingDeleteOt.id)
                  setDeletingOt(false)
                  if (res.success) {
                    setOtRooms(prev => prev.filter(r => r.id !== pendingDeleteOt.id))
                    setPendingDeleteOt(null)
                    setDeleteOtError(null)
                  } else {
                    setDeleteOtError(res.error)
                  }
                }}>
                {deletingOt ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {editingRoomType && (
        <EditRoomTypeModal
          roomType={editingRoomType}
          onClose={() => setEditingRoomType(null)}
          onSave={({ name, daily_rate }) => {
            setRoomTypes(rts => rts.map(rt => rt.id === editingRoomType.id ? { ...rt, name, daily_rate } : rt))
            setBoard(b => b.map(w => w.room_type_id === editingRoomType.id ? { ...w, daily_rate } : w))
            setEditingRoomType(null)
          }}
        />
      )}

      {pendingDelete && (
        <DeleteConfirmModal
          wardName={pendingDelete.name}
          onConfirm={confirmDeleteWard}
          onCancel={() => { if (!deleting) { setPendingDelete(null); setDeleteError(null) } }}
          loading={deleting}
          error={deleteError}
        />
      )}

      {pendingDeleteType && (
        <DeleteTypeConfirmModal
          typeName={pendingDeleteType.name}
          roomCount={board.filter(w => w.room_type_id === pendingDeleteType.id).length}
          onConfirm={confirmDeleteType}
          onCancel={() => { if (!deletingType) { setPendingDeleteType(null); setDeleteTypeError(null) } }}
          loading={deletingType}
          error={deleteTypeError}
        />
      )}

      <AddRoomTypeModal
        open={showAddType}
        onClose={() => setShowAddType(false)}
        onAdd={rt => setRoomTypes(prev => [...prev, rt].sort((a, b) => a.name.localeCompare(b.name)))}
      />

      {showCreateWard !== null && (
        <CreateWardModal
          open={true}
          preselectedRoomTypeId={showCreateWard}
          onClose={() => setShowCreateWard(null)}
          departments={departments}
          roomTypes={roomTypes}
          nursingUnits={nursingUnits}
          onSuccess={(ward) => {
            setBoard(b => [...b, { ...ward, beds: [], room_type_data: roomTypes.find(rt => rt.id === ward.room_type_id) ?? null }])
            setShowCreateWard(null)
            refresh()
          }}
        />
      )}

      {editingWard && (
        <EditWardModal
          open={true}
          ward={editingWard}
          roomTypes={roomTypes}
          nursingUnits={nursingUnits}
          onClose={() => setEditingWard(null)}
          onSuccess={(details) => handleWardUpdate(editingWard.id, details)}
        />
      )}

      {showUnits && (
        <NursingUnitsModal
          open={true}
          units={nursingUnits}
          onClose={() => setShowUnits(false)}
          onChange={reloadUnits}
        />
      )}

      {addBedsWard && (
        <AddBedsModal
          open={true}
          ward={addBedsWard as Ward}
          onClose={() => setAddBedsWard(null)}
          onSuccess={() => { setAddBedsWard(null); refresh() }}
        />
      )}

    </div>
  )
}
