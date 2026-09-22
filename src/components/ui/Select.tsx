'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import React from 'react'
import type { SelectHTMLAttributes } from 'react'

interface OptionData { value: string; label: string }

// Flatten an <option>'s children into plain text. Options are frequently built
// from multiple JSX nodes (e.g. {name} · ₹{price}) — React represents that as
// an array, and naively calling String() on an array joins it with commas
// ("Acme, · ,123"). Recurse and join with '' instead.
function childrenToText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(childrenToText).join('')
  if (React.isValidElement(node)) {
    const p = node.props as { children?: React.ReactNode }
    return childrenToText(p.children)
  }
  return ''
}

function extractOptions(children: React.ReactNode): OptionData[] {
  const opts: OptionData[] = []
  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child) && child.type === 'option') {
      const p = child.props as { value?: unknown; children?: React.ReactNode }
      const text = childrenToText(p.children)
      opts.push({
        value: String(p.value ?? ''),
        label: text || String(p.value ?? ''),
      })
    }
  })
  return opts
}

interface DropdownRect { top: number; left: number; width: number; maxBottom: number }

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  hasError?: boolean
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void
}

export default function Select({ id, value, onChange, children, hasError, required, disabled, style, className }: SelectProps) {
  const [open, setOpen] = useState(false)
  const [dropRect, setDropRect] = useState<DropdownRect | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const options = extractOptions(children)
  const selected = options.find((o) => o.value === String(value ?? ''))

  function calcRect(): DropdownRect | null {
    if (!triggerRef.current) return null
    const r = triggerRef.current.getBoundingClientRect()
    return {
      top: r.bottom + 4,
      left: r.left,
      width: r.width,
      maxBottom: window.innerHeight - 8,
    }
  }

  function openDropdown() {
    if (disabled) return
    const rect = calcRect()
    setDropRect(rect)
    setOpen(true)
  }

  // Sync position on scroll / resize while open
  useEffect(() => {
    if (!open) return
    function update() { setDropRect(calcRect()) }
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        listRef.current && !listRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  function handleSelect(val: string) {
    onChange?.({ target: { value: val } } as React.ChangeEvent<HTMLSelectElement>)
    setOpen(false)
  }

  // Compute whether to open up or down
  const listMaxHeight = 224 // 14rem
  const openUpward = dropRect
    ? dropRect.top + listMaxHeight > dropRect.maxBottom
    : false

  return (
    <div className={`relative ${className ?? ''}`}>
      {/* Visible trigger. `id` is carried through so a FormField's htmlFor
          reaches the control and clicking the label focuses it. */}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={openDropdown}
        style={{
          width: '100%',
          minHeight: '44px',
          padding: '0.625rem 2.5rem 0.625rem 0.875rem',
          borderRadius: '0.75rem',
          fontSize: '0.875rem',
          background: disabled ? 'rgba(248,250,252,0.85)' : 'rgba(255,255,255,0.85)',
          border: `1px solid ${hasError ? '#DC2626' : open ? '#0D9488' : '#E2E8F0'}`,
          color: selected && selected.value !== '' ? '#0F172A' : '#94A3B8',
          boxShadow: open ? '0 0 0 3px rgba(13,148,136,0.1)' : 'none',
          transition: 'border-color 0.15s, box-shadow 0.15s',
          cursor: disabled ? 'not-allowed' : 'pointer',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          outline: 'none',
          position: 'relative',
          ...style,
        }}
      >
        <span className="truncate flex-1">
          {selected && selected.value !== '' ? selected.label : selected?.label ?? 'Select…'}
        </span>
        <ChevronDown
          className="w-4 h-4 flex-shrink-0 absolute right-3 top-1/2 -translate-y-1/2"
          style={{
            color: '#94A3B8',
            transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`,
            transition: 'transform 0.2s',
          }}
        />
      </button>

      {/* Options list — position:fixed breaks out of any overflow:auto clipping */}
      {open && dropRect && (
        <ul
          ref={listRef}
          style={{
            position: 'fixed',
            zIndex: 9999,
            left: dropRect.left,
            width: dropRect.width,
            ...(openUpward
              ? { bottom: window.innerHeight - dropRect.top + 8 + 4, top: 'auto' }
              : { top: dropRect.top }),
            maxHeight: `${listMaxHeight}px`,
            overflowY: 'auto',
            background: 'rgba(255,255,255,0.98)',
            border: '1px solid #E2E8F0',
            borderRadius: '0.75rem',
            boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
          }}
        >
          {options.map((opt) => {
            const isSelected = opt.value === String(value ?? '')
            return (
              <li key={opt.value}>
                <button
                  type="button"
                  onMouseDown={() => handleSelect(opt.value)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm"
                  style={{
                    background: isSelected ? 'rgba(13,148,136,0.08)' : 'transparent',
                    color: opt.value === '' ? '#94A3B8' : '#0F172A',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    minHeight: '44px',
                  }}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'rgba(13,148,136,0.04)' }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && opt.value !== '' && (
                    <Check className="w-4 h-4 flex-shrink-0 ml-2" style={{ color: '#0D9488' }} />
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/* Hidden native select — form required validation only, never interactable */}
      <select
        value={value}
        required={required}
        disabled={disabled}
        onChange={onChange}
        tabIndex={-1}
        aria-hidden="true"
        style={{
          position: 'absolute', left: '-9999px', top: 'auto',
          width: '1px', height: '1px', opacity: 0,
          overflow: 'hidden', pointerEvents: 'none',
        }}
      >
        {children}
      </select>
    </div>
  )
}
