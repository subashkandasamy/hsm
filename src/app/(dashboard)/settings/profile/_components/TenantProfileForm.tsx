'use client'

import { useState, useRef } from 'react'
import { upsertTenantProfile, uploadTenantLogo, setTenantCode } from '@/app/actions/tenantProfile'
import type { TenantProfile } from '@/lib/types'
import GlassCard from '@/components/ui/GlassCard'
import { isValidVpa } from '@/lib/upi'
import { LETTERHEAD_BOTTOM_MM, LETTERHEAD_DOCS, LETTERHEAD_TOP_MM } from '@/lib/pdf/letterhead'

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
    'upi_vpa', 'upi_payee_name',
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
  // Three mutually exclusive registrations, not two independent booleans: a
  // hospital cannot be both "charges GST" and "composition" at once, and a
  // composition dealer IS registered. Stored as two columns, chosen as one.
  const [gstMode, setGstMode] = useState<'none' | 'composition' | 'regular'>(
    initialProfile?.gst_composition ? 'composition' : initialProfile?.gst_enabled ? 'regular' : 'none',
  )
  const gstEnabled = gstMode === 'regular'
  const [gstStateCode, setGstStateCode] = useState<string>(initialProfile?.gst_state_code ?? '')
  const [pharmacyRate, setPharmacyRate] = useState<string>(
    initialProfile?.pharmacy_default_gst_rate != null ? String(initialProfile.pharmacy_default_gst_rate) : '12'
  )

  // Printing on the hospital's own letterhead paper (0307). Plain-paper
  // documents are stored, so every one is on letterhead unless unticked.
  const [lhOn, setLhOn] = useState(!!initialProfile?.letterhead_paper)
  const [lhTop, setLhTop] = useState(String(initialProfile?.letterhead_top_mm ?? LETTERHEAD_TOP_MM.default))
  const [lhBottom, setLhBottom] = useState(String(initialProfile?.letterhead_bottom_mm ?? LETTERHEAD_BOTTOM_MM.default))
  const [lhPlain, setLhPlain] = useState<string[]>(initialProfile?.letterhead_plain_docs ?? [])
  const mmErr = (v: string, r: { min: number; max: number }) =>
    /^\d{1,3}$/.test(v.trim()) && Number(v) >= r.min && Number(v) <= r.max ? null : `A whole number from ${r.min} to ${r.max}`
  const lhTopErr = mmErr(lhTop, LETTERHEAD_TOP_MM)
  const lhBottomErr = mmErr(lhBottom, LETTERHEAD_BOTTOM_MM)

  // Shown as you type, and mirrors the CHECK in migration 0233 so the form and
  // the database cannot disagree about what a UPI id looks like.
  const vpaBad = (values.upi_vpa ?? '').trim() !== '' && !isValidVpa(values.upi_vpa)

  function set(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }))
    setSaveMsg(null)
  }

  async function handleSave() {
    if (lhOn && (lhTopErr || lhBottomErr)) { setSaveMsg({ ok: false, text: 'Fix the letterhead space before saving.' }); return }
    setSaving(true)
    setSaveMsg(null)
    const textInput = Object.fromEntries(
      Object.entries(values).map(([k, v]) => [k, v.trim() || null])
    )
    const input = {
      ...textInput,
      gst_enabled: gstMode === 'regular',
      gst_composition: gstMode === 'composition',
      gst_state_code: gstStateCode.trim() || null,
      pharmacy_default_gst_rate: pharmacyRate.trim() ? Number(pharmacyRate) : 12,
      letterhead_paper: lhOn,
      // Kept as typed when the switch is off, unless unusable.
      letterhead_top_mm: lhTopErr ? LETTERHEAD_TOP_MM.default : Number(lhTop),
      letterhead_bottom_mm: lhBottomErr ? LETTERHEAD_BOTTOM_MM.default : Number(lhBottom),
      letterhead_plain_docs: lhPlain,
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

      {/* UPI collection — kept out of the plain field map so the warning about a
          mistyped id sits next to the box it is about. */}
      <GlassCard className="p-6">
        <p className="text-sm font-semibold mb-1" style={{ color: '#0F172A' }}>UPI Collection</p>
        <p className="text-xs mb-4" style={{ color: '#64748B' }}>
          Your hospital&rsquo;s own UPI id. Bills can then show a payment QR with the amount already filled in, on the
          counter display or on screen. Patients pay straight into this account &mdash; the money never passes through
          Uyirly.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#475569' }}>Hospital UPI ID</label>
            <input type="text" value={values.upi_vpa ?? ''} placeholder="hospital@okicici"
              onChange={(e) => set('upi_vpa', e.target.value.trim())}
              className="w-full px-3 py-2.5 rounded-xl text-sm"
              style={{
                background: 'rgba(255,255,255,0.8)', color: '#0F172A', outline: 'none',
                border: `1px solid ${vpaBad ? '#FCA5A5' : '#E2E8F0'}`,
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = vpaBad ? '#FCA5A5' : '#E2E8F0' }} />
            <p className="text-xs mt-1" style={{ color: vpaBad ? '#DC2626' : '#94A3B8' }}>
              {vpaBad
                ? 'That does not look like a UPI id — it should read something like hospital@okicici.'
                : 'Exactly as it appears in your UPI app.'}
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#475569' }}>Name shown to patients</label>
            <input type="text" value={values.upi_payee_name ?? ''} placeholder={values.name || 'Hospital name'}
              onChange={(e) => set('upi_payee_name', e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-sm"
              style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }} />
            <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>
              What the patient sees before confirming. Blank uses the hospital name.
            </p>
          </div>
        </div>

        {/* A wrong id pays a stranger and there is no way to recall it, so this
            is said plainly rather than left for someone to discover. */}
        <div className="text-xs mt-4 px-3 py-2.5 rounded-xl" style={{
          background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A', lineHeight: 1.5,
        }}>
          <strong>Check this before you use it.</strong> Every patient who scans a bill pays this exact id. If it is
          wrong, the money goes to whoever owns it and cannot be recalled. Send ₹1 to it yourself once and confirm it
          lands before taking a real payment.
        </div>
      </GlassCard>

      {/* GST / Tax invoice */}
      <GlassCard className="p-6">
        <p className="text-sm font-semibold mb-1" style={{ color: '#0F172A' }}>GST / Tax Invoice</p>
        <p className="text-xs mb-4" style={{ color: '#64748B' }}>
          How your hospital is registered decides what every bill is headed and whether tax can be charged at all.
          Your GSTIN is set under <strong>Legal / Registration</strong> above.
        </p>

        <div style={{ display: 'grid', gap: '10px', marginBottom: gstEnabled ? '16px' : 0 }}>
          {([
            {
              key: 'none' as const,
              title: 'Not GST-registered',
              body: <>Bills print as a plain <strong>Bill</strong>. No tax, no HSN, no tax summary.</>,
            },
            {
              key: 'composition' as const,
              title: 'Registered — composition scheme',
              body: <>
                You pay a flat percentage of turnover and <strong>may not collect GST from patients</strong>.
                Bills print as a <strong>Bill of Supply</strong> carrying the required declaration, and no tax is
                charged on any line even where a medicine has a GST rate against it.
              </>,
            },
            {
              key: 'regular' as const,
              title: 'Registered — charges GST',
              body: <>
                Bills print as a <strong>Tax Invoice</strong> with per-item GST, the CGST/SGST split and a rate-wise
                summary. Healthcare services stay exempt; pharmacy is taxed on the MRP (GST-inclusive).
              </>,
            },
          ]).map((o) => (
            <label key={o.key} style={{
              display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer',
              padding: '12px 14px', borderRadius: '12px',
              border: `1px solid ${gstMode === o.key ? '#0D9488' : '#E2E8F0'}`,
              background: gstMode === o.key ? 'rgba(13,148,136,0.05)' : 'rgba(255,255,255,0.6)',
            }}>
              <input type="radio" name="gst-mode" checked={gstMode === o.key}
                onChange={() => { setGstMode(o.key); setSaveMsg(null) }}
                style={{ width: '16px', height: '16px', marginTop: '2px', accentColor: '#0D9488', cursor: 'pointer' }} />
              <span>
                <span className="text-sm font-medium block" style={{ color: '#0F172A' }}>{o.title}</span>
                <span className="text-xs block mt-0.5" style={{ color: '#64748B' }}>{o.body}</span>
              </span>
            </label>
          ))}
        </div>

        {gstMode === 'composition' && (
          <p className="text-xs" style={{ color: '#B45309', marginTop: '12px' }}>
            Issuing a tax invoice under this scheme is the breach, not the compliance — so the tax columns and the
            CGST/SGST split are switched off for every bill, and cannot be re-enabled per medicine. Confirm the exact
            declaration wording with your accountant before your first bill goes out.
          </p>
        )}

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

      {/* Letterhead paper */}
      <GlassCard className="p-6">
        <p className="text-sm font-semibold mb-1" style={{ color: '#0F172A' }}>Printing on letterhead paper</p>
        <p className="text-xs mb-4" style={{ color: '#64748B' }}>
          Bills, reports and other A4 documents print your hospital&rsquo;s name, address and logo at the top. If your
          printers are loaded with paper that already has your letterhead on it, switch this on: the top of every page
          is left blank for it, and the patient&rsquo;s details start below.
        </p>

        <label style={{
          display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', padding: '12px 14px', borderRadius: '12px',
          border: `1px solid ${lhOn ? '#0D9488' : '#E2E8F0'}`, background: lhOn ? 'rgba(13,148,136,0.05)' : 'rgba(255,255,255,0.6)',
        }}>
          <input type="checkbox" checked={lhOn} onChange={(e) => { setLhOn(e.target.checked); setSaveMsg(null) }}
            style={{ width: '16px', height: '16px', marginTop: '2px', accentColor: '#0D9488', cursor: 'pointer' }} />
          <span>
            <span className="text-sm font-medium block" style={{ color: '#0F172A' }}>We print on our own letterhead paper</span>
            <span className="text-xs block mt-0.5" style={{ color: '#64748B' }}>Every page, on the documents ticked below.</span>
          </span>
        </label>

        {lhOn && (
          <div style={{ marginTop: '16px', display: 'grid', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
              {([
                { label: 'Blank space at the top (mm)', value: lhTop, set: setLhTop, err: lhTopErr,
                  hint: 'From the top edge of the paper to just below your printed header.' },
                { label: 'Blank space at the bottom (mm)', value: lhBottom, set: setLhBottom, err: lhBottomErr,
                  hint: 'For paper with a printed footer. 0 if there is none.' },
              ]).map((f) => (
                <div key={f.label}>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: '#475569' }}>{f.label}</label>
                  <input type="number" inputMode="numeric" min={0} step={1} value={f.value}
                    onChange={(e) => { f.set(e.target.value); setSaveMsg(null) }}
                    className="w-full px-3 py-2.5 rounded-xl text-sm"
                    style={{ background: 'rgba(255,255,255,0.8)', border: `1px solid ${f.err ? '#FCA5A5' : '#E2E8F0'}`, color: '#0F172A', outline: 'none' }} />
                  <p className="text-xs mt-1" style={{ color: f.err ? '#DC2626' : '#94A3B8' }}>{f.err ?? f.hint}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <a href={`/print/letterhead-test/pdf?top=${encodeURIComponent(lhTop)}&bottom=${encodeURIComponent(lhBottom)}`}
                target="_blank" rel="noopener noreferrer"
                aria-disabled={!!(lhTopErr || lhBottomErr)}
                onClick={(e) => { if (lhTopErr || lhBottomErr) e.preventDefault() }}
                className="px-4 py-2 rounded-xl text-sm font-medium"
                style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.25)', textDecoration: 'none', opacity: lhTopErr || lhBottomErr ? 0.5 : 1 }}>
                Print a test page
              </a>
              <span className="text-xs" style={{ color: '#64748B' }}>
                Print it on your letterhead paper: the shaded band should cover your printed header exactly.
              </span>
            </div>

            <div>
              <p className="text-xs font-medium mb-2" style={{ color: '#475569' }}>Documents printed on letterhead</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '6px 16px' }}>
                {LETTERHEAD_DOCS.map((d) => (
                  <label key={d.key} className="flex items-center gap-2 text-sm" style={{ color: '#0F172A', cursor: 'pointer' }}>
                    <input type="checkbox" checked={!lhPlain.includes(d.key)}
                      onChange={(e) => { setLhPlain((prev) => e.target.checked ? prev.filter((k) => k !== d.key) : [...prev, d.key]); setSaveMsg(null) }}
                      style={{ width: '15px', height: '15px', accentColor: '#0D9488', cursor: 'pointer' }} />
                    {d.label}
                  </label>
                ))}
              </div>
              <p className="text-xs mt-2" style={{ color: '#94A3B8' }}>
                Unticked documents keep printing your hospital header on plain paper. Not affected: ID cards, wristbands
                and labels (their own label paper), PC&amp;PNDT returns (government format), and the drug chart, OT list
                and ICU chart, which print sideways.
              </p>
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
