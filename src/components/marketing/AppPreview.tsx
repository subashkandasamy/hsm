import { IndianRupee, BedDouble, Users, FileText, Check } from 'lucide-react'

const TEAL = '#0D9488'
const SLATE9 = '#0F172A'
const SLATE6 = '#475569'
const SLATE5 = '#64748B'
const SLATE4 = '#94A3B8'
const BORDER = '#E2E8F0'

// On-brand HTML/CSS product previews that mirror the real Uyirly app UI, shown
// inside a small browser frame on marketing pages. Not photographs — faithful
// mockups using the app's own design tokens. Add a variant per screen.

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <figure className="my-6 rounded-xl overflow-hidden" style={{ border: `1px solid ${BORDER}`, background: '#F8FAFC' }}>
      {/* Browser chrome */}
      <div className="flex items-center gap-1.5 px-3 py-2" style={{ borderBottom: `1px solid ${BORDER}`, background: '#fff' }}>
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#FCA5A5' }} />
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#FDE68A' }} />
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#86EFAC' }} />
        <span className="ml-3 text-[11px] font-medium" style={{ color: SLATE4 }}>{label}</span>
      </div>
      <div className="p-4">{children}</div>
    </figure>
  )
}

function Kpi({ icon, label, value, sub, tone = SLATE9 }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(13,148,136,0.08)', color: TEAL }}>{icon}</span>
        <span className="text-[11px]" style={{ color: SLATE5 }}>{label}</span>
      </div>
      <p className="text-lg font-bold leading-none" style={{ color: tone }}>{value}</p>
      {sub && <p className="text-[10px] mt-1" style={{ color: SLATE4 }}>{sub}</p>}
    </div>
  )
}

function Dashboard() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
      <Kpi icon={<IndianRupee className="w-3.5 h-3.5" />} label="Today's Revenue" value="₹84,200" />
      <Kpi icon={<BedDouble className="w-3.5 h-3.5" />} label="Bed Occupancy" value="82%" sub="41 / 50 beds" />
      <Kpi icon={<Users className="w-3.5 h-3.5" />} label="Today's Footfall" value="63" sub="OPD + ER" />
      <Kpi icon={<FileText className="w-3.5 h-3.5" />} label="Pending Bills" value="₹1.6L" sub="12 bills" tone="#DC2626" />
    </div>
  )
}

