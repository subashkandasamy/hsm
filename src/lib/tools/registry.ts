import type { Metadata } from 'next'

// Free interactive tools (Phase 6). Each = a /tools/<slug> page that ranks for a
// "generator / calculator / lookup" keyword, satisfies "do" intent better than an
// article, earns backlinks (linkable asset), and converts via a Start-free-trial
// CTA. Content lives here; ToolShell renders the SEO wrapper + the interactive
// widget (passed as children from the route). Mirrors the SOLUTIONS pattern.

const SITE = 'https://www.uyirly.com'

export interface ToolStep { title: string; body: string }

export interface ToolMeta {
  slug: string
  /** Chip above the H1. */
  eyebrow: string
  /** One clean line for the /tools hub card. */
  tagline: string
  /** <title> — kept ≤60 chars before " | Uyirly". */
  metaTitle: string
  /** Meta description ~150–160 chars. */
  description: string
  keywords: string[]
  h1: string
  /** Intro paragraph under the H1. Supports [label](/href) inline links. */
  intro: string
  /** "How to use" steps. */
  howTo: ToolStep[]
  faqs: { q: string; a: string }[]
  related: { label: string; href: string }[]
  updated: string // YYYY-MM-DD
}

export const TOOLS: Record<string, ToolMeta> = {
  'hospital-bill-format-generator': {
    slug: 'hospital-bill-format-generator',
    eyebrow: 'Free Tool',
    tagline: 'Create a clean, GST-ready OPD or IPD hospital bill and print or save it as a PDF.',
    metaTitle: 'Hospital Bill Format Generator (OPD & IPD)',
    description:
      'Free hospital bill format generator — build a clean, printable OPD or IPD medical bill with itemised charges and GST, and download it as a PDF. No sign-up.',
    keywords: [
      'hospital bill format',
      'medical bill format',
      'opd bill format',
      'ipd bill format',
      'hospital bill format pdf',
      'hospital bill format in word',
      'hospital bill format in excel',
      'hospital bill sample',
      'medical bill format pdf',
    ],
    h1: 'Hospital bill format generator',
    intro:
      'Build a clean, professional hospital bill right in your browser — add your hospital details and line items, then print it or save it as a PDF. It works for both OPD and IPD bills, it is completely free, and there is no sign-up. Making bills by hand every day? [Uyirly](/hospital-management-software) builds them automatically as care happens.',
    howTo: [
      { title: 'Choose OPD or IPD', body: 'Pick the bill type at the top — the layout adjusts for an outpatient receipt or an inpatient bill.' },
      { title: 'Add your hospital details', body: 'Enter your hospital name, address and (optionally) GSTIN — these appear at the top of the bill.' },
      { title: 'Add the patient', body: 'Fill in the patient’s name, ID and the bill date.' },
      { title: 'Add line items', body: 'List each charge — consultation, room rent, lab, pharmacy, procedures — with quantity and rate. Totals update live.' },
      { title: 'Apply GST if needed', body: 'Add a GST rate if it applies (most core healthcare is exempt; room rent above ₹5,000/day is taxable). See our GST guide for the rules.' },
      { title: 'Print or save as PDF', body: 'Click Print — then choose “Save as PDF” in the print dialog to download the bill.' },
    ],
    faqs: [
      {
        q: 'What is a hospital bill format?',
        a: 'A hospital bill format is the standard layout of a hospital or clinic invoice — hospital and patient details at the top, an itemised list of charges (consultation, room, lab, pharmacy, procedures), then the subtotal, any GST, and the total. This free tool generates that format for you as an OPD or IPD bill.',
      },
      {
        q: 'What is the difference between an OPD and an IPD bill?',
        a: 'An OPD (outpatient) bill is a simple receipt for a single visit — consultation, tests and medicines. An IPD (inpatient) bill covers an admission and adds daily charges like bed rent and nursing over several days. See our [IPD billing guide](/guides/ipd-billing-software-explained) for a full example.',
      },
      {
        q: 'Is GST applicable on a hospital bill?',
        a: 'Most core healthcare services are GST-exempt, but some items are taxable — for example, room rent above ₹5,000 per day attracts 5% GST. Add the correct rate in the tool, or read our [GST on hospital bills guide](/guides/hospital-gst-billing-rules-india). This tool is a template, not tax advice.',
      },
      {
        q: 'Can I download the bill as a PDF, Word or Excel?',
        a: 'Yes — click Print and choose “Save as PDF” in your browser’s print dialog to get a PDF. For a real hospital that bills every day, a proper system is faster than any template — [Uyirly](/hospital-management-software) builds the bill automatically and keeps every patient’s history.',
      },
      {
        q: 'Is this bill generator free?',
        a: 'Yes, completely free and no sign-up. If you want your bills to build themselves as care happens — instead of typing them each time — start a free 30-day trial of Uyirly.',
      },
    ],
    related: [
      { label: 'Hospital bill format (OPD & IPD) with samples', href: '/guides/hospital-bill-format-ipd-opd-sample' },
      { label: 'IPD billing explained', href: '/guides/ipd-billing-software-explained' },
      { label: 'GST on hospital bills in India', href: '/guides/hospital-gst-billing-rules-india' },
      { label: 'Hospital management software', href: '/hospital-management-software' },
    ],
    updated: '2026-08-05',
  },

  'nurse-patient-ratio-calculator': {
    slug: 'nurse-patient-ratio-calculator',
    eyebrow: 'Free Tool',
    tagline: 'Work out how many nurses a ward needs per shift, using NABH-aligned nurse-to-patient ratios.',
    metaTitle: 'Nurse-to-Patient Ratio Calculator (NABH)',
    description:
      'Free nurse-to-patient ratio calculator for Indian hospitals — enter ward type and patient count to get nurses needed per shift and for 24×7 cover, using NABH-aligned ratios.',
    keywords: [
      'nurse patient ratio',
      'nurse to patient ratio',
      'nurse patient ratio calculator',
      'icu nurse patient ratio',
      'nabh nurse ratio',
      'nurse to patient ratio in india',
      'nurse to patient ratio in general ward',
    ],
    h1: 'Nurse-to-patient ratio calculator',
    intro:
      'Work out how many nurses a ward needs. Pick the ward type and the number of patients, and this free calculator gives you nurses per shift and the total for round-the-clock cover, using NABH-aligned nurse-to-patient ratios. See our [nurse-to-patient ratio guide](/guides/nurse-patient-ratio-india-nabh) for the norms behind it.',
    howTo: [
      { title: 'Pick the ward type', body: 'Choose the ward — general, ICU, HDU, paediatric and so on. The recommended ratio for that ward is shown.' },
      { title: 'Enter the number of patients', body: 'Type how many patients (or occupied beds) the ward holds.' },
      { title: 'Read the result', body: 'You get nurses needed per shift, the total for three shifts, and a figure that includes weekly-off and leave relief for true 24×7 cover.' },
      { title: 'Plan your roster', body: 'Use the numbers to build a duty roster that always meets the ratio.' },
    ],
    faqs: [
      {
        q: 'What is the nurse-to-patient ratio in a general ward in India?',
        a: 'NABH-aligned practice for a general ward is about 1 nurse to 6 patients (1:6) per shift. Higher-acuity areas need more — ICU is around 1:1 and HDU/step-down about 1:3. This calculator uses these ratios; see our nurse-to-patient ratio guide for the full norms.',
      },
      {
        q: 'What is the ICU nurse-to-patient ratio?',
        a: 'Intensive care typically needs about 1 nurse per patient (1:1) per shift because of the level of monitoring and intervention required. Some units use 1:2 for stable patients. This tool defaults ICU to 1:1.',
      },
      {
        q: 'How many nurses do I need for 24×7 cover?',
        a: 'Take the nurses needed per shift and multiply by three shifts, then add relief for weekly-offs and leave — roughly a 1.4× factor. The calculator does this and shows the total headcount to keep the ward staffed round the clock.',
      },
      {
        q: 'Are these ratios the official NABH standard?',
        a: 'They are the commonly-cited, NABH-aligned ratios used for planning. Always confirm against the current NABH standard and your hospital’s own policy. Uyirly builds ward rosters that flag when a shift falls below your chosen ratio.',
      },
    ],
    related: [
      { label: 'Nurse-to-patient ratio in India (NABH)', href: '/guides/nurse-patient-ratio-india-nabh' },
      { label: 'How to build a nurse duty roster', href: '/guides/nurse-duty-roster-hospital-guide' },
      { label: 'Hospital management software', href: '/hospital-management-software' },
    ],
    updated: '2026-08-05',
  },

  'gst-on-hospital-bill-calculator': {
    slug: 'gst-on-hospital-bill-calculator',
    eyebrow: 'Free Tool',
    tagline: 'Check whether GST applies on a hospital bill — room rent and services — and calculate the tax.',
    metaTitle: 'GST on Hospital Bill Calculator (India)',
    description:
      'Free GST calculator for hospital bills in India — non-ICU room rent above ₹5,000/day attracts 5% GST while core healthcare is exempt. Enter your charges to see the tax.',
    keywords: [
      'gst on hospital bill',
      'gst on room rent hospital',
      'is gst applicable on hospital services',
      'hospital gst calculator',
      'gst on hospital room rent',
      'gst rate on hospital room',
    ],
    h1: 'GST on hospital bill calculator',
    intro:
      'Check whether GST applies to a hospital bill and calculate it. Core healthcare services are GST-exempt, but non-ICU room rent above ₹5,000 per day attracts 5% GST. Enter your charges below. For the full rules, read our [GST on hospital bills guide](/guides/hospital-gst-billing-rules-india). This is a guide, not tax advice.',
    howTo: [
      { title: 'Choose the room type', body: 'ICU/CCU room rent is exempt regardless of amount; other rooms are taxable only above ₹5,000 per day.' },
      { title: 'Enter room rent and days', body: 'Type the rent per day and the number of days.' },
      { title: 'Add other charges', body: 'Enter the value of other healthcare services — these are treated as exempt by default.' },
      { title: 'Read the GST', body: 'The tool shows which part is taxable, the 5% GST on it, and the total bill.' },
    ],
    faqs: [
      {
        q: 'Is GST applicable on a hospital bill?',
        a: 'Core healthcare services provided by a hospital are GST-exempt. The main exception is room rent: a non-ICU room charged above ₹5,000 per day attracts 5% GST (without input tax credit). ICU/CCU room rent is exempt regardless of amount.',
      },
      {
        q: 'Is GST charged on hospital room rent?',
        a: 'Only when a non-ICU room is billed above ₹5,000 per day — then 5% GST applies to the room rent. At ₹5,000 or below, and for ICU/CCU rooms, room rent is exempt. This calculator applies that rule.',
      },
      {
        q: 'What GST rate applies to hospital room rent?',
        a: '5%, without input tax credit, on non-ICU room rent above ₹5,000 per day. Core medical treatment, consultation and most services remain exempt.',
      },
      {
        q: 'Are consultation fees and medicines taxed?',
        a: 'Consultation and treatment provided as part of healthcare are exempt. Standalone sales (for example, an outpatient pharmacy retail sale) can be taxable. This is a guide — confirm specifics with your tax advisor.',
      },
    ],
    related: [
      { label: 'GST on hospital bills in India', href: '/guides/hospital-gst-billing-rules-india' },
      { label: 'Hospital bill format generator', href: '/tools/hospital-bill-format-generator' },
      { label: 'Hospital management software', href: '/hospital-management-software' },
    ],
    updated: '2026-08-05',
  },
}

export function toolSlugs(): string[] {
  return Object.keys(TOOLS)
}

export function getTool(slug: string): ToolMeta | undefined {
  return TOOLS[slug]
}

export function toolMetadata(slug: string): Metadata {
  const meta = TOOLS[slug]
  if (!meta) return {}
  const url = `${SITE}/tools/${meta.slug}`
  const title = `${meta.metaTitle} | Uyirly`
  return {
    title,
    description: meta.description,
    keywords: meta.keywords,
    alternates: { canonical: url },
    openGraph: { title, description: meta.description, url, siteName: 'Uyirly', type: 'website' },
    twitter: { card: 'summary_large_image', title, description: meta.description },
  }
}
