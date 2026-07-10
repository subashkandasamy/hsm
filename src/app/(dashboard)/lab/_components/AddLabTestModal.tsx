'use client'

import { useState, useEffect, useRef, Fragment } from 'react'
import { Plus, Search, Pencil, Globe, FlaskConical, ChevronDown, ChevronRight } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { createLabTest, updateLabTest, listAllLabCatalog, listLabMaster, activateFromMaster } from '@/app/actions/lab'
import type { LabTestCatalog, LabTestMaster } from '@/lib/types'

interface Props { open: boolean; onClose: () => void }

const SAMPLE_TYPES = ['Blood', 'Urine', 'Swab', 'Stool', 'CSF', 'Tissue', 'Sputum', 'Other']

type TestForm = {
  name: string; code: string; sample_type: string; unit: string
  ref_low: string; ref_high: string; reference_range: string; price: string
}
const BLANK: TestForm = { name: '', code: '', sample_type: '', unit: '', ref_low: '', ref_high: '', reference_range: '', price: '' }

function parseNum(s: string): number | null { const n = parseFloat(s); return isNaN(n) ? null : n }
function testToForm(t: LabTestCatalog): TestForm {
  return { name: t.name, code: t.code ?? '', sample_type: t.sample_type ?? '', unit: t.unit ?? '',
    ref_low: t.ref_low != null ? String(t.ref_low) : '', ref_high: t.ref_high != null ? String(t.ref_high) : '',
    reference_range: t.reference_range ?? '', price: String(t.price) }
}
function formToPayload(f: TestForm) {
  return { name: f.name.trim(), code: f.code.trim() || null, sample_type: f.sample_type.toLowerCase() || null,
    unit: f.unit.trim() || null, ref_low: parseNum(f.ref_low), ref_high: parseNum(f.ref_high),
    reference_range: f.reference_range.trim() || null, price: parseFloat(f.price) || 0 }
}
function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item); (acc[k] ??= []).push(item); return acc
  }, {})
}

type Tab = 'catalog' | 'master' | 'custom'

