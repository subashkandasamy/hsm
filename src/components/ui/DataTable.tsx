'use client'

import { useState, useMemo } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown, Search, MoreHorizontal } from 'lucide-react'
import EmptyState from './EmptyState'

export interface Column<T> {
  key: keyof T | string
  header: string
  render?: (row: T) => React.ReactNode
  sortable?: boolean
  width?: string
  /** Hide this column in mobile card view (e.g. the primary field shown as headline) */
  mobileHidden?: boolean
}

interface DataTableProps<T extends Record<string, unknown>> {
  data: T[]
  columns: Column<T>[]
  pageSize?: number
  searchPlaceholder?: string
  searchKeys?: (keyof T)[]
  emptyTitle?: string
  emptyDescription?: string
  /** Index of the column to use as the card headline on mobile (default: 0) */
  mobilePrimaryCol?: number
}

type SortDir = 'asc' | 'desc' | null

export default function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  pageSize = 10,
  searchPlaceholder = 'Search…',
  searchKeys = [],
  emptyTitle,
  emptyDescription,
  mobilePrimaryCol = 0,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)
  const [page, setPage] = useState(1)
  const [openMenuRow, setOpenMenuRow] = useState<number | null>(null)

  const filtered = useMemo(() => {
    let rows = data
    if (search && searchKeys.length > 0) {
      const q = search.toLowerCase()
      rows = rows.filter((row) =>
        searchKeys.some((k) => String(row[k] ?? '').toLowerCase().includes(q))
      )
    }
    if (sortKey && sortDir) {
      rows = [...rows].sort((a, b) => {
        const av = String(a[sortKey as keyof T] ?? '')
        const bv = String(b[sortKey as keyof T] ?? '')
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      })
    }
    return rows
  }, [data, search, searchKeys, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)

  function toggleSort(key: string) {
    if (sortKey !== key) { setSortKey(key); setSortDir('asc') }
    else if (sortDir === 'asc') setSortDir('desc')
    else { setSortKey(null); setSortDir(null) }
    setPage(1)
  }

  function SortIcon({ col }: { col: Column<T> }) {
    if (!col.sortable) return null
    const key = col.key as string
    if (sortKey !== key) return <ChevronsUpDown className="w-3.5 h-3.5 ml-1 opacity-40" />
    if (sortDir === 'asc') return <ChevronUp className="w-3.5 h-3.5 ml-1" style={{ color: '#0D9488' }} />
    return <ChevronDown className="w-3.5 h-3.5 ml-1" style={{ color: '#0D9488' }} />
  }

  const primaryCol = columns[mobilePrimaryCol] ?? columns[0]
  // Secondary cols: all non-primary, non-hidden columns
  const secondaryCols = columns.filter((_, i) => i !== mobilePrimaryCol && !columns[i].mobileHidden)
  // Action columns tend to have no key value — those with a render but no meaningful string output
  const displayCols = secondaryCols

  const searchBar = searchKeys.length > 0 && (
    <div className="px-4 py-3 border-b" style={{ borderColor: '#E2E8F0' }}>
      <div className="relative w-full md:max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#94A3B8' }} />
        <input
          type="search"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg"
          style={{
            background: 'rgba(255,255,255,0.8)',
            border: '1px solid #E2E8F0',
            color: '#0F172A',
            outline: 'none',
            minHeight: '44px',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488' }}
          onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}
        />
      </div>
    </div>
  )

  const pagination = totalPages > 1 && (
    <div className="flex items-center justify-between px-4 py-3 border-t text-sm flex-wrap gap-2"
      style={{ borderColor: '#E2E8F0', color: '#64748B' }}>
      <span>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
      <div className="flex items-center gap-1 flex-wrap">
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
          <button key={p} onClick={() => setPage(p)}
            className="w-8 h-8 rounded-lg text-xs font-medium transition-all"
            style={p === page ? { background: '#0D9488', color: '#fff' } : { background: 'transparent', color: '#64748B' }}
            onMouseEnter={(e) => { if (p !== page) e.currentTarget.style.background = '#F1F5F9' }}
            onMouseLeave={(e) => { if (p !== page) e.currentTarget.style.background = 'transparent' }}>
            {p}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="glass-card overflow-hidden">
      {searchBar}

      {/* ── MOBILE CARD VIEW (< md) ── */}
      <div className="md:hidden">
        {paginated.length === 0 ? (
          <EmptyState title={emptyTitle} description={emptyDescription} />
        ) : (
          <div className="divide-y" style={{ borderColor: '#F1F5F9' }}>
            {paginated.map((row, i) => (
              <div key={i} className="px-4 py-3.5">
                {/* Primary headline */}
                <div className="font-semibold text-sm min-w-0 truncate mb-2" style={{ color: '#0F172A' }}>
                  {primaryCol.render ? primaryCol.render(row) : String(row[primaryCol.key as keyof T] ?? '—')}
                </div>
                {/* Secondary fields */}
                <dl className="space-y-1.5">
                  {displayCols.map((col) => {
                    const val = col.render ? col.render(row) : String(row[col.key as keyof T] ?? '—')
                    return (
                      <div key={col.key as string} className="flex items-start justify-between gap-3">
                        <dt className="text-xs flex-shrink-0" style={{ color: '#94A3B8' }}>{col.header}</dt>
                        <dd className="text-xs font-medium text-right min-w-0" style={{ color: '#475569' }}>
                          {val}
                        </dd>
                      </div>
                    )
                  })}
                </dl>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── DESKTOP TABLE VIEW (md+) ── */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'rgba(248,250,252,0.8)', borderBottom: '1px solid #E2E8F0' }}>
              {columns.map((col) => (
                <th key={col.key as string}
                  className="text-left px-4 py-3 font-semibold select-none"
                  style={{ color: '#475569', width: col.width }}
                  onClick={() => col.sortable && toggleSort(col.key as string)}>
                  <span className="inline-flex items-center" style={{ cursor: col.sortable ? 'pointer' : 'default' }}>
                    {col.header}
                    <SortIcon col={col} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <EmptyState title={emptyTitle} description={emptyDescription} />
                </td>
              </tr>
            ) : (
              paginated.map((row, i) => (
                <tr key={i}
                  style={{ borderBottom: i < paginated.length - 1 ? '1px solid #F1F5F9' : 'none' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(248,250,252,0.6)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                  {columns.map((col) => (
                    <td key={col.key as string} className="px-4 py-3" style={{ color: '#0F172A' }}>
                      {col.render ? col.render(row) : String(row[col.key as keyof T] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination}
    </div>
  )
}
