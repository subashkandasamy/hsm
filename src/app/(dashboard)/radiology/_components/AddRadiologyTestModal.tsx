'use client'

import { useState, useEffect, useRef, Fragment } from 'react'
import { Plus, Search, Pencil, Globe, ScanLine, ChevronDown, ChevronRight } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Select from '@/components/ui/Select'
import {
  createRadiologyTest, updateRadiologyTest,
  listAllRadiologyCatalog, listRadiologyMaster, activateRadiologyFromMaster,
} from '@/app/actions/radiology'
import type { RadiologyCatalog, RadiologyMaster } from '@/lib/types'

interface Props { open: boolean; onClose: () => void; onSuccess: () => void }

const MODALITIES = [
  { value: 'xray',          label: 'X-Ray' },
  { value: 'ct',            label: 'CT Scan' },
  { value: 'mri',           label: 'MRI' },
  { value: 'usg',           label: 'Ultrasound' },
  { value: 'echo',          label: 'Echocardiography' },
  { value: 'mammography',   label: 'Mammography' },
  { value: 'fluoroscopy',   label: 'Fluoroscopy' },
  { value: 'nuclear',       label: 'Nuclear Medicine' },
  { value: 'pet',           label: 'PET Scan' },
  { value: 'dexa',          label: 'DEXA Scan' },
  { value: 'angiography',   label: 'Angiography' },
  { value: 'interventional', label: 'Interventional' },
  { value: 'dental',        label: 'Dental Imaging' },
  { value: 'ophthalmic',    label: 'Ophthalmic' },
  { value: 'special',       label: 'Special' },
]
const MODALITY_LABEL: Record<string, string> = Object.fromEntries(MODALITIES.map(m => [m.value, m.label]))
const MODALITY_COLOR: Record<string, { bg: string; color: string }> = {
  xray:          { bg: '#EFF6FF', color: '#1D4ED8' },
  ct:            { bg: '#FEF3C7', color: '#B45309' },
  mri:           { bg: '#F3E8FF', color: '#7C3AED' },
  usg:           { bg: '#DCFCE7', color: '#15803D' },
  echo:          { bg: '#FDF4FF', color: '#DB2777' },
  mammography:   { bg: '#FFF0F9', color: '#DB2777' },
  fluoroscopy:   { bg: '#FFF7ED', color: '#C2410C' },
  nuclear:       { bg: '#F0F9FF', color: '#0369A1' },
  pet:           { bg: '#ECFDF5', color: '#047857' },
  dexa:          { bg: '#F5F3FF', color: '#6D28D9' },
  angiography:   { bg: '#FFF1F2', color: '#BE123C' },
  interventional:{ bg: '#FEF9C3', color: '#854D0E' },
  dental:        { bg: '#F0FDFA', color: '#0D9488' },
  ophthalmic:    { bg: '#FFFBEB', color: '#D97706' },
  special:       { bg: '#F8FAFC', color: '#475569' },
}

// Body part options keyed by modality — shown as a <select> to avoid native datalist overflow
const MODALITY_BODY_PARTS: Record<string, string[]> = {
  xray:          ['Chest', 'Abdomen', 'Skull & Face', 'Spine', 'Upper Limb', 'Lower Limb', 'Other'],
  ct:            ['Brain', 'Head & Neck', 'Chest', 'Abdomen', 'Pelvis', 'Spine', 'Extremities', 'Vascular & Advanced'],
  mri:           ['Brain', 'Spine', 'Upper Limb', 'Lower Limb', 'Abdomen', 'Pelvis', 'Chest & Breast', 'Head & Neck', 'Fetal & Whole Body', 'Vascular'],
  usg:           ['Abdomen', 'Pelvis', 'Obstetric', 'Head & Neck', 'Breast', 'Musculoskeletal', 'Vascular Doppler', 'Advanced'],
  echo:          ['Echocardiography'],
  mammography:   ['Screening', 'Diagnostic'],
  fluoroscopy:   ['GI Contrast Studies', 'Genitourinary', 'Biliary & Other'],
  nuclear:       ['Bone & MSK', 'Thyroid & Endocrine', 'Renal', 'Cardiac', 'Pulmonary', 'GI & Hepatic', 'Neurology', 'Infection & Oncology', 'Special'],
  pet:           ['FDG PET-CT', 'Hybrid PET', 'Specialised Tracers'],
  dexa:          ['Bone Density'],
  angiography:   ['Cerebrovascular', 'Peripheral Vascular', 'Venous', 'Cardiac'],
  interventional:['Vascular', 'Embolization & Ablation', 'Biliary & Drainage', 'Renal', 'Biopsy', 'Pain Management', 'Vascular Access', 'Other'],
  dental:        ['Dental'],
  ophthalmic:    ['Retinal Imaging', 'Anterior Segment'],
  special:       ['Special'],
}

