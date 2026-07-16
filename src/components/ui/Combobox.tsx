'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'

interface DropdownRect { top: number; left: number; width: number; maxBottom: number }

interface ComboboxProps {
  value: string
  onChange: (value: string) => void
  options: string[]
  placeholder?: string
  /** Allow entering a value not present in options (default true). */
  allowCustom?: boolean
  hasError?: boolean
  disabled?: boolean
  className?: string
  style?: React.CSSProperties
}

/**
 * Searchable, custom-styled dropdown that also accepts a free-typed value —
 * a styled replacement for a native <input list>/<datalist> combobox.
 * Matches the look of the app's <Select> component.
 */
export default function Combobox({
  value, onChange, options, placeholder = 'Search or type…',
  allowCustom = true, hasError, disabled, className, style,
}: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [dropRect, setDropRect] = useState<DropdownRect | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // When closed, the input shows the committed value; when open, the query.
  const shown = open ? query : value
  const filtered = query.trim()
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options

  function calcRect(): DropdownRect | null {
    if (!wrapRef.current) return null
    const r = wrapRef.current.getBoundingClientRect()
    return { top: r.bottom + 4, left: r.left, width: r.width, maxBottom: window.innerHeight - 8 }
  }

  function openDropdown() {
    if (disabled) return
    setQuery('')
    setDropRect(calcRect())
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const update = () => setDropRect(calcRect())
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update) }
  }, [open])

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node) &&
          listRef.current && !listRef.current.contains(e.target as Node)) {
        // commit free-typed value on outside click
        if (allowCustom && query.trim()) onChange(query.trim())
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, query, allowCustom, onChange])

  function pick(val: string) {
    onChange(val)
    setQuery('')
    setOpen(false)
  }

  const listMaxHeight = 224
  const openUpward = dropRect ? dropRect.top + listMaxHeight > dropRect.maxBottom : false

  return (
    <div ref={wrapRef} className={`relative ${className ?? ''}`}>
      <div
        onClick={() => { if (!open) { openDropdown(); setTimeout(() => inputRef.current?.focus(), 0) } }}
        style={{
          width: '100%', minHeight: '44px', padding: '0 2.5rem 0 0.875rem',
          borderRadius: '0.75rem', background: disabled ? 'rgba(248,250,252,0.85)' : 'rgba(255,255,255,0.85)',
          border: `1px solid ${hasError ? '#DC2626' : open ? '#0D9488' : '#E2E8F0'}`,
          boxShadow: open ? '0 0 0 3px rgba(13,148,136,0.1)' : 'none',
          transition: 'border-color 0.15s, box-shadow 0.15s',
          display: 'flex', alignItems: 'center', cursor: disabled ? 'not-allowed' : 'text',
          ...style,
        }}
      >
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          value={shown}
          placeholder={placeholder}
          onFocus={openDropdown}
          onChange={(e) => { setQuery(e.target.value); if (!open) setOpen(true); if (allowCustom) onChange(e.target.value) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); if (allowCustom && query.trim()) pick(query.trim()); else if (filtered[0]) pick(filtered[0]) }
            if (e.key === 'Escape') setOpen(false)
          }}
          style={{
            flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
            fontSize: '0.875rem', color: '#0F172A', minHeight: '42px',
          }}
        />
        <ChevronDown
          className="w-4 h-4 flex-shrink-0 absolute right-3 top-1/2"
          style={{ color: '#94A3B8', transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`, transition: 'transform 0.2s', pointerEvents: 'none' }}
        />
      </div>

      {open && dropRect && filtered.length > 0 && (
        <ul
          ref={listRef}
          style={{
            position: 'fixed', zIndex: 9999, left: dropRect.left, width: dropRect.width,
            ...(openUpward ? { bottom: window.innerHeight - dropRect.top + 8 + 4, top: 'auto' } : { top: dropRect.top }),
            maxHeight: `${listMaxHeight}px`, overflowY: 'auto',
            background: 'rgba(255,255,255,0.98)', border: '1px solid #E2E8F0',
            borderRadius: '0.75rem', boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
          }}
        >
          {filtered.map((opt) => {
            const isSelected = opt === value
            return (
              <li key={opt}>
                <button
                  type="button"
                  onMouseDown={() => pick(opt)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm"
                  style={{ background: isSelected ? 'rgba(13,148,136,0.08)' : 'transparent', color: '#0F172A', border: 'none', cursor: 'pointer', textAlign: 'left', minHeight: '44px' }}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'rgba(13,148,136,0.04)' }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                >
                  <span className="truncate">{opt}</span>
                  {isSelected && <Check className="w-4 h-4 flex-shrink-0 ml-2" style={{ color: '#0D9488' }} />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