export default function AddLabTestModal({ open, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('catalog')
  const catalogFetched = useRef(false)
  const masterFetched  = useRef(false)

  // ── Catalog tab ──────────────────────────────────────────────────────────────
  const [tests, setTests]           = useState<LabTestCatalog[]>([])
  const [loading, setLoading]       = useState(false)
  const [catQuery, setCatQuery]     = useState('')
  const [catExpanded, setCatExpanded] = useState<Set<string>>(new Set())
  const [editId, setEditId]         = useState<string | null>(null)
  const [editForm, setEditForm]     = useState<TestForm>(BLANK)
  const [editErr, setEditErr]       = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [toggling, setToggling]     = useState<string | null>(null)

  // ── Master tab ───────────────────────────────────────────────────────────────
  const [masterTests, setMasterTests]     = useState<LabTestMaster[]>([])
  const [masterLoading, setMasterLoading] = useState(false)
  const [masterQuery, setMasterQuery]     = useState('')
  const [masterExpanded, setMasterExpanded] = useState<Set<string>>(new Set())
  const [activating, setActivating]       = useState<string | null>(null)   // single test id
  const [activatingGroup, setActivatingGroup] = useState<string | null>(null) // category
  const [priceInputs, setPriceInputs]     = useState<Record<string, string>>({}) // testId → price
  const [groupPrices, setGroupPrices]     = useState<Record<string, string>>({}) // category → default price
  const [masterErrors, setMasterErrors]   = useState<Record<string, string>>({})

  // ── Custom tab ───────────────────────────────────────────────────────────────
  const [customForm, setCustomForm]     = useState<TestForm>(BLANK)
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
    const data = await listAllLabCatalog()
    setTests(data)
    setCatExpanded(prev => {
      if (prev.size > 0) return prev
      return new Set(data.map(t => t.category))
    })
    setLoading(false)
  }

  async function loadMaster() {
    setMasterLoading(true)
    const [masterList, catalogList] = await Promise.all([listLabMaster(), listAllLabCatalog()])
    const activatedIds = new Set(catalogList.map(t => t.lab_master_id).filter(Boolean))
    const available = masterList.filter(m => !activatedIds.has(m.id))
    setMasterTests(available)
    setMasterExpanded(prev => {
      if (prev.size > 0) return prev
      return new Set(available.map(m => m.category))
    })
    setMasterLoading(false)
  }

  // ── Catalog helpers ──────────────────────────────────────────────────────────

  const filteredCatalog = catQuery.trim()
    ? tests.filter(t => t.name.toLowerCase().includes(catQuery.toLowerCase()) ||
        (t.code ?? '').toLowerCase().includes(catQuery.toLowerCase()))
    : tests

  const catalogGroups = groupBy(filteredCatalog, t => t.category)
  const catalogGroupNames = Object.keys(catalogGroups).sort()

  function toggleCatGroup(cat: string) {
    setCatExpanded(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n })
  }

  async function submitEdit() {
    if (!editId || !editForm.name.trim()) { setEditErr('Name is required'); return }
    if (!editForm.price) { setEditErr('Price is required'); return }
    setEditSaving(true); setEditErr('')
    const res = await updateLabTest(editId, formToPayload(editForm))
    setEditSaving(false)
    if (!res.success) { setEditErr(res.error); return }
    const payload = formToPayload(editForm)
    setTests(prev => prev.map(t => t.id === editId ? { ...t, ...payload } : t))
    setEditId(null)
  }

  async function toggleActive(t: LabTestCatalog) {
    setToggling(t.id)
    await updateLabTest(t.id, { is_active: !t.is_active })
    setTests(prev => prev.map(item => item.id === t.id ? { ...item, is_active: !t.is_active } : item))
    setToggling(null)
  }

  async function toggleGroupActive(cat: string, makeActive: boolean) {
    const group = catalogGroups[cat] ?? []
    await Promise.all(group.map(t => updateLabTest(t.id, { is_active: makeActive })))
    setTests(prev => prev.map(t => t.category === cat ? { ...t, is_active: makeActive } : t))
  }

  // ── Master helpers ───────────────────────────────────────────────────────────

  const filteredMaster = masterQuery.trim()
    ? masterTests.filter(m => m.name.toLowerCase().includes(masterQuery.toLowerCase()) ||
        (m.code ?? '').toLowerCase().includes(masterQuery.toLowerCase()))
    : masterTests

  const masterGroups = groupBy(filteredMaster, m => m.category)
  const masterGroupNames = Object.keys(masterGroups).sort()

  function toggleMasterGroup(cat: string) {
    setMasterExpanded(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n })
  }

  function getTestPrice(testId: string, category: string): string {
    return priceInputs[testId] ?? groupPrices[category] ?? ''
  }

  async function handleActivate(master: LabTestMaster) {
    const priceStr = getTestPrice(master.id, master.category)
    const price = parseFloat(priceStr)
    if (isNaN(price) || price < 0) {
      setMasterErrors(prev => ({ ...prev, [master.id]: 'Enter a valid price' })); return
    }
    setMasterErrors(prev => ({ ...prev, [master.id]: '' }))
    setActivating(master.id)
    const res = await activateFromMaster(master.id, price)
    setActivating(null)
    if (!res.success) { setMasterErrors(prev => ({ ...prev, [master.id]: res.error })); return }
    setMasterTests(prev => prev.filter(m => m.id !== master.id))
    catalogFetched.current = false  // so switching to My Catalog tab reloads it
  }

  async function handleActivateGroup(cat: string) {
    const group = masterGroups[cat] ?? []
    const groupPrice = parseFloat(groupPrices[cat] ?? '')
    if (isNaN(groupPrice) || groupPrice < 0) {
      setMasterErrors(prev => ({ ...prev, [`group_${cat}`]: 'Set a group price first' })); return
    }
    setMasterErrors(prev => { const n = { ...prev }; delete n[`group_${cat}`]; return n })
    setActivatingGroup(cat)

    await Promise.allSettled(
      group.map(m => {
        const individualPrice = priceInputs[m.id] ? parseFloat(priceInputs[m.id]) : groupPrice
        return activateFromMaster(m.id, isNaN(individualPrice) ? groupPrice : individualPrice)
      })
    )
    setMasterTests(prev => prev.filter(m => m.category !== cat))
    setActivatingGroup(null)
    catalogFetched.current = false  // so switching to My Catalog tab reloads it
  }

  // ── Custom ───────────────────────────────────────────────────────────────────

  async function submitCustom() {
    if (!customForm.name.trim()) { setCustomErr('Name is required'); return }
    if (!customForm.price) { setCustomErr('Price is required'); return }
    setCustomSaving(true); setCustomErr('')
    const res = await createLabTest(formToPayload(customForm))
    setCustomSaving(false)
    if (!res.success) { setCustomErr(res.error); return }
    setCustomForm(BLANK)
    catalogFetched.current = false  // force fresh load on catalog tab
    setTab('catalog')
  }

  // ── UI helpers ────────────────────────────────────────────────────────────────

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'catalog', label: `My Catalog (${tests.length})`, icon: <FlaskConical className="w-3.5 h-3.5" /> },
    { key: 'master',  label: 'Add from Master',              icon: <Globe className="w-3.5 h-3.5" /> },
    { key: 'custom',  label: 'Custom Test',                  icon: <Plus className="w-3.5 h-3.5" /> },
  ]

  const inp = 'w-full px-3 py-2 rounded-xl text-sm border'
  const bdr = { borderColor: '#E2E8F0', color: '#0F172A', background: '#fff' }

  return (
    <Modal open={open} onClose={onClose} title="Lab Test Catalog" maxWidth="72rem">
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
          MY CATALOG TAB — grouped view
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'catalog' && (
        <>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-2.5 w-4 h-4" style={{ color: '#94A3B8' }} />
            <input value={catQuery} onChange={e => setCatQuery(e.target.value)}
              placeholder="Search by name or code…"
              className={`${inp} pl-9`} style={bdr} />
          </div>

          {loading ? (
            <p className="text-sm text-center py-10" style={{ color: '#94A3B8' }}>Loading catalog…</p>
          ) : filteredCatalog.length === 0 ? (
            <p className="text-sm text-center py-10" style={{ color: '#94A3B8' }}>
              {catQuery ? 'No tests match.' : 'No tests yet — add from Master or create a Custom test.'}
            </p>
          ) : (
            <div className="space-y-2" style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 4 }}>
              {catalogGroupNames.map(cat => {
                const group = catalogGroups[cat]
                const activeCount = group.filter(t => t.is_active).length
                const expanded = catExpanded.has(cat)
                const allActive = activeCount === group.length

                return (
                  <div key={cat} className="rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
                    {/* Group header */}
                    <div className="flex items-center gap-3 px-3 py-2.5"
                      style={{ background: '#F8FAFC', borderBottom: expanded ? '1px solid #E2E8F0' : 'none' }}>
                      <button onClick={() => toggleCatGroup(cat)} className="flex items-center gap-2 flex-1 text-left">
                        {expanded ? <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: '#64748B' }} />
                          : <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: '#64748B' }} />}
                        <span className="text-sm font-semibold" style={{ color: '#0F172A' }}>{cat}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: '#E2E8F0', color: '#64748B' }}>
                          {activeCount} / {group.length} active
                        </span>
                      </button>
                      <button
                        onClick={() => toggleGroupActive(cat, !allActive)}
                        className="px-3 py-1 rounded-lg text-xs font-semibold"
                        style={allActive
                          ? { background: '#FEF3C7', color: '#92400E', border: 'none', cursor: 'pointer' }
                          : { background: '#DCFCE7', color: '#15803D', border: 'none', cursor: 'pointer' }}>
                        {allActive ? 'Disable All' : 'Enable All'}
                      </button>
                    </div>

                    {/* Tests */}
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
                                  {t.lab_master_id && (
                                    <span className="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0"
                                      style={{ background: '#EFF6FF', color: '#3B82F6', fontWeight: 500 }}>Global</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 mt-0.5 text-xs" style={{ color: '#94A3B8' }}>
                                  {t.code && <span className="font-mono">{t.code}</span>}
                                  {t.sample_type && <span className="capitalize">{t.sample_type}</span>}
                                  {(t.reference_range ?? (t.ref_low != null || t.ref_high != null)) && (
                                    <span>{t.reference_range ?? `${t.ref_low ?? '?'} – ${t.ref_high ?? '?'}`}</span>
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
                                onClick={() => { if (editId === t.id) setEditId(null); else { setEditId(t.id); setEditForm(testToForm(t)); setEditErr('') } }}
                                className="p-1.5 rounded-lg flex-shrink-0"
                                style={{ background: editId === t.id ? '#CCFBF1' : '#F1F5F9', color: editId === t.id ? '#0D9488' : '#64748B',
                                  border: `1px solid ${editId === t.id ? '#99F6E4' : '#E2E8F0'}`, cursor: 'pointer' }}>
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            {editId === t.id && (
                              <div className="px-3 pb-3" style={{ background: '#F8FAFC' }}>
                                <TestForm form={editForm} err={editErr} saving={editSaving} accent="#0D9488"
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
          ADD FROM MASTER TAB — grouped view
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'master' && (
        <>
          <p className="text-xs mb-4" style={{ color: '#64748B' }}>
            Tests are grouped by category. Set a group price and activate all at once, or set individual prices per test.
          </p>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-2.5 w-4 h-4" style={{ color: '#94A3B8' }} />
            <input value={masterQuery} onChange={e => setMasterQuery(e.target.value)}
              placeholder="Search master tests…"
              className={`${inp} pl-9`} style={bdr} />
          </div>

          {masterLoading ? (
            <p className="text-sm text-center py-10" style={{ color: '#94A3B8' }}>Loading master tests…</p>
          ) : filteredMaster.length === 0 ? (
            <p className="text-sm text-center py-10" style={{ color: '#94A3B8' }}>
              {masterQuery ? 'No tests match.' : 'All master tests are already in your catalog.'}
            </p>
          ) : (
            <div className="space-y-2" style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 4 }}>
              {masterGroupNames.map(cat => {
                const group = masterGroups[cat]
                const expanded = masterExpanded.has(cat)
                const isActivatingThis = activatingGroup === cat

                return (
                  <div key={cat} className="rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
                    {/* Group header */}
                    <div className="flex items-center gap-2 px-3 py-2.5"
                      style={{ background: '#F8FAFC', borderBottom: expanded ? '1px solid #E2E8F0' : 'none' }}>
                      <button onClick={() => toggleMasterGroup(cat)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                        {expanded ? <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: '#64748B' }} />
                          : <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: '#64748B' }} />}
                        <span className="text-sm font-semibold truncate" style={{ color: '#0F172A' }}>{cat}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                          style={{ background: '#E2E8F0', color: '#64748B' }}>
                          {group.length} tests
                        </span>
                      </button>

                      {/* Group price + Activate All */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div>
                          <input type="number" min={0} step="0.01"
                            value={groupPrices[cat] ?? ''}
                            onChange={e => setGroupPrices(prev => ({ ...prev, [cat]: e.target.value }))}
                            placeholder="Group ₹"
                            className="w-24 px-2 py-1.5 rounded-lg text-xs border font-semibold"
                            style={{ borderColor: masterErrors[`group_${cat}`] ? '#DC2626' : '#0D9488', color: '#0D9488', background: '#fff' }} />
                          {masterErrors[`group_${cat}`] && (
                            <p className="text-xs mt-0.5" style={{ color: '#DC2626' }}>{masterErrors[`group_${cat}`]}</p>
                          )}
                        </div>
                        <button
                          onClick={() => handleActivateGroup(cat)}
                          disabled={isActivatingThis}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap"
                          style={{ background: isActivatingThis ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: isActivatingThis ? 'not-allowed' : 'pointer' }}>
                          {isActivatingThis ? 'Adding…' : 'Activate All'}
                        </button>
                      </div>
                    </div>

                    {/* Individual tests */}
                    {expanded && (
                      <div>
                        {group.map(m => (
                          <div key={m.id} className="flex items-center gap-3 px-4 py-2"
                            style={{ borderBottom: '1px solid #F8FAFC', background: '#fff' }}>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate" style={{ color: '#0F172A' }}>{m.name}</p>
                              <div className="flex items-center gap-3 mt-0.5 text-xs" style={{ color: '#94A3B8' }}>
                                {m.code && <span className="font-mono">{m.code}</span>}
                                {m.sample_type && <span className="capitalize">{m.sample_type}</span>}
                                {m.unit && <span>{m.unit}</span>}
                                {m.reference_range && <span className="truncate max-w-xs">{m.reference_range}</span>}
                              </div>
                              {masterErrors[m.id] && (
                                <p className="text-xs mt-0.5" style={{ color: '#DC2626' }}>{masterErrors[m.id]}</p>
                              )}
                            </div>
                            <input type="number" min={0} step="0.01"
                              value={priceInputs[m.id] ?? groupPrices[cat] ?? ''}
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
          CUSTOM TEST TAB
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'custom' && (
        <>
          <p className="text-xs mb-4" style={{ color: '#64748B' }}>
            Create a test not in the master catalog — specific panels, in-house tests, or anything unique to your lab.
          </p>
          <TestForm form={customForm} err={customErr} saving={customSaving} accent="#0D9488"
            title="New Custom Test" saveLabel="Add to Catalog"
            onSet={(f, v) => setCustomForm(p => ({ ...p, [f]: v }))}
            onSave={submitCustom} onCancel={() => { setCustomForm(BLANK); setCustomErr('') }} />
        </>
      )}
    </Modal>
  )
}

// ─── Shared edit form ─────────────────────────────────────────────────────────

interface FormProps {
  form: TestForm; err: string; saving: boolean
  accent: string; title: string; saveLabel: string
  onSet: (f: string, v: string) => void
  onSave: () => void; onCancel: () => void
}

function TestForm({ form, err, saving, accent, title, saveLabel, onSet, onSave, onCancel }: FormProps) {
  const inp = 'w-full px-3 py-2 rounded-lg text-sm border'
  const bdr = { borderColor: '#E2E8F0', color: '#0F172A', background: '#fff' }

  return (
    <div className="mt-2 p-4 rounded-xl space-y-3"
      style={{ background: `color-mix(in srgb, ${accent} 4%, white)`, border: `1px solid color-mix(in srgb, ${accent} 25%, transparent)` }}>
      <p className="text-xs font-semibold" style={{ color: accent }}>{title}</p>
      {err && <p className="text-xs px-3 py-1.5 rounded-lg" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{err}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="sm:col-span-2">
          <label className="text-xs font-medium block mb-1" style={{ color: '#64748B' }}>Test Name *</label>
          <input value={form.name} onChange={e => onSet('name', e.target.value)} className={inp} style={bdr} placeholder="e.g. Complete Blood Count" />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: '#64748B' }}>Code</label>
          <input value={form.code} onChange={e => onSet('code', e.target.value)} className={inp} style={bdr} placeholder="CBC" />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: '#64748B' }}>Sample</label>
          <select value={form.sample_type} onChange={e => onSet('sample_type', e.target.value)} className={inp} style={{ ...bdr, paddingRight: '8px' }}>
            <option value="">—</option>
            {SAMPLE_TYPES.map(s => <option key={s} value={s.toLowerCase()}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: '#64748B' }}>Unit</label>
          <input value={form.unit} onChange={e => onSet('unit', e.target.value)} className={inp} style={bdr} placeholder="mg/dL" />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: '#64748B' }}>Ref Low</label>
          <input type="number" step="any" value={form.ref_low} onChange={e => onSet('ref_low', e.target.value)} className={inp} style={bdr} placeholder="70" />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: '#64748B' }}>Ref High</label>
          <input type="number" step="any" value={form.ref_high} onChange={e => onSet('ref_high', e.target.value)} className={inp} style={bdr} placeholder="110" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: '#64748B' }}>Reference Range (report display)</label>
          <input value={form.reference_range} onChange={e => onSet('reference_range', e.target.value)} className={inp} style={bdr} placeholder="70–110 mg/dL" />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: accent }}>Price (₹) *</label>
          <input type="number" min={0} step="0.01" value={form.price} onChange={e => onSet('price', e.target.value)}
            className={inp} style={{ borderColor: accent, color: accent, background: '#fff', fontWeight: 600 }} placeholder="150" />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ background: '#F1F5F9', color: '#64748B', border: 'none', cursor: 'pointer' }}>Cancel</button>
        <button onClick={onSave} disabled={saving} className="px-4 py-1.5 rounded-lg text-xs font-semibold"
          style={{ background: saving ? '#94A3B8' : accent, color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}>
          {saving ? 'Saving…' : saveLabel}
        </button>
      </div>
    </div>
  )
}
