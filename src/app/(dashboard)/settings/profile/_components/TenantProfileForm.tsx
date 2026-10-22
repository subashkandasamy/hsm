'use client'

import { useState, useRef } from 'react'
import { upsertTenantProfile, uploadTenantLogo, setTenantCode } from '@/app/actions/tenantProfile'
import type { TenantProfile } from '@/lib/types'
import GlassCard from '@/components/ui/GlassCard'

// Client-side mirror of SQL tenant_doc_prefix() / server computePrefix().
function previewPrefix(code: string, slug: string): string {
  const src = code.trim() ? code : slug
  return (src.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()) || 'HOSP'
}

type Field = { key: keyof Omit<TenantProfile, 'tenant_id' | 'updated_at' | 'logo_url'>; label: string; placeholder?: string; type?: 'text' | 'date' }

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
      { key: 'blood_bank_license', label: 'Blood Bank Licence No.', placeholder: 'e.g. BB/TN/2024/00123 (optional)' },
    ],
  },
  {
    // Printed onto Form F and onto every monthly PC&PNDT return. The name on
    // the certificate is often not the trading name, and the form must carry
    // the registered one — so it is asked for separately rather than assumed.
    title: 'PC&PNDT (scan centre)',
    fields: [
      { key: 'pcpndt_reg_no', label: 'PC&PNDT Registration No.', placeholder: 'As printed on the certificate (optional)' },
      { key: 'pcpndt_registered_name', label: 'Registered Name', placeholder: 'The name on the PC&PNDT certificate' },
      { key: 'pcpndt_registered_address', label: 'Registered Address', placeholder: 'Address as registered under the Act' },
      { key: 'pcpndt_valid_upto', label: 'Valid Up To', type: 'date' },
      { key: 'pcpndt_reporting_person_name', label: 'Reporting Person', placeholder: 'Who signs the monthly return' },
      { key: 'pcpndt_reporting_person_phone', label: 'Reporting Person Phone', placeholder: '10-digit mobile' },
    ],
  },
]

type FormValues = Record<string, string>

function initValues(profile: TenantProfile | null): FormValues {
  const keys: (keyof TenantProfile)[] = [
    'name', 'tagline', 'tagline2',
    'address_line1', 'address_line2', 'city', 'state', 'pincode',
    'phone1', 'phone2', 'email', 'website', 'emergency_contact',
    'cin_no', 'gst_no', 'blood_bank_license',
    'pcpndt_reg_no', 'pcpndt_registered_name', 'pcpndt_registered_address',
    'pcpndt_valid_upto', 'pcpndt_reporting_person_name', 'pcpndt_reporting_person_phone',
  ]
  const out: FormValues = {}
  for (const k of keys) out[k] = (profile?.[k] as string | null) ?? ''
  return out
}

