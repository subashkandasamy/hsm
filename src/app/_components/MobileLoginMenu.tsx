'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { ChevronDown, User, Building2 } from 'lucide-react'

const T = '#0D9488'
const S2 = '#E2E8F0'
const S5 = '#64748B'
const S6 = '#475569'
const S9 = '#0F172A'

// Mobile-only auth dropdown. Desktop shows the two login links inline (they are
// hidden on mobile), so on small screens this collapses both into one menu.
export default function MobileLoginMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div className="relative sm:hidden" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-sm font-medium px-2 py-2 rounded-xl"
        style={{ color: T }}>
        Login
        <ChevronDown className="w-4 h-4" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 rounded-2xl overflow-hidden"
          style={{ background: '#fff', border: `1px solid ${S2}`, boxShadow: '0 12px 32px rgba(15,23,42,0.12)' }}>
          <a href="https://my.uyirly.com" role="menuitem"
            className="flex items-start gap-3 px-4 py-3"
            style={{ borderBottom: `1px solid ${S2}` }}>
            <User className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: T }} />
            <span>
              <span className="block text-sm font-semibold" style={{ color: S9 }}>Patient login</span>
              <span className="block text-xs" style={{ color: S5 }}>View records &amp; book appointments</span>
            </span>
          </a>
          <Link href="/find-hospital" role="menuitem" onClick={() => setOpen(false)}
            className="flex items-start gap-3 px-4 py-3">
            <Building2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: S6 }} />
            <span>
              <span className="block text-sm font-semibold" style={{ color: S9 }}>Staff sign in</span>
              <span className="block text-xs" style={{ color: S5 }}>Log in to your hospital</span>
            </span>
          </Link>
        </div>
      )}
    </div>
  )
}
