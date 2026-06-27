'use client'

import { useState, useTransition } from 'react'
import { Save, CheckCircle } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import { updateEnabledModules } from '@/app/actions/tenantSettings'
import type { ModuleKey } from '@/app/actions/tenantSettings'

const ALL_MODULES: { key: ModuleKey; label: string; description: string }[] = [
  { key: 'ipd',       label: 'IPD (Inpatient)',     description: 'Ward board, bed management, admissions, and progress notes.' },
  { key: 'emergency', label: 'Emergency',           description: 'Emergency case registration and triage workflow.' },
  { key: 'lab',       label: 'Laboratory',          description: 'Lab test catalog, orders, and result reporting.' },
  { key: 'radiology', label: 'Radiology',           description: 'Radiology catalog, scan orders, and report uploads.' },
  { key: 'pharmacy',  label: 'Pharmacy',            description: 'Drug inventory, batch management, and dispensing.' },
  { key: 'ot',        label: 'Operation Theatre',   description: 'OT room management, surgery scheduling, consumables.' },
  { key: 'bloodbank', label: 'Blood Bank',          description: 'Donor registry, blood unit inventory, and issue workflow.' },
  { key: 'insurance', label: 'Insurance',           description: 'Insurance policy management and claims lifecycle.' },
  { key: 'inventory', label: 'Inventory & Stores',  description: 'Non-drug inventory, purchase orders, and stock movements.' },
  { key: 'hr',        label: 'Staff & HR',          description: 'Staff attendance, duty roster, and HR records.' },
]

interface Props {
  initialEnabled: ModuleKey[]
}

export default function ModuleVisibility({ initialEnabled }: Props) {
  const [enabled, setEnabled] = useState<Set<ModuleKey>>(new Set(initialEnabled))
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function toggle(key: ModuleKey) {
    setSaved(false)
    setEnabled((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function handleSave() {
    setError('')
    setSaved(false)
    startTransition(async () => {
      const res = await updateEnabledModules({ modules: Array.from(enabled) })
      if (!res.success) { setError(res.error); return }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    })
  }

  return (
    <div className="max-w-2xl space-y-4">
      <GlassCard className="divide-y" style={{ '--divide-color': '#F1F5F9' } as React.CSSProperties}>
        {ALL_MODULES.map(({ key, label, description }) => (
          <label
            key={key}
            className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50/60 transition-colors"
          >
            {/* Toggle switch */}
            <button
              type="button"
              role="switch"
              aria-checked={enabled.has(key)}
              onClick={() => toggle(key)}
              className="relative flex-shrink-0 w-10 h-6 rounded-full transition-colors duration-200"
              style={{
                background: enabled.has(key) ? '#0D9488' : '#CBD5E1',
                border: 'none', cursor: 'pointer',
              }}
            >
              <span
                className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"
                style={{ transform: enabled.has(key) ? 'translateX(16px)' : 'translateX(0)' }}
              />
            </button>
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{label}</p>
              <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>{description}</p>
            </div>
            <span
              className="ml-auto flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full"
              style={enabled.has(key)
                ? { background: '#CCFBF1', color: '#0D9488' }
                : { background: '#F1F5F9', color: '#94A3B8' }}
            >
              {enabled.has(key) ? 'On' : 'Off'}
            </span>
          </label>
        ))}
      </GlassCard>

      {error && (
        <p className="text-sm px-1" style={{ color: '#DC2626' }}>{error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold"
          style={{
            background: saved ? '#DCFCE7' : '#0D9488',
            color: saved ? '#15803D' : '#fff',
            border: 'none', cursor: isPending ? 'not-allowed' : 'pointer',
            minHeight: '40px',
          }}
        >
          {saved
            ? <><CheckCircle className="w-4 h-4" /> Saved!</>
            : <><Save className="w-4 h-4" /> {isPending ? 'Saving…' : 'Save Changes'}</>
          }
        </button>
        <p className="text-xs" style={{ color: '#94A3B8' }}>
          Changes apply immediately for all users in this tenant.
        </p>
      </div>
    </div>
  )
}
