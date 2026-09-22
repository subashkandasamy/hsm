/**
 * Every screenshot the guides use, declared in one place.
 *
 * `npm run shots` walks this list against the demo hospital and writes each one
 * to public/guides/. Re-running it refreshes every image, which is the point:
 * when a screen changes, the guides catch up in one command instead of slowly
 * going out of date.
 *
 * Keep a shot tight. A full page shrunk into a 768px column is unreadable; the
 * part of the screen the paragraph is talking about is not.
 */

export interface Shot {
  /** File name under public/guides, without the extension. */
  name: string
  /**
   * Path inside the app, on the demo tenant. `{paedVisit}` and friends are
   * filled in from the demo data at capture time, so re-seeding cannot stale
   * the list — see resolvePlaceholders in the runner.
   */
  path: string
  /** Capture just this element rather than the viewport. */
  selector?: string
  /** Narrow `selector` to the one containing this text — e.g. a card by its heading. */
  filterText?: string
  /** Steps to run before capturing — see the runner for what each does. */
  steps?: Step[]
  /** Viewport width; 1280 unless a screen needs more or is being shown on a phone. */
  width?: number
  height?: number
  /** Extra settle time in ms for screens that load their own data. */
  wait?: number
  /** Keep the sidebar and top bar — only for shots about navigation itself. */
  chrome?: boolean
}

export type Step =
  | { click: string }            // CSS selector
  | { clickText: string }        // visible text, exact-ish
  | { fill: [string, string] }   // [selector, value]
  | { press: string }            // keyboard key
  | { wait: number }

