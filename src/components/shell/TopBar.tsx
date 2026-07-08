'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, User, Menu } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Role } from '@/lib/types'
import ScanInput from '@/components/barcode/ScanInput'

const ROLE_LABELS: Record<Role, string> = {
  admin:        'Administrator',
  doctor:       'Doctor',
  nurse:        'Nurse',
  receptionist: 'Receptionist',
  lab_tech:     'Lab Technician',
  pharmacist:   'Pharmacist',
  accountant:   'Accountant',
}

interface TopBarProps {
  fullName: string
  role: Role
  tenantName: string
  onMenuClick?: () => void
}

export default function TopBar({ fullName, role, tenantName, onMenuClick }: TopBarProps) {
  const router = useRouter()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownOpen])

  return (
    <header className="glass-topbar fixed top-0 left-0 lg:left-60 right-0 z-30"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="h-14 flex items-center justify-between px-4 md:px-6">
      {/* Left: hamburger on mobile + scan input on desktop */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden w-9 h-9 flex items-center justify-center rounded-xl"
          style={{ color: '#64748B' }}
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        {/* Short title on mobile only */}
        <span className="lg:hidden text-sm font-semibold" style={{ color: '#0F172A' }}>{tenantName}</span>
        {/* Global barcode scan input — desktop only */}
        <div className="hidden lg:block">
          <ScanInput />
        </div>
      </div>

      {/* Right: user info + logout */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Desktop: full name + role + logout button */}
        <div className="hidden md:flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(13,148,136,0.1)', border: '1px solid rgba(13,148,136,0.2)' }}>
            <User className="w-4 h-4" style={{ color: '#0D9488' }} />
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold leading-tight" style={{ color: '#0F172A' }}>{fullName}</p>
            <span className="inline-block text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: 'rgba(13,148,136,0.1)', color: '#0D9488' }}>
              {ROLE_LABELS[role]}
            </span>
          </div>
        </div>

        <div className="hidden md:block w-px h-6" style={{ background: '#E2E8F0' }} />

        <button
          onClick={handleLogout}
          className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
          style={{ color: '#64748B', border: '1px solid transparent' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#FEE2E2'; e.currentTarget.style.color = '#DC2626'; e.currentTarget.style.borderColor = '#FECACA' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748B'; e.currentTarget.style.borderColor = 'transparent' }}
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>

        {/* Mobile: avatar dropdown */}
        <div className="md:hidden relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            className="flex items-center gap-1 w-9 h-9 rounded-full"
            style={{ background: 'rgba(13,148,136,0.1)', border: '1px solid rgba(13,148,136,0.2)' }}
            aria-label="User menu"
          >
            <User className="w-4 h-4 mx-auto" style={{ color: '#0D9488' }} />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-52 rounded-2xl shadow-lg z-50"
              style={{ background: 'rgba(255,255,255,0.98)', border: '1px solid #E2E8F0' }}>
              {/* User info */}
              <div className="px-4 py-3 border-b" style={{ borderColor: '#E2E8F0' }}>
                <p className="text-sm font-semibold truncate" style={{ color: '#0F172A' }}>{fullName}</p>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: 'rgba(13,148,136,0.1)', color: '#0D9488' }}>
                  {ROLE_LABELS[role]}
                </span>
              </div>
              {/* Logout */}
              <button onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium rounded-b-2xl"
                style={{ color: '#DC2626', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#FEE2E2' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
      </div>
    </header>
  )
}