type ScanFormData = { name: string; modality: string; body_part: string; price: string }
const BLANK: ScanFormData = { name: '', modality: '', body_part: '', price: '' }

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item); (acc[k] ??= []).push(item); return acc
  }, {})
}

type Tab = 'catalog' | 'master' | 'custom'

export default function AddRadiologyTestModal({ open, onClose, onSuccess }: Props) {
  const [tab, setTab] = useState<Tab>('catalog')
  const catalogFetched = useRef(false)
  const masterFetched  = useRef(false)

  // ── Catalog tab ──────────────────────────────────────────────────────────────
  const [tests, setTests]               = useState<RadiologyCatalog[]>([])
  const [loading, setLoading]           = useState(false)
  const [catQuery, setCatQuery]         = useState('')
  const [catMod, setCatMod]             = useState('')
  const [catExpanded, setCatExpanded]   = useState<Set<string>>(new Set())
  const [editId, setEditId]             = useState<string | null>(null)
  const [editForm, setEditForm]         = useState<ScanFormData>(BLANK)
  const [editErr, setEditErr]           = useState('')
  const [editSaving, setEditSaving]     = useState(false)
  const [toggling, setToggling]         = useState<string | null>(null)

  // ── Master tab ───────────────────────────────────────────────────────────────
  const [masterTests, setMasterTests]         = useState<RadiologyMaster[]>([])
  const [masterLoading, setMasterLoading]     = useState(false)
  const [masterQuery, setMasterQuery]         = useState('')
  const [masterMod, setMasterMod]             = useState('')
  const [masterExpanded, setMasterExpanded]   = useState<Set<string>>(new Set())
  const [activating, setActivating]           = useState<string | null>(null)
  const [activatingGroup, setActivatingGroup] = useState<string | null>(null)
  const [priceInputs, setPriceInputs]         = useState<Record<string, string>>({})
  const [groupPrices, setGroupPrices]         = useState<Record<string, string>>({})
  const [masterErrors, setMasterErrors]       = useState<Record<string, string>>({})

  // ── Custom tab ───────────────────────────────────────────────────────────────
  const [customForm, setCustomForm]     = useState<ScanFormData>(BLANK)
  const [customErr, setCustomErr]       = useState('')
  const [customSaving, setCustomSaving] = useState(false)

  useEffect(() => {
    if (!open) {
      catalogFetched.current = false
      masterFetched.current  = false
      return
    }
    if (tab === 'catalog' && !catalogFetched.current) {
      catalogFetched.current = true
      loadCatalog()
    }
    if (tab === 'master' && !masterFetched.current) {
      masterFetched.current = true
      loadMaster()
    }
  }, [open, tab])

  async function loadCatalog() {
    setLoading(true)
    const data = await listAllRadiologyCatalog()
    setTests(data)
    // Expand all groups on first load
    setCatExpanded(prev => prev.size > 0 ? prev : new Set(data.map(t => `${t.modality ?? 'other'}|${t.body_part}`)))
    setLoading(false)
    // Empty catalog → start on "Add from Master" so it's obvious how to add scans.
    if (data.length === 0) setTab('master')
  }

  async function loadMaster() {
    setMasterLoading(true)
    const [masterList, catalogList] = await Promise.all([listRadiologyMaster(), listAllRadiologyCatalog()])
    const activatedIds = new Set(catalogList.map(t => t.radiology_master_id).filter(Boolean))
    const available = masterList.filter(m => !activatedIds.has(m.id))
    setMasterTests(available)
    setMasterExpanded(prev => prev.size > 0 ? prev : new Set(available.map(m => m.body_part)))
    setMasterLoading(false)
  }

  // ── Catalog helpers ──────────────────────────────────────────────────────────

  const filteredCatalog = tests.filter(t => {
    const matchQ = !catQuery.trim() || t.name.toLowerCase().includes(catQuery.toLowerCase())
    const matchM = !catMod || t.modality === catMod
    return matchQ && matchM
  })

  // Group key: `modality|body_part` for uniqueness across modalities
  const catalogGroups = groupBy(filteredCatalog, t => `${t.modality ?? 'other'}|${t.body_part}`)
  const catalogGroupNames = Object.keys(catalogGroups).sort((a, b) => {
    const [aMod, aBp] = a.split('|')
    const [bMod, bBp] = b.split('|')
    const modOrder =
      (MODALITIES.findIndex(m => m.value === aMod) + 1 || 99) -
      (MODALITIES.findIndex(m => m.value === bMod) + 1 || 99)
    if (modOrder !== 0) return modOrder
    return aBp.localeCompare(bBp)
  })

  function toggleCatGroup(key: string) {
    setCatExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  async function submitEdit() {
    if (!editId || !editForm.name.trim()) { setEditErr('Name is required'); return }
    if (!editForm.price) { setEditErr('Price is required'); return }
    setEditSaving(true); setEditErr('')
    const res = await updateRadiologyTest(editId, {
      name: editForm.name.trim(),
      modality: editForm.modality || null,
      body_part: editForm.body_part.trim() || 'General',
      price: parseFloat(editForm.price) || 0,
    })
    setEditSaving(false)
    if (!res.success) { setEditErr(res.error); return }
    setTests(prev => prev.map(t => t.id === editId
      ? { ...t, name: editForm.name.trim(), modality: editForm.modality || null,
          body_part: editForm.body_part.trim() || 'General', price: parseFloat(editForm.price) || 0 }
      : t
    ))
    setEditId(null)
  }

  async function toggleActive(t: RadiologyCatalog) {
    setToggling(t.id)
    await updateRadiologyTest(t.id, { is_active: !t.is_active })
    setTests(prev => prev.map(item => item.id === t.id ? { ...item, is_active: !t.is_active } : item))
    setToggling(null)
  }

  async function toggleGroupActive(groupKey: string, makeActive: boolean) {
    const group = catalogGroups[groupKey] ?? []
    await Promise.all(group.map(t => updateRadiologyTest(t.id, { is_active: makeActive })))
    setTests(prev => prev.map(t =>
      `${t.modality ?? 'other'}|${t.body_part}` === groupKey ? { ...t, is_active: makeActive } : t
    ))
  }

  // ── Master helpers ───────────────────────────────────────────────────────────

  const filteredMaster = masterTests.filter(m => {
    const matchQ = !masterQuery.trim() || m.name.toLowerCase().includes(masterQuery.toLowerCase())
    const matchM = !masterMod || m.modality === masterMod
    return matchQ && matchM
  })

  const masterGroups = groupBy(filteredMaster, m => m.body_part)
  const masterGroupNames = Object.keys(masterGroups).sort()

  function toggleMasterGroup(bp: string) {
    setMasterExpanded(prev => { const n = new Set(prev); n.has(bp) ? n.delete(bp) : n.add(bp); return n })
  }

  async function handleActivate(master: RadiologyMaster) {
    const priceStr = priceInputs[master.id] ?? groupPrices[master.body_part] ?? ''
    const price = parseFloat(priceStr)
    if (isNaN(price) || price < 0) {
      setMasterErrors(prev => ({ ...prev, [master.id]: 'Enter a valid price' })); return
    }
    setMasterErrors(prev => ({ ...prev, [master.id]: '' }))
    setActivating(master.id)
    const res = await activateRadiologyFromMaster(master.id, price)
    setActivating(null)
    if (!res.success) { setMasterErrors(prev => ({ ...prev, [master.id]: res.error })); return }
    setMasterTests(prev => prev.filter(m => m.id !== master.id))
    catalogFetched.current = false
  }

  async function handleActivateGroup(bp: string) {
    const group = masterGroups[bp] ?? []
    const groupPrice = parseFloat(groupPrices[bp] ?? '')
    if (isNaN(groupPrice) || groupPrice < 0) {
      setMasterErrors(prev => ({ ...prev, [`group_${bp}`]: 'Set a group price first' })); return
    }
    setMasterErrors(prev => { const n = { ...prev }; delete n[`group_${bp}`]; return n })
    setActivatingGroup(bp)
    await Promise.allSettled(
      group.map(m => {
        const p = priceInputs[m.id] ? parseFloat(priceInputs[m.id]) : groupPrice
        return activateRadiologyFromMaster(m.id, isNaN(p) ? groupPrice : p)
      })
    )
    setMasterTests(prev => prev.filter(m => m.body_part !== bp))
    setActivatingGroup(null)
    catalogFetched.current = false
  }

  // ── Custom ───────────────────────────────────────────────────────────────────

  async function submitCustom() {
    if (!customForm.name.trim()) { setCustomErr('Name is required'); return }
    if (!customForm.price) { setCustomErr('Price is required'); return }
    setCustomSaving(true); setCustomErr('')
    const res = await createRadiologyTest({
      name: customForm.name.trim(),
      modality: customForm.modality || null,
      body_part: customForm.body_part.trim() || 'General',
      price: parseFloat(customForm.price) || 0,
    })
    setCustomSaving(false)
    if (!res.success) { setCustomErr(res.error); return }
    setCustomForm(BLANK)
    catalogFetched.current = false
    setTab('catalog')
  }

  // ── UI ───────────────────────────────────────────────────────────────────────

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'catalog', label: `My Catalog (${tests.length})`, icon: <ScanLine className="w-3.5 h-3.5" /> },
    { key: 'master',  label: 'Add from Master',              icon: <Globe className="w-3.5 h-3.5" /> },
    { key: 'custom',  label: 'Custom Procedure',             icon: <Plus className="w-3.5 h-3.5" /> },
  ]

  const inp = 'w-full px-3 py-2 rounded-xl text-sm border'
  const bdr = { borderColor: '#E2E8F0', color: '#0F172A', background: '#fff' }

  return (
    <Modal open={open} onClose={onClose} title="Radiology Catalog" maxWidth="72rem">
      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b" style={{ borderColor: '#E2E8F0' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg -mb-px"
            style={tab === t.key
              ? { color: '#0D9488', borderBottom: '2px solid #0D9488', background: '#F0FDFA' }
              : { color: '#64748B', borderBottom: '2px solid transparent', background: 'transparent', cursor: 'pointer' }}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          MY CATALOG TAB — modality filter + grouped by body_part
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'catalog' && (
        <>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-44">
              <Search className="absolute left-3 top-2.5 w-4 h-4" style={{ color: '#94A3B8' }} />
              <input value={catQuery} onChange={e => setCatQuery(e.target.value)}
                placeholder="Search procedures…"
                className={`${inp} pl-9`} style={bdr} />
            </div>
            <Select value={catMod} onChange={e => setCatMod(e.target.value)} className="w-44">
              <option value="">All modalities</option>
              {MODALITIES.map(m => {
                const count = tests.filter(t => t.modality === m.value).length
                if (count === 0) return null
                return <option key={m.value} value={m.value}>{m.label} ({count})</option>
              })}
            </Select>
          </div>

          {loading ? (
            <p className="text-sm text-center py-10" style={{ color: '#94A3B8' }}>Loading catalog…</p>
          ) : filteredCatalog.length === 0 ? (
            <p className="text-sm text-center py-10" style={{ color: '#94A3B8' }}>
              {catQuery || catMod ? 'No procedures match.' : 'No procedures yet — add from Master or create a Custom one.'}
            </p>
          ) : (
            <div className="space-y-2" style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 4 }}>
              {catalogGroupNames.map(groupKey => {
                const group = catalogGroups[groupKey]
                const [mod, bp] = groupKey.split('|')
                const mc = MODALITY_COLOR[mod] ?? { bg: '#F1F5F9', color: '#64748B' }
                const activeCount = group.filter(t => t.is_active).length
                const expanded = catExpanded.has(groupKey)
                const allActive = activeCount === group.length

                return (
                  <div key={groupKey} className="rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
                    <div className="flex items-center gap-3 px-3 py-2.5"
                      style={{ background: '#F8FAFC', borderBottom: expanded ? '1px solid #E2E8F0' : 'none' }}>
                      <button onClick={() => toggleCatGroup(groupKey)} className="flex items-center gap-2 flex-1 text-left min-w-0">
                        {expanded
                          ? <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: '#64748B' }} />
                          : <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: '#64748B' }} />}
                        {/* Show modality chip only when not filtered */}
                        {!catMod && (
                          <span className="px-2 py-0.5 rounded-md text-xs font-semibold flex-shrink-0"
                            style={{ background: mc.bg, color: mc.color }}>
                            {MODALITY_LABEL[mod] ?? mod}
                          </span>
                        )}
                        <span className="text-sm font-semibold truncate" style={{ color: '#0F172A' }}>{bp}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                          style={{ background: '#E2E8F0', color: '#64748B' }}>
                          {activeCount} / {group.length} active
                        </span>
                      </button>
                      <button
                        onClick={() => toggleGroupActive(groupKey, !allActive)}
                        className="px-3 py-1 rounded-lg text-xs font-semibold flex-shrink-0"
                        style={allActive
                          ? { background: '#FEF3C7', color: '#92400E', border: 'none', cursor: 'pointer' }
                          : { background: '#DCFCE7', color: '#15803D', border: 'none', cursor: 'pointer' }}>
                        {allActive ? 'Disable All' : 'Enable All'}
                      </button>
                    </div>

                    {expanded && (
                      <div>
                        {group.map(t => (
                          <Fragment key={t.id}>
                            <div className="flex items-center gap-3 px-3 py-2.5"
                              style={{ borderBottom: '1px solid #F8FAFC', background: t.is_active ? '#fff' : '#FAFAFA' }}>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-medium truncate" style={{ color: t.is_active ? '#0F172A' : '#94A3B8' }}>
                                    {t.name}
                                  </span>
                                  {t.radiology_master_id && (
                                    <span className="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0"
                                      style={{ background: '#EFF6FF', color: '#3B82F6', fontWeight: 500 }}>Global</span>
                                  )}
                                </div>
                              </div>
                              <span className="text-sm font-semibold flex-shrink-0" style={{ color: '#0D9488' }}>
                                ₹{t.price.toLocaleString('en-IN')}
                              </span>
                              <button onClick={() => toggleActive(t)} disabled={toggling === t.id}
                                className="px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0"
                                style={t.is_active
                                  ? { background: '#DCFCE7', color: '#15803D', border: 'none', cursor: 'pointer' }
                                  : { background: '#FEF3C7', color: '#92400E', border: 'none', cursor: 'pointer' }}>
                                {toggling === t.id ? '…' : t.is_active ? 'Active' : 'Inactive'}
                              </button>
                              <button
                                onClick={() => {
                                  if (editId === t.id) setEditId(null)
                                  else { setEditId(t.id); setEditForm({ name: t.name, modality: t.modality ?? '', body_part: t.body_part, price: String(t.price) }); setEditErr('') }
                                }}
                                className="p-1.5 rounded-lg flex-shrink-0"
                                style={{ background: editId === t.id ? '#CCFBF1' : '#F1F5F9', color: editId === t.id ? '#0D9488' : '#64748B',
                                  border: `1px solid ${editId === t.id ? '#99F6E4' : '#E2E8F0'}`, cursor: 'pointer' }}>
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            {editId === t.id && (
                              <div className="px-3 pb-3" style={{ background: '#F8FAFC' }}>
                                <ScanFormPanel
                                  form={editForm} err={editErr} saving={editSaving}
                                  title={`Editing: ${t.name}`} saveLabel="Save Changes"
                                  onSet={(f, v) => setEditForm(p => ({ ...p, [f]: v }))}
                                  onSave={submitEdit} onCancel={() => setEditId(null)} />
                              </div>
                            )}
                          </Fragment>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          ADD FROM MASTER TAB — modality filter + grouped by body_part
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'master' && (
        <>
          <p className="text-xs mb-3" style={{ color: '#64748B' }}>
            Set a group price and activate all procedures at once, or set individual prices per procedure.
          </p>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-44">
              <Search className="absolute left-3 top-2.5 w-4 h-4" style={{ color: '#94A3B8' }} />
              <input value={masterQuery} onChange={e => setMasterQuery(e.target.value)}
                placeholder="Search procedures…"
                className={`${inp} pl-9`} style={bdr} />
            </div>
            <Select value={masterMod} onChange={e => setMasterMod(e.target.value)} className="w-44">
              <option value="">All modalities</option>
              {MODALITIES.map(m => {
                const count = masterTests.filter(t => t.modality === m.value).length
                if (count === 0) return null
                return <option key={m.value} value={m.value}>{m.label} ({count})</option>
              })}
            </Select>
          </div>

          {masterLoading ? (
            <p className="text-sm text-center py-10" style={{ color: '#94A3B8' }}>Loading master catalog…</p>
          ) : filteredMaster.length === 0 ? (
            <p className="text-sm text-center py-10" style={{ color: '#94A3B8' }}>
              {masterQuery || masterMod ? 'No procedures match.' : 'All master procedures are already in your catalog.'}
            </p>
          ) : (
            <div className="space-y-2" style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 4 }}>
              {masterGroupNames.map(bp => {
                const group = masterGroups[bp]
                const expanded = masterExpanded.has(bp)
                const isBusy = activatingGroup === bp
                const modalities = [...new Set(group.map(m => m.modality))]
                const singleMod = modalities.length === 1 ? modalities[0] : null
                const mc = singleMod ? (MODALITY_COLOR[singleMod] ?? { bg: '#F1F5F9', color: '#64748B' }) : null

                return (
                  <div key={bp} className="rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
                    <div className="flex items-center gap-2 px-3 py-2.5"
                      style={{ background: '#F8FAFC', borderBottom: expanded ? '1px solid #E2E8F0' : 'none' }}>
                      <button onClick={() => toggleMasterGroup(bp)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                        {expanded
                          ? <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: '#64748B' }} />
                          : <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: '#64748B' }} />}
                        {mc && !masterMod && (
                          <span className="px-2 py-0.5 rounded-md text-xs font-medium flex-shrink-0"
                            style={{ background: mc.bg, color: mc.color }}>
                            {MODALITY_LABEL[singleMod!] ?? singleMod}
                          </span>
                        )}
                        <span className="text-sm font-semibold truncate" style={{ color: '#0F172A' }}>{bp}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                          style={{ background: '#E2E8F0', color: '#64748B' }}>
                          {group.length}
                        </span>
                      </button>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div>
                          <input type="number" min={0} step="0.01"
                            value={groupPrices[bp] ?? ''}
                            onChange={e => setGroupPrices(prev => ({ ...prev, [bp]: e.target.value }))}
                            placeholder="Group ₹"
                            className="w-24 px-2 py-1.5 rounded-lg text-xs border font-semibold"
                            style={{ borderColor: masterErrors[`group_${bp}`] ? '#DC2626' : '#0D9488', color: '#0D9488', background: '#fff' }} />
                          {masterErrors[`group_${bp}`] && (
                            <p className="text-xs mt-0.5" style={{ color: '#DC2626' }}>{masterErrors[`group_${bp}`]}</p>
                          )}
                        </div>
                        <button
                          onClick={() => handleActivateGroup(bp)}
                          disabled={isBusy}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap"
                          style={{ background: isBusy ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: isBusy ? 'not-allowed' : 'pointer' }}>
                          {isBusy ? 'Adding…' : 'Activate All'}
                        </button>
                      </div>
                    </div>

                    {expanded && (
                      <div>
                        {group.map(m => (
                          <div key={m.id} className="flex items-center gap-3 px-4 py-2.5"
                            style={{ borderBottom: '1px solid #F8FAFC', background: '#fff' }}>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate" style={{ color: '#0F172A' }}>{m.name}</p>
                              {masterErrors[m.id] && (
                                <p className="text-xs mt-0.5" style={{ color: '#DC2626' }}>{masterErrors[m.id]}</p>
                              )}
                            </div>
                            <input type="number" min={0} step="0.01"
                              value={priceInputs[m.id] ?? groupPrices[m.body_part] ?? ''}
                              onChange={e => {
                                setPriceInputs(prev => ({ ...prev, [m.id]: e.target.value }))
                                if (masterErrors[m.id]) setMasterErrors(prev => ({ ...prev, [m.id]: '' }))
                              }}
                              placeholder="₹"
                              className="w-20 px-2 py-1.5 rounded-lg text-xs border text-right font-semibold flex-shrink-0"
                              style={{ borderColor: masterErrors[m.id] ? '#DC2626' : '#CBD5E1', color: '#0D9488', background: '#fff' }} />
                            <button
                              onClick={() => handleActivate(m)}
                              disabled={activating === m.id}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0"
                              style={{ background: activating === m.id ? '#94A3B8' : '#F0FDFA', color: activating === m.id ? '#fff' : '#0D9488',
                                border: '1px solid #99F6E4', cursor: activating === m.id ? 'not-allowed' : 'pointer' }}>
                              {activating === m.id ? '…' : 'Activate'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          CUSTOM PROCEDURE TAB
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'custom' && (
        <>
          <p className="text-xs mb-4" style={{ color: '#64748B' }}>
            Add a procedure not in the master catalog — specific packages, in-house protocols, or anything unique to your department.
          </p>
          <ScanFormPanel
            form={customForm} err={customErr} saving={customSaving}
            title="New Custom Procedure" saveLabel="Add to Catalog"
            onSet={(f, v) => setCustomForm(p => ({ ...p, [f]: v }))}
            onSave={submitCustom} onCancel={() => { setCustomForm(BLANK); setCustomErr('') }} />
        </>
      )}
    </Modal>
  )
}

// ─── Shared scan add/edit form ─────────────────────────────────────────────────

interface ScanFormPanelProps {
  form: ScanFormData; err: string; saving: boolean
  title: string; saveLabel: string
  onSet: (f: string, v: string) => void
  onSave: () => void; onCancel: () => void
}

function ScanFormPanel({ form, err, saving, title, saveLabel, onSet, onSave, onCancel }: ScanFormPanelProps) {
  const accent = '#0D9488'
  const inp = 'w-full px-3 py-2 rounded-lg text-sm border'
  const bdr = { borderColor: '#E2E8F0', color: '#0F172A', background: '#fff' }

  return (
    <div className="mt-2 p-4 rounded-xl space-y-3"
      style={{ background: 'rgba(13,148,136,0.03)', border: '1px solid rgba(13,148,136,0.2)' }}>
      <p className="text-xs font-semibold" style={{ color: accent }}>{title}</p>

      {err && (
        <p className="text-xs px-3 py-1.5 rounded-lg"
          style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
          {err}
        </p>
      )}

      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: '#64748B' }}>Procedure Name *</label>
        <input value={form.name} onChange={e => onSet('name', e.target.value)}
          className={inp} style={bdr} placeholder="e.g. CT Brain Plain" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: '#64748B' }}>Modality</label>
          <Select value={form.modality} onChange={e => { onSet('modality', e.target.value); onSet('body_part', '') }}>
            <option value="">— Select —</option>
            {[
              { value: 'xray',          label: 'X-Ray' },
              { value: 'ct',            label: 'CT Scan' },
              { value: 'mri',           label: 'MRI' },
              { value: 'usg',           label: 'Ultrasound' },
              { value: 'echo',          label: 'Echocardiography' },
              { value: 'mammography',   label: 'Mammography' },
              { value: 'fluoroscopy',   label: 'Fluoroscopy' },
              { value: 'nuclear',       label: 'Nuclear Medicine' },
              { value: 'pet',           label: 'PET Scan' },
              { value: 'dexa',          label: 'DEXA Scan' },
              { value: 'angiography',   label: 'Angiography' },
              { value: 'interventional', label: 'Interventional' },
              { value: 'dental',        label: 'Dental Imaging' },
              { value: 'ophthalmic',    label: 'Ophthalmic' },
              { value: 'special',       label: 'Special' },
            ].map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: '#64748B' }}>Group / Body Part</label>
          {form.modality ? (
            <Select
              value={form.body_part}
              onChange={e => onSet('body_part', e.target.value)}>
              <option value="">— Select group —</option>
              {(MODALITY_BODY_PARTS[form.modality] ?? []).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          ) : (
            <Select disabled value="">
              <option value="">— Select modality first —</option>
            </Select>
          )}
        </div>
      </div>

      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: accent }}>Price (₹) *</label>
        <input type="number" min={0} step="0.01" value={form.price} onChange={e => onSet('price', e.target.value)}
          className={inp}
          style={{ borderColor: accent, color: accent, background: '#fff', fontWeight: 600 }}
          placeholder="500" />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ background: '#F1F5F9', color: '#64748B', border: 'none', cursor: 'pointer' }}>
          Cancel
        </button>
        <button onClick={onSave} disabled={saving}
          className="px-4 py-1.5 rounded-lg text-xs font-semibold"
          style={{ background: saving ? '#94A3B8' : accent, color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}>
          {saving ? 'Saving…' : saveLabel}
        </button>
      </div>
    </div>
  )
}
