'use client'

import { useState, useTransition, useCallback } from 'react'
import { Plus, Pencil, Power, Search, Loader2, AlertTriangle, X, Save, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import {
  listDrugMaster, upsertDrugMaster, toggleDrugMaster,
  listDrugBrands, upsertDrugBrand, deleteDrugBrand,
  listLabMaster, upsertLabMaster, toggleLabMaster,
  listRadiologyMaster, upsertRadiologyMaster, toggleRadiologyMaster,
  listTariffs, upsertTariff, toggleTariff,
} from '@/app/actions/seeds'
import type { DrugMasterRow, DrugBrandRow, LabMasterRow, RadiologMasterRow, TariffRow } from '@/app/actions/seeds'

type SeedsTab = 'drugs' | 'lab' | 'radiology' | 'tariffs'

interface Props {
  initialDrugs:    DrugMasterRow[]
  initialLabTests: LabMasterRow[]
  initialRadiology: RadiologMasterRow[]
  tenants: { id: string; name: string; slug: string }[]
}

const LAB_CATEGORIES = [
  'Complete Blood Count','Liver Function','Kidney Function','Lipid Profile',
  'Thyroid','Diabetes','Electrolytes','Coagulation','Immunology','Microbiology',
  'Hormones','Tumor Markers','Urine','Cardiac Markers','Vitamins','General','Other',
]

const MODALITIES = ['xray','ct','mri','usg','echo','mammography','fluoroscopy',
  'nuclear','pet','dexa','angiography','interventional','dental','ophthalmic','special']

const TARIFF_CATEGORIES = ['surgery','procedure','package','general']

// ── Field helpers ─────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: '#94A3B8' }}>{label}</label>
      {children}
    </div>
  )
}

function Input({ value, onChange, placeholder, type = 'text' }: {
  value: string | number; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none"
      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#F8FAFC' }}
    />
  )
}

