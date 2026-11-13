'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Check, ChevronDown, ChevronRight } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Money from '@/components/ui/Money'
import { createLabOrder } from '@/app/actions/lab'
import { listOrderablePackages, orderPackage } from '@/app/actions/packages'
import { searchPatients } from '@/app/actions/patients'
import type { LabTestCatalog, Patient, TestPackage } from '@/lib/types'
import PackagePicker from './PackagePicker'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: (orderId: string) => void
  catalog: LabTestCatalog[]
  prefill?: { patientId: string; patientName: string; visitId?: string }
}

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item); (acc[k] ??= []).push(item); return acc
  }, {})
}

export default function OrderLabModal({ open, onClose, onSuccess, catalog, prefill }: Props) {
  const [testSearch, setTestSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [patientQuery, setPatientQuery] = useState(prefill?.patientName ?? '')
  const [patientResults, setPatientResults] = useState<Patient[]>([])
  const [patient, setPatient] = useState<Pick<Patient, 'id' | 'full_name' | 'uhid'> | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Packages (0296): one per order, plus any extra tests.
  const [packages, setPackages] = useState<TestPackage[]>([])
  const [packageId, setPackageId] = useState<string | null>(null)
  const [removedNote, setRemovedNote] = useState('')
  const [doneNote, setDoneNote] = useState<{ text: string; orderId: string } | null>(null)

  useEffect(() => {
    if (!open) return
    listOrderablePackages().then(setPackages).catch(() => setPackages([]))
  }, [open])

  /** A closed window starts fresh next time, whatever it was showing. */
  function close() {
    setDoneNote(null); setPackageId(null); setRemovedNote('')
    onClose()
  }

  const pkg = packages.find((p) => p.id === packageId) ?? null
  const inPackage = new Set(pkg ? pkg.items.filter((i) => i.kind === 'lab').map((i) => i.test_id) : [])

  /** Choosing a package takes its tests off the separate list, so nothing is ordered twice. */
  function choosePackage(id: string | null) {
    setPackageId(id); setRemovedNote(''); setError(null)
    const chosen = packages.find((p) => p.id === id)
    if (!chosen) return
    const ids = new Set(chosen.items.filter((i) => i.kind === 'lab').map((i) => i.test_id))
    const dropped = catalog.filter((t) => selected.has(t.id) && ids.has(t.id)).map((t) => t.name)
    if (dropped.length) {
      setSelected((prev) => new Set([...prev].filter((x) => !ids.has(x))))
      setRemovedNote(`${dropped.join(', ')} ${dropped.length === 1 ? 'is' : 'are'} already in ${chosen.name}, so ${dropped.length === 1 ? 'it was' : 'they were'} taken off the separate list.`)
    }
  }

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setPatientResults([]); return }
    const r = await searchPatients(q)
    setPatientResults(r.slice(0, 8)); setShowDropdown(true)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => doSearch(patientQuery), 300)
    return () => clearTimeout(t)
  }, [patientQuery, doSearch])

  // Auto-expand all groups when catalog first loads
  useEffect(() => {
    if (catalog.length > 0) {
      const cats = [...new Set(catalog.map(t => t.category || 'General'))]
      setExpandedGroups(new Set(cats))
    }
  }, [catalog])

  const filteredCatalog = catalog.filter((t) =>
    testSearch === '' ||
    t.name.toLowerCase().includes(testSearch.toLowerCase()) ||
    (t.code ?? '').toLowerCase().includes(testSearch.toLowerCase()) ||
    (t.category ?? '').toLowerCase().includes(testSearch.toLowerCase())
  )

  const catalogGroups = groupBy(catalog, t => t.category || 'General')
  const groupNames = Object.keys(catalogGroups).sort()

  const total = catalog.filter((t) => selected.has(t.id)).reduce((s, t) => s + t.price, 0) + (pkg?.price ?? 0)

  /**
   * Tests that are already inside another selected test.
   *
   * A CBC reports haemoglobin, so ticking both CBC and Haemoglobin bills the
   * patient for the same measurement twice and gives the lab two ways to
   * disagree with itself. Real laboratories catch this at ordering; we did not,
   * so a doctor ticking the obvious pair was quietly overcharging.
   *
   * A warning, not a block — there are real reasons to repeat a measurement by
   * a different method, and the doctor is the one who knows.
   */
  const redundant = (() => {
    const picked = catalog.filter((t) => selected.has(t.id) && (t.analyte_ids?.length ?? 0) > 0)
    const out: Array<{ test: LabTestCatalog; insideOf: string }> = []
    for (const a of picked) {
      const mine = new Set(a.analyte_ids ?? [])
      const cover = picked.find((b) =>
        b.id !== a.id
        && (b.analyte_ids?.length ?? 0) > mine.size
        && [...mine].every((x) => b.analyte_ids?.includes(x)))
      if (cover) out.push({ test: a, insideOf: cover.name })
    }
    return out
  })()

  function toggleTest(id: string) {
    if (inPackage.has(id)) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleGroup(cat: string) {
    const group = (catalogGroups[cat] ?? []).filter(t => !inPackage.has(t.id))
    const allSelected = group.every(t => selected.has(t.id))
    setSelected(prev => {
      const next = new Set(prev)
      if (allSelected) group.forEach(t => next.delete(t.id))
      else group.forEach(t => next.add(t.id))
      return next
    })
    // Always expand the group when selecting from it
    if (!allSelected) setExpandedGroups(prev => new Set(prev).add(cat))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const patId = prefill?.patientId ?? patient?.id
    if (!patId) { setError('Please select a patient'); return }
    if (selected.size === 0 && !pkg) { setError('Choose a package or at least one test'); return }
    setLoading(true); setError(null)

    let orderId = ''
    const notes: string[] = []
    if (pkg) {
      const r = await orderPackage({ package_id: pkg.id, patient_id: patId, visit_id: prefill?.visitId ?? null })
      if (!r.success) { setLoading(false); setError(r.error); return }
      orderId = r.labOrderId ?? r.packageOrderId
      setPackageId(null)
      if (r.skipped.length) notes.push(`Left out for this patient: ${r.skipped.join(', ')}.`)
      if (r.keptBoth.length) notes.push(`The patient's sex is not recorded, so both ${r.keptBoth.join(' and ')} were ordered. Record it on the patient's details so next time only the right one is.`)
      if (r.radiologyOrderIds.length) notes.push('The scans are on the Radiology list.')
    }
    if (selected.size > 0) {
      const result = await createLabOrder({ patient_id: patId, visit_id: prefill?.visitId ?? null, test_ids: [...selected] })
      if (!result.success) {
        setLoading(false)
        setError(pkg ? `The package was ordered, but the extra tests were not: ${result.error}` : result.error)
        return
      }
      orderId = orderId || result.orderId
    }
    setLoading(false)
    setSelected(new Set()); setTestSearch(''); setRemovedNote('')
    if (notes.length) { setDoneNote({ text: notes.join(' '), orderId }); return }
    onSuccess(orderId)
  }

  const submitLabel = (() => {
    const tests = selected.size ? `${selected.size} test${selected.size === 1 ? '' : 's'}` : ''
    if (pkg && tests) return `Order package + ${tests}`
    if (pkg) return 'Order package'
    return `Order ${tests || 'tests'}`
  })()

  return (
    <Modal open={open} onClose={close} title="Order Lab Tests" maxWidth="40rem">
      {doneNote ? (
        <div className="space-y-4">
          <div className="rounded-xl px-4 py-3 text-sm" style={{ background: '#F0FDFA', color: '#0F172A', border: '1px solid #99F6E4' }}>
            <p className="font-semibold mb-1" style={{ color: '#0D9488' }}>Ordered</p>
            <p>{doneNote.text}</p>
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={() => { const id = doneNote.orderId; setDoneNote(null); onSuccess(id) }}
              className="px-5 py-2 rounded-xl text-sm font-semibold" style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
              Done
            </button>
          </div>
        </div>
      ) : (
      <form onSubmit={handleSubmit} className="space-y-4">
        {!prefill && (
          <FormField label="Patient" required>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#94A3B8' }} />
              <input type="text" value={patientQuery}
                onChange={(e) => { setPatientQuery(e.target.value); setPatient(null) }}
                placeholder="Search patient…"
                style={{ width: '100%', padding: '0.625rem 0.875rem 0.625rem 2.25rem', borderRadius: '0.75rem', fontSize: '0.875rem', background: 'rgba(255,255,255,0.85)', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none' }}
                onFocus={() => setShowDropdown(patientResults.length > 0)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)} />
              {showDropdown && patientResults.length > 0 && (
                <ul className="mt-1 md:absolute md:z-50 md:left-0 md:right-0 md:top-full rounded-xl overflow-hidden shadow-lg"
                  style={{ background: 'rgba(255,255,255,0.98)', border: '1px solid #E2E8F0', maxHeight: '12rem', overflowY: 'auto' }}>
                  {patientResults.map((p) => (
                    <li key={p.id}>
                      <button type="button"
                        onMouseDown={() => { setPatient(p); setPatientQuery(p.full_name); setShowDropdown(false) }}
                        className="w-full text-left px-4 py-2.5 text-sm"
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(13,148,136,0.06)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                        <span className="font-medium">{p.full_name}</span>
                        <span className="ml-2 font-mono text-xs" style={{ color: '#94A3B8' }}>{p.uhid}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </FormField>
        )}

        {prefill && (
          <div className="px-3 py-2 rounded-xl text-sm" style={{ background: 'rgba(13,148,136,0.07)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.2)' }}>
            Patient: {prefill.patientName}{prefill.visitId ? ' · From OPD visit' : ''}
          </div>
        )}

        <PackagePicker packages={packages} selectedId={packageId} onChange={choosePackage} />
        {removedNote && (
          <p className="text-xs rounded-xl px-3 py-2" style={{ background: '#F0FDFA', color: '#0F766E', border: '1px solid #99F6E4' }}>{removedNote}</p>
        )}

        {/* Test selector */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{packages.length ? 'Or add separate tests' : 'Select Tests'}</p>
            {(selected.size > 0 || pkg) && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: 'rgba(13,148,136,0.1)', color: '#0D9488' }}>
                {pkg ? 'Package' : ''}{pkg && selected.size ? ' + ' : ''}{selected.size ? `${selected.size} selected` : ''} · <Money amount={total} />
              </span>
            )}
          </div>
          {redundant.length > 0 && (
            <div className="mb-2 rounded-xl px-3 py-2 text-xs"
              style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>
              {redundant.map(({ test, insideOf }) => (
                <p key={test.id}>
                  <strong>{test.name}</strong> is already part of <strong>{insideOf}</strong> — the patient
                  will be billed for both.
                </p>
              ))}
            </div>
          )}
          <input type="search" value={testSearch}
            onChange={(e) => setTestSearch(e.target.value)}
            placeholder="Filter tests…"
            style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.75rem', fontSize: '0.75rem', background: 'rgba(255,255,255,0.85)', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none', marginBottom: '0.5rem' }} />
          <div style={{ maxHeight: '14rem', overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '0.75rem' }}>
            {catalog.length === 0 ? (
              <div className="text-center py-6 px-4">
                <p className="text-sm font-medium" style={{ color: '#64748B' }}>Lab catalog is empty</p>
                <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>An admin must add tests via the Catalog button on the Lab page before ordering.</p>
              </div>
            ) : testSearch ? (
              /* Flat list when searching */
              filteredCatalog.length === 0 ? (
                <p className="text-center py-4 text-sm" style={{ color: '#94A3B8' }}>No tests match your filter</p>
              ) : filteredCatalog.map((test, i) => (
                <TestRow key={test.id} test={test} selected={selected.has(test.id)}
                  onToggle={() => toggleTest(test.id)} inPackage={inPackage.has(test.id)}
                  border={i < filteredCatalog.length - 1} />
              ))
            ) : (
              /* Grouped view when not searching */
              groupNames.map(cat => {
                const group = catalogGroups[cat]
                const expanded = expandedGroups.has(cat)
                const selectedCount = group.filter(t => selected.has(t.id)).length
                const allSelected = selectedCount === group.length
                const someSelected = selectedCount > 0 && !allSelected
                return (
                  <div key={cat}>
                    <div className="flex items-center"
                      style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                      {/* Group checkbox */}
                      <button type="button" onClick={() => toggleGroup(cat)}
                        className="flex items-center justify-center flex-shrink-0 w-9 h-9"
                        style={{ cursor: 'pointer', background: 'none', border: 'none' }}>
                        <div className="w-4 h-4 rounded flex items-center justify-center"
                          style={{
                            background: allSelected ? '#0D9488' : someSelected ? 'rgba(13,148,136,0.15)' : '#F1F5F9',
                            border: `1.5px solid ${allSelected || someSelected ? '#0D9488' : '#CBD5E1'}`,
                          }}>
                          {allSelected && <Check className="w-2.5 h-2.5" style={{ color: '#fff' }} />}
                          {someSelected && <div className="w-2 h-0.5 rounded" style={{ background: '#0D9488' }} />}
                        </div>
                      </button>
                      {/* Expand/collapse + label */}
                      <button type="button"
                        onClick={() => setExpandedGroups(prev => {
                          const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n
                        })}
                        className="flex items-center gap-1.5 flex-1 min-w-0 py-2 pr-3 text-left"
                        style={{ cursor: 'pointer', background: 'none', border: 'none' }}>
                        {expanded
                          ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#64748B' }} />
                          : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#64748B' }} />}
                        <span className="text-xs font-semibold flex-1 truncate" style={{ color: '#0F172A' }}>{cat}</span>
                        <span className="text-xs flex-shrink-0 font-medium"
                          style={{ color: selectedCount > 0 ? '#0D9488' : '#94A3B8' }}>
                          {selectedCount > 0 ? `${selectedCount}/` : ''}{group.length}
                        </span>
                      </button>
                    </div>
                    {expanded && group.map((test, i) => (
                      <TestRow key={test.id} test={test} selected={selected.has(test.id)}
                        onToggle={() => toggleTest(test.id)} inPackage={inPackage.has(test.id)}
                        border={i < group.length - 1} indent />
                    ))}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {error && <div className="text-sm rounded-xl px-3 py-2" style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>}

        <div className="flex gap-3 justify-end pt-1">
          <button type="button" onClick={close} className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>Cancel</button>
          <button type="submit" disabled={loading || (selected.size === 0 && !pkg)}
            className="px-5 py-2 rounded-xl text-sm font-semibold"
            style={{ background: (loading || (selected.size === 0 && !pkg)) ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: (loading || (selected.size === 0 && !pkg)) ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Ordering…' : submitLabel}
          </button>
        </div>
      </form>
      )}
    </Modal>
  )
}

// ─── TestRow ─────────────────────────────────────────────────────────────────

function TestRow({ test, selected, onToggle, border, indent, inPackage }: {
  test: LabTestCatalog; selected: boolean; onToggle: () => void
  border: boolean; indent?: boolean
  /** Already in the chosen package — shown, but not orderable twice. */
  inPackage?: boolean
}) {
  return (
    <button type="button" onClick={onToggle} disabled={inPackage}
      className="w-full flex items-center justify-between"
      style={{
        padding: `0.625rem ${indent ? '1rem' : '0.75rem'} 0.625rem ${indent ? '1.5rem' : '0.75rem'}`,
        borderBottom: border ? '1px solid #F1F5F9' : 'none',
        background: selected ? 'rgba(13,148,136,0.07)' : 'transparent',
        cursor: inPackage ? 'default' : 'pointer', textAlign: 'left', opacity: inPackage ? 0.5 : 1,
      }}>
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-4 h-4 rounded-md flex-shrink-0 flex items-center justify-center"
          style={{ background: selected ? '#0D9488' : '#F1F5F9', border: `1px solid ${selected ? '#0D9488' : '#E2E8F0'}` }}>
          {selected && <Check className="w-3 h-3" style={{ color: '#fff' }} />}
        </div>
        <span className="text-sm font-medium truncate" style={{ color: '#0F172A' }}>{test.name}</span>
        {test.code && <span className="text-xs font-mono flex-shrink-0" style={{ color: '#94A3B8' }}>{test.code}</span>}
        {test.sample_type && (
          <span className="text-xs px-1.5 py-0 rounded flex-shrink-0" style={{ background: '#F1F5F9', color: '#64748B' }}>
            {test.sample_type}
          </span>
        )}
        {(test.analyte_count ?? 0) > 1 && (
          <span title={`This is a panel — it reports ${test.analyte_count} measurements`}
            className="text-xs px-1.5 py-0 rounded flex-shrink-0 font-medium"
            style={{ background: '#F0FDFA', color: '#0D9488', border: '1px solid #99F6E4' }}>
            {test.analyte_count} tests
          </span>
        )}
      </div>
      <span className="text-sm font-medium flex-shrink-0 ml-2" style={{ color: inPackage ? '#64748B' : '#0D9488' }}>
        {inPackage ? 'in package' : <Money amount={test.price} />}
      </span>
    </button>
  )
}
