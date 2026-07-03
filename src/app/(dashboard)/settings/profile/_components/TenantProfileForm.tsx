'use client'

import { useState, useRef } from 'react'
import { upsertTenantProfile, uploadTenantLogo } from '@/app/actions/tenantProfile'
import type { TenantProfile } from '@/lib/types'
import GlassCard from '@/components/ui/GlassCard'

type Field = { key: keyof Omit<TenantProfile, 'tenant_id' | 'updated_at' | 'logo_url'>; label: string; placeholder?: string }

const SECTIONS: { title: string; fields: Field[] }[] = [
  {
    title: 'Hospital Identity',
    fields: [
      { key: 'name',     label: 'Hospital Name',  placeholder: 'e.g. Kovai Medical Center and Hospital' },
      { key: 'tagline',  label: 'Tagline',         placeholder: 'e.g. NABH Accredited Hospital' },
      { key: 'tagline2', label: 'Sub-tagline',     placeholder: 'e.g. Excellence in Healthcare' },
    ],
  },
  {
    title: 'Address',
    fields: [
      { key: 'address_line1', label: 'Address Line 1', placeholder: '99, Avanashi Road' },
      { key: 'address_line2', label: 'Address Line 2', placeholder: 'Area / Landmark (optional)' },
      { key: 'city',          label: 'City',            placeholder: 'Coimbatore' },
      { key: 'state',         label: 'State',           placeholder: 'Tamil Nadu' },
      { key: 'pincode',       label: 'Pincode',         placeholder: '641 014' },
    ],
  },
  {
    title: 'Contact',
    fields: [
      { key: 'phone1',   label: 'Phone 1',  placeholder: '0422-4323800' },
      { key: 'phone2',   label: 'Phone 2',  placeholder: '0422-4324000 (optional)' },
      { key: 'email',    label: 'Email',    placeholder: 'billing@hospital.com' },
      { key: 'website',  label: 'Website',  placeholder: 'www.hospital.com' },
      { key: 'emergency_contact', label: 'Emergency Helpline', placeholder: '0422-2627999, 4323999' },
    ],
  },
  {
    title: 'Legal / Registration',
    fields: [
      { key: 'cin_no', label: 'CIN / Reg. No.', placeholder: 'L85110TZ1985PLC001659' },
      { key: 'gst_no', label: 'GST Number',      placeholder: '33AABCK1234A1Z5 (optional)' },
    ],
  },
]

type FormValues = Record<string, string>

function initValues(profile: TenantProfile | null): FormValues {
  const keys: (keyof TenantProfile)[] = [
    'name', 'tagline', 'tagline2',
    'address_line1', 'address_line2', 'city', 'state', 'pincode',
    'phone1', 'phone2', 'email', 'website', 'emergency_contact',
    'cin_no', 'gst_no',
  ]
  const out: FormValues = {}
  for (const k of keys) out[k] = (profile?.[k] as string | null) ?? ''
  return out
}

export default function TenantProfileForm({ initialProfile }: { initialProfile: TenantProfile | null }) {
  const [values, setValues] = useState<FormValues>(initValues(initialProfile))
  const [logoUrl, setLogoUrl] = useState<string | null>(initialProfile?.logo_url ?? null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function set(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }))
    setSaveMsg(null)
  }

  async function handleSave() {
    setSaving(true)
    setSaveMsg(null)
    const input = Object.fromEntries(
      Object.entries(values).map(([k, v]) => [k, v.trim() || null])
    ) as Parameters<typeof upsertTenantProfile>[0]
    const res = await upsertTenantProfile(input)
    setSaving(false)
    setSaveMsg(res.success ? { ok: true, text: 'Profile saved.' } : { ok: false, text: res.error })
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoPreview(URL.createObjectURL(file))
    setUploading(true)
    setUploadMsg(null)
    const fd = new FormData()
    fd.append('logo', file)
    const res = await uploadTenantLogo(fd)
    setUploading(false)
    if (res.success) {
      setLogoUrl(res.url)
      setUploadMsg('Logo uploaded.')
    } else {
      setLogoPreview(null)
      setUploadMsg(res.error)
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  const displayLogo = logoPreview ?? logoUrl

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Logo section */}
      <GlassCard className="p-6">
        <p className="text-sm font-semibold mb-4" style={{ color: '#0F172A' }}>Hospital Logo</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
          {/* Preview */}
          <div style={{
            width: '120px', height: '80px', borderRadius: '12px', overflow: 'hidden',
            border: '1px solid #E2E8F0', background: '#F8FAFC',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {displayLogo
              ? <img src={displayLogo} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              : <span style={{ fontSize: '11px', color: '#94A3B8' }}>No logo</span>
            }
          </div>
          <div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleLogoChange} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer', opacity: uploading ? 0.6 : 1 }}>
              {uploading ? 'Uploading…' : displayLogo ? 'Replace Logo' : 'Upload Logo'}
            </button>
            <p className="text-xs mt-2" style={{ color: '#94A3B8' }}>PNG, JPG or WebP · Max 2 MB</p>
            {uploadMsg && (
              <p className="text-xs mt-1" style={{ color: uploadMsg === 'Logo uploaded.' ? '#10B981' : '#DC2626' }}>
                {uploadMsg}
              </p>
            )}
          </div>
        </div>
      </GlassCard>

      {/* Form sections */}
      {SECTIONS.map((section) => (
        <GlassCard key={section.title} className="p-6">
          <p className="text-sm font-semibold mb-4" style={{ color: '#0F172A' }}>{section.title}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
            {section.fields.map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#475569' }}>{label}</label>
                <input
                  type="text"
                  value={values[key] ?? ''}
                  placeholder={placeholder}
                  onChange={(e) => set(key, e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm"
                  style={{
                    background: 'rgba(255,255,255,0.8)',
                    border: '1px solid #E2E8F0',
                    color: '#0F172A',
                    outline: 'none',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}
                />
              </div>
            ))}
          </div>
        </GlassCard>
      ))}

      {/* Save bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', paddingBottom: '32px' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold"
          style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving…' : 'Save Profile'}
        </button>
        {saveMsg && (
          <span className="text-sm" style={{ color: saveMsg.ok ? '#10B981' : '#DC2626' }}>
            {saveMsg.text}
          </span>
        )}
      </div>
    </div>
  )
}
