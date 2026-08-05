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