function Bill() {
  const items = [
    ['Consultation — General Medicine', '₹500'],
    ['Room charges — Semi-private (2 days)', '₹4,000'],
    ['CBC + LFT (Lab)', '₹1,150'],
    ['Pharmacy — dispensed items', '₹1,860'],
    ['X-Ray Chest PA', '₹450'],
  ]
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
      <div className="flex items-center justify-between px-3 py-2.5" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <div>
          <p className="text-xs font-semibold" style={{ color: SLATE9 }}>Running bill · Rajesh Kumar</p>
          <p className="text-[10px]" style={{ color: SLATE4 }}>UH-2026-00042 · IPD</p>
        </div>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(13,148,136,0.1)', color: TEAL }}>Auto-updating</span>
      </div>
      <div className="divide-y" style={{ borderColor: '#F1F5F9' }}>
        {items.map(([name, amt], i) => (
          <div key={i} className="flex items-center justify-between px-3 py-2">
            <span className="text-xs" style={{ color: SLATE6 }}>{name}</span>
            <span className="text-xs font-medium tabular-nums" style={{ color: SLATE9 }}>{amt}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between px-3 py-2.5" style={{ background: '#F8FAFC', borderTop: `1px solid ${BORDER}` }}>
        <span className="text-xs font-semibold" style={{ color: SLATE9 }}>Total (ready at discharge)</span>
        <span className="text-sm font-bold tabular-nums" style={{ color: TEAL }}>₹7,960</span>
      </div>
    </div>
  )
}

function OpdQueue() {
  const rows = [
    ['1', 'Priya S', 'Done', true],
    ['2', 'Arun M', 'Done', true],
    ['3', 'Kavya R', 'In consultation', false],
    ['4', 'Suresh P', 'Waiting', false],
    ['5', 'Meena T', 'Waiting', false],
  ]
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
      <div className="px-3 py-2.5" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <p className="text-xs font-semibold" style={{ color: SLATE9 }}>OPD Token Queue · Dr. Anitha Kumar</p>
        <p className="text-[10px]" style={{ color: SLATE4 }}>General Medicine · Today</p>
      </div>
      <div className="divide-y" style={{ borderColor: '#F1F5F9' }}>
        {rows.map(([tok, name, status, done], i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2">
            <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold"
              style={{ background: done ? 'rgba(13,148,136,0.1)' : '#F1F5F9', color: done ? TEAL : SLATE5 }}>{tok}</span>
            <span className="text-xs flex-1" style={{ color: SLATE9 }}>{name}</span>
            <span className="text-[10px] font-medium flex items-center gap-1"
              style={{ color: done ? '#16A34A' : status === 'In consultation' ? TEAL : SLATE4 }}>
              {done && <Check className="w-3 h-3" />}{status}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function LabWorklist() {
  const rows = [
    ['LAB-2481', 'CBC', 'Priya S', 'Verified', '#16A34A'],
    ['LAB-2482', 'LFT', 'Arun M', 'In process', TEAL],
    ['LAB-2483', 'Lipid Profile', 'Kavya R', 'Collected', SLATE5],
    ['LAB-2484', 'Thyroid (T3 T4 TSH)', 'Suresh P', 'Pending', SLATE4],
  ]
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
      <div className="px-3 py-2.5" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <p className="text-xs font-semibold" style={{ color: SLATE9 }}>Lab worklist · Pathology</p>
        <p className="text-[10px]" style={{ color: SLATE4 }}>Samples tracked by barcode</p>
      </div>
      <div className="divide-y" style={{ borderColor: '#F1F5F9' }}>
        {rows.map(([id, test, name, status, color], i) => (
          <div key={i} className="flex items-center gap-2 px-3 py-2">
            <span className="text-[10px] font-mono font-semibold" style={{ color: TEAL, minWidth: 62 }}>{id}</span>
            <span className="text-xs flex-1" style={{ color: SLATE9 }}>{test}</span>
            <span className="text-[10px] hidden sm:inline" style={{ color: SLATE5 }}>{name}</span>
            <span className="text-[10px] font-medium" style={{ color, minWidth: 66, textAlign: 'right' }}>{status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PharmacyStock() {
  const rows = [
    ['Paracetamol 500mg', 'Tablet', '1,240', 'B2291 · exp 08/2027', false],
    ['Amoxicillin 500mg', 'Capsule', '86', 'B1180 · exp 03/2026', true],
    ['Pantoprazole 40mg', 'Tablet', '540', 'B7742 · exp 11/2026', false],
    ['ORS Sachet', 'Sachet', '22', 'B3310 · exp 01/2026', true],
  ]
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
      <div className="px-3 py-2.5 flex items-center justify-between" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <p className="text-xs font-semibold" style={{ color: SLATE9 }}>Pharmacy stock</p>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: '#FEF2F2', color: '#DC2626' }}>2 low / expiring</span>
      </div>
      <div className="divide-y" style={{ borderColor: '#F1F5F9' }}>
        {rows.map(([name, form, qty, batch, warn], i) => (
          <div key={i} className="flex items-center gap-2 px-3 py-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate" style={{ color: SLATE9 }}>{name}</p>
              <p className="text-[10px]" style={{ color: SLATE4 }}>{form} · {batch}</p>
            </div>
            <span className="text-xs font-semibold tabular-nums" style={{ color: warn ? '#DC2626' : SLATE9 }}>{qty}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SimpleList({ title, sub, rows }: { title: string; sub: string; rows: [string, string, string, string][] }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
      <div className="px-3 py-2.5" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <p className="text-xs font-semibold" style={{ color: SLATE9 }}>{title}</p>
        <p className="text-[10px]" style={{ color: SLATE4 }}>{sub}</p>
      </div>
      <div className="divide-y" style={{ borderColor: '#F1F5F9' }}>
        {rows.map(([a, b, c, color], i) => (
          <div key={i} className="flex items-center gap-2 px-3 py-2">
            <span className="text-xs flex-1 truncate" style={{ color: SLATE9 }}>{a}</span>
            <span className="text-[10px] hidden sm:inline" style={{ color: SLATE5 }}>{b}</span>
            <span className="text-[10px] font-medium" style={{ color: color || SLATE5, minWidth: 74, textAlign: 'right' }}>{c}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const VARIANTS: Record<string, { label: string; el: React.ReactNode }> = {
  dashboard: { label: 'uyirly.com · Dashboard', el: <Dashboard /> },
  bill: { label: 'uyirly.com · Billing', el: <Bill /> },
  opd: { label: 'uyirly.com · OPD Queue', el: <OpdQueue /> },
  lab: { label: 'uyirly.com · Laboratory', el: <LabWorklist /> },
  pharmacy: { label: 'uyirly.com · Pharmacy', el: <PharmacyStock /> },
  radiology: {
    label: 'uyirly.com · Radiology',
    el: <SimpleList title="Radiology worklist" sub="Modality worklist"
      rows={[
        ['CT Brain Plain', 'Priya S', 'Reported', '#16A34A'],
        ['X-Ray Chest PA', 'Arun M', 'In progress', TEAL],
        ['USG Abdomen', 'Kavya R', 'Ordered', SLATE4],
        ['MRI Knee', 'Suresh P', 'Ordered', SLATE4],
      ]} />,
  },
  blood: {
    label: 'uyirly.com · Blood Bank',
    el: <SimpleList title="Blood stock" sub="By group & component"
      rows={[
        ['O+ · Packed cells', '', '18 units', '#16A34A'],
        ['A+ · Packed cells', '', '9 units', TEAL],
        ['B+ · Plasma', '', '4 units', '#B45309'],
        ['O- · Packed cells', '', '2 units', '#DC2626'],
      ]} />,
  },
  ot: {
    label: 'uyirly.com · Operation Theatre',
    el: <SimpleList title="Today's OT schedule" sub="OT-1 · OT-2"
      rows={[
        ['09:00 · Appendectomy', 'Dr. Rao · OT-1', 'Scheduled', TEAL],
        ['11:30 · LSCS', 'Dr. Menon · OT-2', 'Scheduled', TEAL],
        ['14:00 · Cataract', 'Dr. Iyer · OT-1', 'Pre-op done', '#16A34A'],
        ['16:00 · ORIF', 'Dr. Khan · OT-2', 'Scheduled', SLATE4],
      ]} />,
  },
}

export default function AppPreview({ variant }: { variant: string }) {
  const v = VARIANTS[variant]
  if (!v) return null
  return <Frame label={v.label}>{v.el}</Frame>
}