function Select({ value, onChange, options }: {
  value: string; onChange: (v: string) => void
  options: { value: string; label?: string }[]
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none"
      style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.12)', color: '#F8FAFC' }}>
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label ?? o.value}</option>
      ))}
    </select>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function SeedsClient({ initialDrugs, initialLabTests, initialRadiology, tenants }: Props) {
  const [tab, setTab]             = useState<SeedsTab>('drugs')
  const [drugs, setDrugs]         = useState(initialDrugs)
  const [labTests, setLabTests]   = useState(initialLabTests)
  const [radiology, setRadiology] = useState(initialRadiology)
  const [tariffs, setTariffs]     = useState<TariffRow[]>([])
  const [selectedTenant, setSelectedTenant] = useState<string>(tenants[0]?.id ?? '')
  const [search, setSearch]       = useState('')
  const [error, setError]         = useState('')
  const [isPending, startTransition] = useTransition()

  // Edit modal state
  const [editDrug, setEditDrug]           = useState<Partial<DrugMasterRow> | null>(null)
  const [drugBrands, setDrugBrands]       = useState<DrugBrandRow[]>([])
  const [brandsLoading, setBrandsLoading] = useState(false)
  const [showAddBrand, setShowAddBrand]   = useState(false)
  const [newBrand, setNewBrand]           = useState<Partial<DrugBrandRow>>({})
  const [editLab, setEditLab]             = useState<Partial<LabMasterRow> | null>(null)
  const [editRadiology, setEditRadio]     = useState<Partial<RadiologMasterRow> | null>(null)
  const [editTariff, setEditTariff]       = useState<Partial<TariffRow> | null>(null)

  const toast = (msg: string) => { setError(msg); setTimeout(() => setError(''), 5000) }

  const reloadDrugs = (q?: string) =>
    startTransition(async () => { setDrugs(await listDrugMaster(q)) })
  const reloadLab = (q?: string) =>
    startTransition(async () => { setLabTests(await listLabMaster(q)) })
  const reloadRadiology = (q?: string) =>
    startTransition(async () => { setRadiology(await listRadiologyMaster(q)) })
  const reloadTariffs = useCallback((tid: string, q?: string) =>
    startTransition(async () => { if (tid) setTariffs(await listTariffs(tid, q)) })
  , [])

  const handleSearch = (v: string) => {
    setSearch(v)
    if (tab === 'drugs')      reloadDrugs(v)
    if (tab === 'lab')        reloadLab(v)
    if (tab === 'radiology')  reloadRadiology(v)
    if (tab === 'tariffs')    reloadTariffs(selectedTenant, v)
  }

  const handleTenantChange = (tid: string) => {
    setSelectedTenant(tid)
    reloadTariffs(tid)
  }

  // ── Drug edit opener (loads brands for existing drugs) ────────────────────
  const openDrugEdit = (d: Partial<DrugMasterRow>) => {
    setEditDrug(d)
    setShowAddBrand(false)
    setNewBrand({})
    setDrugBrands([])
    if (d.id) {
      setBrandsLoading(true)
      listDrugBrands(d.id).then(b => { setDrugBrands(b); setBrandsLoading(false) })
    }
  }

  const saveBrand = () => {
    if (!editDrug?.id || !newBrand.brand_name?.trim() || !newBrand.manufacturer?.trim()) return
    startTransition(async () => {
      const res = await upsertDrugBrand({
        id:             newBrand.id,
        drug_master_id: editDrug.id!,
        brand_name:     newBrand.brand_name ?? '',
        manufacturer:   newBrand.manufacturer ?? '',
        hsn_code:       newBrand.hsn_code ?? '30049099',
        gst_rate:       newBrand.gst_rate ?? 12,
        pack_size:      newBrand.pack_size ?? 1,
        pack_unit:      newBrand.pack_unit ?? 'strip',
        mrp_per_pack:   newBrand.mrp_per_pack ?? null,
      })
      if (res.success) {
        setNewBrand({})
        setShowAddBrand(false)
        const brands = await listDrugBrands(editDrug.id!)
        setDrugBrands(brands)
      } else toast(res.error)
    })
  }

  const removeBrand = (brandId: string) => {
    startTransition(async () => {
      const res = await deleteDrugBrand(brandId)
      if (res.success && editDrug?.id) {
        const brands = await listDrugBrands(editDrug.id)
        setDrugBrands(brands)
      } else if (!res.success) toast(res.error)
    })
  }

  // ── Drug CRUD ──────────────────────────────────────────────────────────────
  const saveDrug = () => {
    if (!editDrug?.name?.trim()) return
    startTransition(async () => {
      const res = await upsertDrugMaster({
        id:                    editDrug.id,
        name:                  editDrug.name ?? '',
        generic_name:          editDrug.generic_name ?? '',
        category:              editDrug.category ?? '',
        form:                  editDrug.form ?? '',
        strength:              editDrug.strength ?? '',
        unit:                  editDrug.unit ?? '',
        schedule:              editDrug.schedule ?? null,
        atc_code:              editDrug.atc_code ?? null,
        pharmacological_class: editDrug.pharmacological_class ?? null,
      })
      if (res.success) { setEditDrug(null); setDrugBrands([]); reloadDrugs(search) }
      else toast(res.error)
    })
  }

  // ── Lab CRUD ───────────────────────────────────────────────────────────────
  const saveLab = () => {
    if (!editLab?.name?.trim()) return
    startTransition(async () => {
      const res = await upsertLabMaster({
        id:              editLab.id,
        name:            editLab.name ?? '',
        code:            editLab.code ?? '',
        category:        editLab.category ?? 'General',
        sample_type:     editLab.sample_type ?? '',
        unit:            editLab.unit ?? '',
        ref_low:         editLab.ref_low ?? null,
        ref_high:        editLab.ref_high ?? null,
        reference_range: editLab.reference_range ?? '',
      })
      if (res.success) { setEditLab(null); reloadLab(search) }
      else toast(res.error)
    })
  }

  // ── Radiology CRUD ─────────────────────────────────────────────────────────
  const saveRadiology = () => {
    if (!editRadiology?.name?.trim()) return
    startTransition(async () => {
      const res = await upsertRadiologyMaster({
        id:        editRadiology.id,
        name:      editRadiology.name ?? '',
        modality:  editRadiology.modality ?? 'xray',
        body_part: editRadiology.body_part ?? 'General',
      })
      if (res.success) { setEditRadio(null); reloadRadiology(search) }
      else toast(res.error)
    })
  }

  // ── Tariff CRUD ────────────────────────────────────────────────────────────
  const saveTariff = () => {
    if (!editTariff?.name?.trim() || !selectedTenant) return
    startTransition(async () => {
      const res = await upsertTariff({
        id:            editTariff.id,
        tenant_id:     selectedTenant,
        name:          editTariff.name ?? '',
        category:      editTariff.category ?? '',
        default_price: editTariff.default_price ?? 0,
      })
      if (res.success) { setEditTariff(null); reloadTariffs(selectedTenant, search) }
      else toast(res.error)
    })
  }

  // ── Filtered rows ──────────────────────────────────────────────────────────
  // Drugs: server handles all filtering (including brand names) — no client re-filter
  const filteredDrugs   = drugs
  const q = search.toLowerCase()
  const filteredLab     = q ? labTests.filter(l => l.name.toLowerCase().includes(q))  : labTests
  const filteredRadio   = q ? radiology.filter(r => r.name.toLowerCase().includes(q)) : radiology
  const filteredTariffs = q ? tariffs.filter(t => t.name.toLowerCase().includes(q))   : tariffs

  return (
    <div>
      {/* Tab nav */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl w-fit"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
        {([
          { id: 'drugs',    label: 'Drug Catalog'   },
          { id: 'lab',      label: 'Lab Tests'       },
          { id: 'radiology',label: 'Radiology'       },
          { id: 'tariffs',  label: 'Procedure Tariffs'},
        ] as const).map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setSearch('') }}
            className="px-4 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: tab === t.id ? 'rgba(13,148,136,0.2)' : 'transparent',
              color:      tab === t.id ? '#0D9488' : '#64748B',
              border:     tab === t.id ? '1px solid rgba(13,148,136,0.3)' : '1px solid transparent',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl mb-4 text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', color: '#F87171', border: '1px solid rgba(239,68,68,0.2)' }}>
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          <button className="ml-auto text-xs underline" onClick={() => setError('')}>Dismiss</button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: '#64748B' }} />
          <input
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search..."
            className="w-full pl-9 pr-3 py-2 rounded-xl text-sm focus:outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#F8FAFC' }}
          />
        </div>

        {tab === 'tariffs' && tenants.length > 0 && (
          <select value={selectedTenant} onChange={e => handleTenantChange(e.target.value)}
            className="px-3 py-2 rounded-xl text-sm focus:outline-none"
            style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.12)', color: '#F8FAFC' }}>
            {tenants.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}

        {isPending && <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#64748B' }} />}

        <button
          onClick={() => {
            if (tab === 'drugs')     openDrugEdit({})
            if (tab === 'lab')       setEditLab({ category: 'General' })
            if (tab === 'radiology') setEditRadio({ modality: 'xray', body_part: 'General' })
            if (tab === 'tariffs')   setEditTariff({ default_price: 0 })
          }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
          style={{ background: 'rgba(13,148,136,0.2)', color: '#34D399', border: '1px solid rgba(13,148,136,0.3)' }}>
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>

      {/* ── DRUGS ─────────────────────────────────────────────────────────── */}
      {tab === 'drugs' && (
        <Table
          headers={['Name / Generic', 'Form / Strength', 'Brands', 'Manufacturer', 'Cat · Sch', '']}
          empty={filteredDrugs.length === 0}
        >
          {filteredDrugs.map(d => {
            const brands = d.drug_brands ?? []
            const brandNames = brands.map(b => b.brand_name)
            const manufacturers = [...new Set(brands.map(b => b.manufacturer))]
            return (
              <tr key={d.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                {/* Name + generic stacked */}
                <td className="py-2.5 px-3">
                  <p className="text-sm font-medium" style={{ color: '#F8FAFC' }}>{d.name}</p>
                  {d.generic_name && (
                    <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>{d.generic_name}</p>
                  )}
                </td>
                {/* Form / Strength */}
                <td className="py-2.5 px-3 text-xs" style={{ color: '#94A3B8' }}>
                  {[d.form, d.strength].filter(Boolean).join(' ') || '—'}
                </td>
                {/* Brand names */}
                <td className="py-2.5 px-3">
                  {brands.length === 0 ? (
                    <span className="text-xs" style={{ color: '#475569' }}>—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {brandNames.slice(0, 2).map(b => (
                        <span key={b} className="px-1.5 py-0.5 rounded text-xs"
                          style={{ background: 'rgba(56,189,248,0.1)', color: '#38BDF8', border: '1px solid rgba(56,189,248,0.2)' }}>
                          {b}
                        </span>
                      ))}
                      {brandNames.length > 2 && (
                        <span className="px-1.5 py-0.5 rounded text-xs"
                          style={{ background: 'rgba(255,255,255,0.05)', color: '#64748B' }}>
                          +{brandNames.length - 2}
                        </span>
                      )}
                    </div>
                  )}
                </td>
                {/* Manufacturers */}
                <td className="py-2.5 px-3 text-xs" style={{ color: '#94A3B8', maxWidth: '180px' }}>
                  {manufacturers.length === 0 ? '—' : (
                    <span className="line-clamp-2">{manufacturers.slice(0, 2).join(', ')}{manufacturers.length > 2 ? ` +${manufacturers.length - 2}` : ''}</span>
                  )}
                </td>
                {/* Category + Schedule */}
                <td className="py-2.5 px-3">
                  <p className="text-xs" style={{ color: '#94A3B8' }}>{d.category ?? '—'}</p>
                  {d.schedule && (
                    <span className="mt-0.5 inline-block px-1.5 py-0.5 rounded text-xs font-mono"
                      style={{ background: 'rgba(167,139,250,0.15)', color: '#A78BFA' }}>
                      {d.schedule}
                    </span>
                  )}
                </td>
                <td className="py-2.5 px-3">
                  <RowActions
                    onEdit={() => openDrugEdit(d)}
                    onToggle={() => startTransition(async () => {
                      const res = await toggleDrugMaster(d.id, !d.is_active)
                      if (res.success) reloadDrugs(search); else toast(res.error)
                    })}
                    isActive={d.is_active}
                  />
                </td>
              </tr>
            )
          })}
        </Table>
      )}

      {/* ── LAB TESTS ─────────────────────────────────────────────────────── */}
      {tab === 'lab' && (
        <Table
          headers={['Name', 'Code', 'Category', 'Sample', 'Unit', 'Range', '']}
          empty={filteredLab.length === 0}
        >
          {filteredLab.map(l => (
            <tr key={l.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <td className="py-2.5 px-3 text-sm" style={{ color: '#F8FAFC' }}>{l.name}</td>
              <td className="py-2.5 px-3 text-xs font-mono" style={{ color: '#A78BFA' }}>{l.code ?? '—'}</td>
              <td className="py-2.5 px-3 text-xs" style={{ color: '#94A3B8' }}>{l.category}</td>
              <td className="py-2.5 px-3 text-xs" style={{ color: '#94A3B8' }}>{l.sample_type ?? '—'}</td>
              <td className="py-2.5 px-3 text-xs" style={{ color: '#94A3B8' }}>{l.unit ?? '—'}</td>
              <td className="py-2.5 px-3 text-xs" style={{ color: '#94A3B8' }}>{l.reference_range ?? '—'}</td>
              <td className="py-2.5 px-3">
                <RowActions
                  onEdit={() => setEditLab(l)}
                  onToggle={() => startTransition(async () => {
                    const res = await toggleLabMaster(l.id, !l.is_active)
                    if (res.success) reloadLab(search); else toast(res.error)
                  })}
                  isActive={l.is_active}
                />
              </td>
            </tr>
          ))}
        </Table>
      )}

      {/* ── RADIOLOGY ─────────────────────────────────────────────────────── */}
      {tab === 'radiology' && (
        <Table
          headers={['Name', 'Modality', 'Body Part', '']}
          empty={filteredRadio.length === 0}
        >
          {filteredRadio.map(r => (
            <tr key={r.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <td className="py-2.5 px-3 text-sm" style={{ color: '#F8FAFC' }}>{r.name}</td>
              <td className="py-2.5 px-3 text-xs uppercase" style={{ color: '#38BDF8' }}>{r.modality}</td>
              <td className="py-2.5 px-3 text-xs" style={{ color: '#94A3B8' }}>{r.body_part}</td>
              <td className="py-2.5 px-3">
                <RowActions
                  onEdit={() => setEditRadio(r)}
                  onToggle={() => startTransition(async () => {
                    const res = await toggleRadiologyMaster(r.id, !r.is_active)
                    if (res.success) reloadRadiology(search); else toast(res.error)
                  })}
                  isActive={r.is_active}
                />
              </td>
            </tr>
          ))}
        </Table>
      )}

      {/* ── TARIFFS ───────────────────────────────────────────────────────── */}
      {tab === 'tariffs' && (
        <>
          {tariffs.length === 0 && !isPending && selectedTenant && (
            <button onClick={() => reloadTariffs(selectedTenant)}
              className="text-xs px-3 py-1.5 rounded-lg mb-4"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#94A3B8' }}>
              Load tariffs for selected tenant
            </button>
          )}
          <Table
            headers={['Name', 'Category', 'Price', '']}
            empty={filteredTariffs.length === 0 && tariffs.length > 0}
          >
            {filteredTariffs.map(t => (
              <tr key={t.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <td className="py-2.5 px-3 text-sm" style={{ color: '#F8FAFC' }}>{t.name}</td>
                <td className="py-2.5 px-3 text-xs capitalize" style={{ color: '#94A3B8' }}>{t.category ?? '—'}</td>
                <td className="py-2.5 px-3 text-xs font-medium" style={{ color: '#34D399' }}>
                  ₹{t.default_price.toLocaleString('en-IN')}
                </td>
                <td className="py-2.5 px-3">
                  <RowActions
                    onEdit={() => setEditTariff(t)}
                    onToggle={() => startTransition(async () => {
                      const res = await toggleTariff(t.id, !t.is_active)
                      if (res.success) reloadTariffs(selectedTenant, search); else toast(res.error)
                    })}
                    isActive={t.is_active}
                  />
                </td>
              </tr>
            ))}
          </Table>
        </>
      )}

      {/* ── EDIT MODALS ───────────────────────────────────────────────────── */}

      {/* Drug edit */}
      {editDrug !== null && (
        <EditModal
          title={editDrug.id ? 'Edit drug' : 'Add drug'}
          onClose={() => { setEditDrug(null); setDrugBrands([]); setShowAddBrand(false); setNewBrand({}) }}
          onSave={saveDrug}
          disabled={!editDrug.name?.trim() || isPending}
          pending={isPending}
          wide
        >
          {/* ── Drug master fields ─────────────────────────────── */}
          <div className="grid grid-cols-1 gap-3">
            <Field label="Generic / INN name *">
              <Input value={editDrug.name ?? ''} onChange={v => setEditDrug(p => ({ ...p, name: v }))} placeholder="e.g. Amoxicillin + Clavulanate" />
            </Field>
            <Field label="Pharmacological class">
              <Input value={editDrug.pharmacological_class ?? ''} onChange={v => setEditDrug(p => ({ ...p, pharmacological_class: v }))} placeholder="e.g. Beta-lactam antibiotic" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Form">
                <Input value={editDrug.form ?? ''} onChange={v => setEditDrug(p => ({ ...p, form: v }))} placeholder="Tablet" />
              </Field>
              <Field label="Strength">
                <Input value={editDrug.strength ?? ''} onChange={v => setEditDrug(p => ({ ...p, strength: v }))} placeholder="625mg" />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Category">
                <Input value={editDrug.category ?? ''} onChange={v => setEditDrug(p => ({ ...p, category: v }))} placeholder="Antibiotic" />
              </Field>
              <Field label="Unit">
                <Input value={editDrug.unit ?? ''} onChange={v => setEditDrug(p => ({ ...p, unit: v }))} placeholder="Tab" />
              </Field>
              <Field label="Schedule">
                <Select value={editDrug.schedule ?? 'OTC'}
                  onChange={v => setEditDrug(p => ({ ...p, schedule: v }))}
                  options={['OTC','H','H1','X','G','P'].map(s => ({ value: s }))} />
              </Field>
            </div>
            <Field label="ATC code">
              <Input value={editDrug.atc_code ?? ''} onChange={v => setEditDrug(p => ({ ...p, atc_code: v }))} placeholder="e.g. J01CR02" />
            </Field>
          </div>

          {/* ── Brands section (only for saved drugs) ─────────── */}
          {editDrug.id && (
            <div className="mt-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>
                  Brands / Manufacturers
                </p>
                <button onClick={() => { setShowAddBrand(v => !v); setNewBrand({}) }}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg"
                  style={{ background: 'rgba(13,148,136,0.15)', color: '#34D399', border: '1px solid rgba(13,148,136,0.25)' }}>
                  {showAddBrand ? <><ChevronUp className="w-3 h-3" /> Cancel</> : <><Plus className="w-3 h-3" /> Add brand</>}
                </button>
              </div>

              {/* Add brand inline form */}
              {showAddBrand && (
                <div className="rounded-xl p-3 mb-3 grid grid-cols-1 gap-2"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Brand name *">
                      <Input value={newBrand.brand_name ?? ''} onChange={v => setNewBrand(p => ({ ...p, brand_name: v }))} placeholder="e.g. Augmentin" />
                    </Field>
                    <Field label="Manufacturer *">
                      <Input value={newBrand.manufacturer ?? ''} onChange={v => setNewBrand(p => ({ ...p, manufacturer: v }))} placeholder="e.g. GSK" />
                    </Field>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <Field label="Pack size">
                      <Input type="number" value={newBrand.pack_size ?? 10} onChange={v => setNewBrand(p => ({ ...p, pack_size: Number(v) }))} placeholder="10" />
                    </Field>
                    <Field label="Pack unit">
                      <Input value={newBrand.pack_unit ?? 'strip'} onChange={v => setNewBrand(p => ({ ...p, pack_unit: v }))} placeholder="strip" />
                    </Field>
                    <Field label="MRP / pack (₹)">
                      <Input type="number" value={newBrand.mrp_per_pack ?? ''} onChange={v => setNewBrand(p => ({ ...p, mrp_per_pack: v ? Number(v) : null }))} placeholder="50" />
                    </Field>
                    <Field label="GST %">
                      <Input type="number" value={newBrand.gst_rate ?? 12} onChange={v => setNewBrand(p => ({ ...p, gst_rate: Number(v) }))} placeholder="12" />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="HSN code">
                      <Input value={newBrand.hsn_code ?? '30049099'} onChange={v => setNewBrand(p => ({ ...p, hsn_code: v }))} placeholder="30049099" />
                    </Field>
                    <div className="flex items-end">
                      <button onClick={saveBrand}
                        disabled={!newBrand.brand_name?.trim() || !newBrand.manufacturer?.trim() || isPending}
                        className="w-full py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                        style={{ background: 'rgba(13,148,136,0.8)', color: '#fff' }}>
                        {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        Save brand
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Brands list */}
              {brandsLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#64748B' }} />
                </div>
              ) : drugBrands.length === 0 ? (
                <p className="text-xs py-3 text-center" style={{ color: '#475569' }}>No brands added yet.</p>
              ) : (
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                  <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                        {['Brand', 'Manufacturer', 'Pack', 'MRP', 'HSN', 'GST', ''].map(h => (
                          <th key={h} className="py-2 px-2 text-left text-xs" style={{ color: '#64748B' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {drugBrands.map(b => (
                        <tr key={b.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                          <td className="py-2 px-2 text-xs font-medium" style={{ color: '#F8FAFC' }}>{b.brand_name}</td>
                          <td className="py-2 px-2 text-xs" style={{ color: '#94A3B8' }}>{b.manufacturer}</td>
                          <td className="py-2 px-2 text-xs" style={{ color: '#94A3B8' }}>{b.pack_size} {b.pack_unit}</td>
                          <td className="py-2 px-2 text-xs font-medium" style={{ color: '#34D399' }}>
                            {b.mrp_per_pack != null ? `₹${b.mrp_per_pack}` : '—'}
                          </td>
                          <td className="py-2 px-2 text-xs font-mono" style={{ color: '#64748B' }}>{b.hsn_code}</td>
                          <td className="py-2 px-2 text-xs" style={{ color: '#64748B' }}>{b.gst_rate}%</td>
                          <td className="py-2 px-2">
                            <button onClick={() => removeBrand(b.id)}
                              className="p-1 rounded" style={{ color: '#F87171' }}>
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </EditModal>
      )}

      {/* Lab edit */}
      {editLab !== null && (
        <EditModal
          title={editLab.id ? 'Edit lab test' : 'Add lab test'}
          onClose={() => setEditLab(null)}
          onSave={saveLab}
          disabled={!editLab.name?.trim() || isPending}
          pending={isPending}
        >
          <div className="grid grid-cols-1 gap-3">
            <Field label="Test name *">
              <Input value={editLab.name ?? ''} onChange={v => setEditLab(p => ({ ...p, name: v }))} placeholder="Complete Blood Count" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Code">
                <Input value={editLab.code ?? ''} onChange={v => setEditLab(p => ({ ...p, code: v }))} placeholder="CBC" />
              </Field>
              <Field label="Category">
                <Select value={editLab.category ?? 'General'}
                  onChange={v => setEditLab(p => ({ ...p, category: v }))}
                  options={LAB_CATEGORIES.map(c => ({ value: c }))} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sample type">
                <Input value={editLab.sample_type ?? ''} onChange={v => setEditLab(p => ({ ...p, sample_type: v }))} placeholder="blood" />
              </Field>
              <Field label="Unit">
                <Input value={editLab.unit ?? ''} onChange={v => setEditLab(p => ({ ...p, unit: v }))} placeholder="g/dL" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ref low">
                <Input type="number" value={editLab.ref_low ?? ''} onChange={v => setEditLab(p => ({ ...p, ref_low: v ? Number(v) : null }))} placeholder="0" />
              </Field>
              <Field label="Ref high">
                <Input type="number" value={editLab.ref_high ?? ''} onChange={v => setEditLab(p => ({ ...p, ref_high: v ? Number(v) : null }))} placeholder="100" />
              </Field>
            </div>
            <Field label="Reference range text">
              <Input value={editLab.reference_range ?? ''} onChange={v => setEditLab(p => ({ ...p, reference_range: v }))} placeholder="11.5–17.5 g/dL" />
            </Field>
          </div>
        </EditModal>
      )}

      {/* Radiology edit */}
      {editRadiology !== null && (
        <EditModal
          title={editRadiology.id ? 'Edit radiology procedure' : 'Add radiology procedure'}
          onClose={() => setEditRadio(null)}
          onSave={saveRadiology}
          disabled={!editRadiology.name?.trim() || isPending}
          pending={isPending}
        >
          <div className="grid grid-cols-1 gap-3">
            <Field label="Procedure name *">
              <Input value={editRadiology.name ?? ''} onChange={v => setEditRadio(p => ({ ...p, name: v }))} placeholder="Chest X-Ray PA View" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Modality">
                <Select value={editRadiology.modality ?? 'xray'}
                  onChange={v => setEditRadio(p => ({ ...p, modality: v }))}
                  options={MODALITIES.map(m => ({ value: m, label: m.toUpperCase() }))} />
              </Field>
              <Field label="Body part">
                <Input value={editRadiology.body_part ?? ''} onChange={v => setEditRadio(p => ({ ...p, body_part: v }))} placeholder="Chest" />
              </Field>
            </div>
          </div>
        </EditModal>
      )}

      {/* Tariff edit */}
      {editTariff !== null && (
        <EditModal
          title={editTariff.id ? 'Edit tariff' : 'Add tariff'}
          onClose={() => setEditTariff(null)}
          onSave={saveTariff}
          disabled={!editTariff.name?.trim() || isPending}
          pending={isPending}
        >
          <div className="grid grid-cols-1 gap-3">
            <Field label="Procedure name *">
              <Input value={editTariff.name ?? ''} onChange={v => setEditTariff(p => ({ ...p, name: v }))} placeholder="Appendectomy" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <Select value={editTariff.category ?? 'procedure'}
                  onChange={v => setEditTariff(p => ({ ...p, category: v }))}
                  options={TARIFF_CATEGORIES.map(c => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))} />
              </Field>
              <Field label="Price (₹)">
                <Input type="number" value={editTariff.default_price ?? 0}
                  onChange={v => setEditTariff(p => ({ ...p, default_price: Number(v) }))} placeholder="5000" />
              </Field>
            </div>
          </div>
        </EditModal>
      )}
    </div>
  )
}

// ── Shared sub-components ──────────────────────────────────────────────────────

function Table({ headers, children, empty }: {
  headers: string[]
  children: React.ReactNode
  empty: boolean
}) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="overflow-x-auto">
        <table className="w-full text-left" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
              {headers.map(h => (
                <th key={h} className="py-2.5 px-3 text-xs font-semibold uppercase tracking-wide"
                  style={{ color: '#64748B' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {empty ? (
              <tr>
                <td colSpan={headers.length} className="py-10 text-center text-sm" style={{ color: '#475569' }}>
                  No records found.
                </td>
              </tr>
            ) : children}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RowActions({ onEdit, onToggle, isActive }: {
  onEdit: () => void; onToggle: () => void; isActive: boolean
}) {
  return (
    <div className="flex items-center gap-1.5 justify-end">
      <button onClick={onEdit} title="Edit"
        className="p-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)', color: '#94A3B8' }}>
        <Pencil className="w-3.5 h-3.5" />
      </button>
      <button onClick={onToggle} title={isActive ? 'Deactivate' : 'Activate'}
        className="p-1.5 rounded-lg"
        style={{
          background: isActive ? 'rgba(16,185,129,0.1)' : 'rgba(100,116,139,0.1)',
          color:      isActive ? '#34D399' : '#64748B',
        }}>
        <Power className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function EditModal({ title, onClose, onSave, disabled, pending, children, wide }: {
  title: string
  onClose: () => void
  onSave: () => void
  disabled: boolean
  pending: boolean
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-2xl p-6 max-h-[90vh] overflow-y-auto`}
        style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.12)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold" style={{ color: '#F8FAFC' }}>{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg" style={{ color: '#64748B' }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
        <div className="flex gap-3 mt-4">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#94A3B8' }}>
            Cancel
          </button>
          <button onClick={onSave} disabled={disabled}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
            style={{ background: 'rgba(13,148,136,0.8)', color: '#fff', opacity: disabled ? 0.5 : 1 }}>
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