export default function TenantProfileForm({ initialProfile, initialCode }: {
  initialProfile: TenantProfile | null
  initialCode: { code: string | null; slug: string; prefix: string }
}) {
  const [values, setValues] = useState<FormValues>(initValues(initialProfile))
  const [logoUrl, setLogoUrl] = useState<string | null>(initialProfile?.logo_url ?? null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Hospital code (document-number prefix) — writes to tenants, so its own save.
  const [code, setCode] = useState<string>(initialCode.code ?? '')
  const [codeSaving, setCodeSaving] = useState(false)
  const [codeMsg, setCodeMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const effectivePrefix = previewPrefix(code, initialCode.slug)

  async function handleSaveCode() {
    setCodeSaving(true)
    setCodeMsg(null)
    const res = await setTenantCode(code)
    setCodeSaving(false)
    setCodeMsg(res.success ? { ok: true, text: 'Hospital code saved.' } : { ok: false, text: res.error })
  }

  // GST tax-invoice config (boolean + number, so kept out of the text-field map)
  const [gstEnabled, setGstEnabled]   = useState<boolean>(initialProfile?.gst_enabled ?? false)
  const [gstStateCode, setGstStateCode] = useState<string>(initialProfile?.gst_state_code ?? '')
  const [pharmacyRate, setPharmacyRate] = useState<string>(
    initialProfile?.pharmacy_default_gst_rate != null ? String(initialProfile.pharmacy_default_gst_rate) : '12'
  )

  function set(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }))
    setSaveMsg(null)
  }

  async function handleSave() {
    setSaving(true)
    setSaveMsg(null)
    const textInput = Object.fromEntries(
      Object.entries(values).map(([k, v]) => [k, v.trim() || null])
    )
    const input = {
      ...textInput,
      gst_enabled: gstEnabled,
      gst_state_code: gstStateCode.trim() || null,
      pharmacy_default_gst_rate: pharmacyRate.trim() ? Number(pharmacyRate) : 12,
    } as Parameters<typeof upsertTenantProfile>[0]
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

      {/* Hospital code / document-number prefix */}
      <GlassCard className="p-6">
        <p className="text-sm font-semibold mb-1" style={{ color: '#0F172A' }}>Hospital Code (ID prefix)</p>
        <p className="text-xs mb-4" style={{ color: '#64748B' }}>
          A short code that prefixes every new patient UHID, bill, estimate and credit note — so your numbers are
          distinct from other hospitals (useful across the patient app, exports and support). Existing numbers are
          unchanged; only new ones use it. Leave blank to fall back to your subdomain (<strong>{initialCode.slug || '—'}</strong>).
        </p>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ minWidth: '180px' }}>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#475569' }}>Code (2–8 letters/digits)</label>
            <input
              type="text"
              value={code}
              placeholder="e.g. CITY"
              maxLength={8}
              onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); setCodeMsg(null) }}
              className="w-full px-3 py-2.5 rounded-xl text-sm"
              style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none', letterSpacing: '1px', fontWeight: 600 }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}
            />
          </div>
          <div style={{ flex: 1, minWidth: '220px' }}>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#475569' }}>Preview</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontFamily: 'monospace', fontSize: '13px', color: '#0F766E' }}>
              <span style={{ background: '#F0FDF9', border: '1px solid #CCFBF1', borderRadius: '8px', padding: '6px 10px' }}>{effectivePrefix}-UH-2026-00005</span>
              <span style={{ background: '#F0FDF9', border: '1px solid #CCFBF1', borderRadius: '8px', padding: '6px 10px' }}>{effectivePrefix}-BILL-2026-00046</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '16px' }}>
          <button
            onClick={handleSaveCode}
            disabled={codeSaving}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer', opacity: codeSaving ? 0.6 : 1 }}>
            {codeSaving ? 'Saving…' : 'Save Code'}
          </button>
          {codeMsg && (
            <span className="text-sm" style={{ color: codeMsg.ok ? '#10B981' : '#DC2626' }}>{codeMsg.text}</span>
          )}
        </div>
      </GlassCard>

      {/* Form sections */}
      {SECTIONS.map((section) => (
        <GlassCard key={section.title} className="p-6">
          <p className="text-sm font-semibold mb-4" style={{ color: '#0F172A' }}>{section.title}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
            {section.fields.map(({ key, label, placeholder, type }) => (
              <div key={key}>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#475569' }}>{label}</label>
                <input
                  // A real date input, because this one is a date column: a
                  // mistyped string would otherwise reach Postgres and come
                  // back as a cast error nobody can act on.
                  type={type ?? 'text'}
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

      {/* GST / Tax invoice */}
      <GlassCard className="p-6">
        <p className="text-sm font-semibold mb-1" style={{ color: '#0F172A' }}>GST / Tax Invoice</p>
        <p className="text-xs mb-4" style={{ color: '#64748B' }}>
          Turn this on if your hospital is GST-registered. Bills then print as a GST <strong>Tax Invoice</strong> with
          per-item GST, CGST/SGST split and a tax summary. Healthcare services stay exempt; pharmacy is taxed on the
          MRP (GST-inclusive). Your GSTIN is set under <strong>Legal / Registration</strong> above.
        </p>

        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: gstEnabled ? '16px' : 0 }}>
          <input type="checkbox" checked={gstEnabled} onChange={(e) => { setGstEnabled(e.target.checked); setSaveMsg(null) }}
            style={{ width: '18px', height: '18px', accentColor: '#0D9488', cursor: 'pointer' }} />
          <span className="text-sm font-medium" style={{ color: '#0F172A' }}>Issue GST tax invoices</span>
        </label>

        {gstEnabled && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#475569' }}>State Code</label>
              <input type="text" value={gstStateCode} placeholder="e.g. 33 (Tamil Nadu)"
                onChange={(e) => { setGstStateCode(e.target.value); setSaveMsg(null) }}
                className="w-full px-3 py-2.5 rounded-xl text-sm"
                style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#475569' }}>Default Pharmacy GST %</label>
              <input type="number" min="0" max="28" step="1" value={pharmacyRate} placeholder="12"
                onChange={(e) => { setPharmacyRate(e.target.value); setSaveMsg(null) }}
                className="w-full px-3 py-2.5 rounded-xl text-sm"
                style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }} />
              <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>Fallback rate for medicines (each drug can override later).</p>
            </div>
          </div>
        )}
      </GlassCard>

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