export const SHOTS: Shot[] = [
  // ── Pharmacy ───────────────────────────────────────────────────────────────
  {
    name: 'pharmacy-tabs',
    path: '/pharmacy',
    selector: 'div.flex.gap-1.p-1.rounded-xl',
    wait: 2500,
  },
  {
    name: 'pharmacy-stock',
    path: '/pharmacy',
    steps: [{ clickText: 'Stock' }, { wait: 1500 }],
    selector: 'main',
    wait: 2500,
  },
  {
    name: 'pharmacy-stock-filters',
    path: '/pharmacy',
    steps: [{ clickText: 'Stock' }, { wait: 1200 }, { clickText: 'Running low' }, { wait: 800 }],
    selector: 'main',
    wait: 2500,
  },
  {
    name: 'pharmacy-alerts',
    path: '/pharmacy',
    steps: [{ clickText: 'Alerts' }, { wait: 1200 }],
    selector: 'main',
    wait: 2500,
  },
  {
    name: 'pharmacy-dispense-queue',
    path: '/pharmacy',
    steps: [{ clickText: 'Dispense' }, { wait: 1200 }],
    selector: 'main',
    wait: 2500,
  },
  {
    name: 'pharmacy-h1-register',
    path: '/pharmacy',
    steps: [{ clickText: 'H1 Register' }, { wait: 2000 }],
    selector: 'main',
    wait: 2500,
  },
  {
    name: 'pharmacy-receive',
    path: '/pharmacy/receive',
    selector: 'main',
    wait: 2500,
  },
  {
    name: 'pharmacy-receive-import',
    path: '/pharmacy/receive',
    steps: [{ clickText: 'Import invoice' }, { wait: 1000 }],
    selector: 'main',
    wait: 2500,
  },

  // ── Paediatrics: growth, milestones, immunisation ──────────────────────────
  { name: 'paed-assessment',   path: '/opd/{paedVisit}', selector: 'div.glass-card', filterText: 'Paediatric Assessment', wait: 4500 },
  { name: 'paed-measurements', path: '/opd/{paedVisit}', selector: 'section', filterText: 'Measurements today', wait: 4500 },
  { name: 'paed-growth-chart', path: '/opd/{paedVisit}', selector: 'section', filterText: 'WHO growth chart', wait: 5000 },
  { name: 'paed-vaccinations', path: '/opd/{paedVisit}', selector: 'section', filterText: 'Vaccinations', wait: 4500 },
  { name: 'paed-milestones',   path: '/opd/{paedVisit}', selector: 'section', filterText: 'Developmental milestones', wait: 4500 },

  // ── Obstetrics: antenatal care and the labour ward ─────────────────────────
  { name: 'anc-card',      path: '/opd/{ancVisit}', selector: 'div.glass-card', filterText: 'Obstetrics & Gynaecology', wait: 4500 },
  { name: 'anc-check',     path: '/opd/{ancVisit}', selector: 'section', filterText: 'Antenatal check today', wait: 4500 },
  { name: 'anc-schedule',  path: '/opd/{ancVisit}', selector: 'section', filterText: 'Care schedule', wait: 4500 },
  {
    name: 'labour-partograph',
    path: '/ipd/{labourAdmission}',
    steps: [{ clickText: 'Labour' }, { wait: 2000 }],
    selector: 'main', wait: 4000,
  },
  { name: 'ipd-admission', path: '/ipd/{wardAdmission}', selector: 'main', wait: 4500 },

  // ── OPD: the consultation itself ───────────────────────────────────────────
  { name: 'opd-vitals',       path: '/opd/{generalVisit}', selector: 'div.glass-card', filterText: 'Vitals', wait: 4000 },
  { name: 'opd-consultation', path: '/opd/{generalVisit}', selector: 'div.glass-card', filterText: 'Consultation', wait: 4000 },
  {
    name: 'patient-register',
    path: '/patients',
    steps: [{ clickText: 'Register' }, { wait: 1200 }],
    selector: 'form', wait: 2500,
  },

  // ── Billing ────────────────────────────────────────────────────────────────
  { name: 'billing-by-patient',  path: '/billing', selector: 'main', wait: 3000 },
  { name: 'ipd-combined-bill',   path: '/billing/combined/patient/{ipdPatient}', selector: 'main', wait: 4000 },

  // ── Theatre, blood bank, emergency, insurance ──────────────────────────────
  { name: 'ot-schedule',   path: '/ot',        selector: 'main', wait: 3000 },
  { name: 'blood-bank',    path: '/blood',     selector: 'main', wait: 3000 },
  { name: 'emergency',     path: '/emergency', selector: 'main', wait: 3000 },
  { name: 'insurance',     path: '/insurance', selector: 'main', wait: 3500 },
  {
    name: 'insurance-approved',
    path: '/insurance',
    steps: [{ clickText: 'Approved' }, { wait: 1500 }],
    selector: 'main', wait: 3500,
  },

  // ── Records and specialties ────────────────────────────────────────────────
  { name: 'patient-profile', path: '/patients/{ipdPatient}', selector: 'main', wait: 4000 },
  { name: 'eye-exam',      path: '/opd/{eyeVisit}',    selector: 'div.glass-card', filterText: 'Eye Examination', wait: 4500 },
  { name: 'dental-chart',  path: '/opd/{dentalVisit}', selector: 'div.glass-card', filterText: 'Dental', wait: 4500 },
  {
    name: 'nurse-roster',
    path: '/scheduling',
    selector: 'main', wait: 4500,
  },
  // Attendance is a tab on the staff directory — /hr is still a placeholder page.
  {
    name: 'staff-attendance',
    path: '/staff',
    steps: [{ clickText: 'Attendance' }, { wait: 2000 }],
    selector: 'main',
    wait: 3000,
  },
  { name: 'staff-directory', path: '/staff', selector: 'main', wait: 3000 },

  // ── The rest of the hospital ───────────────────────────────────────────────
  { name: 'dashboard',    path: '/dashboard',    selector: 'main', wait: 3000 },
  { name: 'patients',     path: '/patients',     selector: 'main', wait: 2500 },
  { name: 'appointments', path: '/appointments', selector: 'main', wait: 2500 },
  { name: 'ward-board',   path: '/wards',        selector: 'main', wait: 2500 },
  { name: 'ipd-list',     path: '/ipd',          selector: 'main', wait: 2500 },
  { name: 'opd-queue',    path: '/opd',          selector: 'main', wait: 2500 },
  { name: 'lab-orders',    path: '/lab', selector: 'main', wait: 2500 },
  {
    name: 'lab-reported',
    path: '/lab',
    steps: [{ clickText: 'Reported' }, { wait: 1500 }],
    selector: 'main', wait: 2500,
  },
  { name: 'radiology-worklist', path: '/radiology', selector: 'main', wait: 3000 },
  {
    name: 'radiology-reported',
    path: '/radiology',
    steps: [{ clickText: 'Reported' }, { wait: 1500 }],
    selector: 'main', wait: 3000,
  },
  { name: 'billing',          path: '/billing',                     selector: 'main', wait: 2500 },
  { name: 'cash-book',        path: '/billing/cash-book',           selector: 'main', wait: 3000 },
  { name: 'estimates',        path: '/billing/estimates',           selector: 'main', wait: 3000 },
  {
    name: 'estimate-detail',
    path: '/billing/estimates/{estimate}',
    selector: 'main', wait: 3000,
  },
  { name: 'discount-approvals', path: '/billing/discount-approvals', selector: 'main', wait: 3000 },
]
