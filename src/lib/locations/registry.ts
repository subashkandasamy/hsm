import type { Metadata } from 'next'
import type { SolutionMeta } from '@/lib/solutions/registry'

const SITE = 'https://www.uyirly.com'

// City pages target "hospital management software in [city]" searches — the
// scalable local-SEO format. Each renders through SolutionShell with a
// city-interpolated SolutionMeta, so it inherits sections, tables, steps,
// previews, FAQs and internal links. URL: /hospital-management-software/<slug>.
export interface City {
  slug: string
  city: string
  state: string
}

export const CITIES: City[] = [
  { slug: 'chennai',          city: 'Chennai',          state: 'Tamil Nadu' },
  { slug: 'coimbatore',       city: 'Coimbatore',       state: 'Tamil Nadu' },
  { slug: 'madurai',          city: 'Madurai',          state: 'Tamil Nadu' },
  { slug: 'tiruchirappalli',  city: 'Tiruchirappalli',  state: 'Tamil Nadu' },
  { slug: 'salem',            city: 'Salem',            state: 'Tamil Nadu' },
  { slug: 'bangalore',        city: 'Bengaluru',        state: 'Karnataka' },
  { slug: 'hyderabad',        city: 'Hyderabad',        state: 'Telangana' },
  { slug: 'delhi',            city: 'Delhi',            state: 'Delhi NCR' },
  { slug: 'mumbai',           city: 'Mumbai',           state: 'Maharashtra' },
  { slug: 'pune',             city: 'Pune',             state: 'Maharashtra' },
  { slug: 'kochi',            city: 'Kochi',            state: 'Kerala' },
  { slug: 'vijayawada',       city: 'Vijayawada',       state: 'Andhra Pradesh' },
]

export function citySlugs(): string[] {
  return CITIES.map((c) => c.slug)
}

export function getCity(slug: string): City | undefined {
  return CITIES.find((c) => c.slug === slug)
}

export function getCityMeta(slug: string): SolutionMeta | undefined {
  const c = getCity(slug)
  if (!c) return undefined
  const { city, state } = c

  return {
    slug: `hospital-management-software/${slug}`,
    eyebrow: `Hospital Software · ${city}`,
    group: 'By location',
    tagline: `Cloud hospital management software for hospitals and clinics in ${city}.`,
    metaTitle: `Hospital Management Software in ${city}`,
    description:
      `Uyirly is cloud hospital management software for hospitals, clinics and nursing homes in ${city}, ${state} — OPD, IPD, pharmacy, lab, billing and insurance in one system. Flat pricing, 30-day free trial.`,
    keywords: [
      `hospital management software in ${city}`,
      `hospital management software ${city}`,
      `hospital software ${city}`,
      `hms software ${city}`,
      `clinic management software ${city}`,
      `hospital management system ${city}`,
    ],
    primaryKeyword: `hospital management software in ${city}`,
    h1: `Hospital management software in ${city}`,
    subhead:
      `Uyirly is an all-in-one, cloud-based hospital management system used by hospitals, clinics and nursing homes across ${city} and the rest of ${state}. It runs OPD, IPD, pharmacy, lab, radiology, billing and insurance on one shared patient record — with flat monthly pricing and a 30-day free trial, so a ${city} hospital can go live the same day.`,
    heroBullets: [
      'OPD, IPD, pharmacy, lab and billing on one platform',
      'One patient record and one bill across every department',
      'GST billing, insurance/TPA claims, one record per patient',
      'Cloud-based — nothing to install; data stored in India',
    ],
    sections: [
      {
        h2: `Hospital software built for ${city} hospitals`,
        body:
          `Whether you run a small clinic, a nursing home or a multi-specialty hospital in ${city}, [Uyirly](/hospital-management-software) puts your whole operation on one system. A patient is registered once and flows through consultation, admission, tests, medicines and billing with no re-entry — so your ${city} team works from one shared patient and one shared bill instead of a dozen separate registers.`,
        preview: 'dashboard',
        bullets: [
          'Patient registration with a lifelong UHID',
          'OPD appointments and a live token queue',
          'IPD admission, beds and discharge billing',
          'Pharmacy, laboratory (LIS) and radiology (RIS)',
          'Billing, GST invoices and insurance/TPA claims',
        ],
      },
      {
        h2: `Why clinics and hospitals in ${city} choose Uyirly`,
        body:
          `Hospitals in ${city} pick Uyirly for the same reasons hospitals anywhere do — but a few matter especially for a growing ${state} practice.`,
        subsections: [
          {
            h3: 'Flat pricing, no per-bed fees',
            body:
              `Per-bed and per-user pricing punishes you for growing. Uyirly is flat monthly pricing with no per-bed or per-user metering, so a ${city} nursing home and a large hospital each pay for the plan they need. See [pricing](/pricing).`,
          },
          {
            h3: 'Built for India',
            body:
              'GST-ready billing and insurance and TPA cashless claims are built in — not bolted on — so your billing and paperwork match how Indian hospitals actually run.',
          },
          {
            h3: 'Cloud-based, works across branches',
            body:
              `There is nothing to install and no server to buy. A group with more than one location in ${city} reads from the same live patient record, and staff can log in from any device.`,
          },
        ],
      },
      {
        h2: `Works for every kind of facility in ${city}`,
        body:
          `Turn on the modules you need today and add the rest later. The same platform fits a [clinic](/clinic-management-software), a [nursing home](/nursing-home-management-software), a [multi-specialty hospital](/multi-specialty-hospital-software), a diagnostic [lab](/lab-management-software) or a [dental clinic](/dental-clinic-software) in ${city}.`,
      },
      {
        h2: `How to get your ${city} hospital live on Uyirly`,
        body:
          'There is no procurement and no installation. Most hospitals are seeing patients the same day they sign up.',
        steps: [
          { title: 'Start your free trial', body: 'Sign up on [uyirly.com](/signup) with your hospital name and mobile number — no credit card needed.' },
          { title: 'Add your team and departments', body: 'Invite your doctors, nurses and front desk, and switch on the modules you use. A setup guide walks you through it.' },
          { title: 'Register your first patient', body: 'Run OPD, billing and pharmacy right away, and add more departments whenever you are ready.' },
        ],
      },
      {
        h2: 'Uyirly vs typical hospital software',
        body:
          `What a ${city} hospital gets by moving to Uyirly.`,
        table: {
          headers: ['What matters', 'Typical software', 'Uyirly'],
          rows: [
            ['Setup', 'Weeks of installation', 'Live the same day'],
            ['Pricing', 'Per bed / per user', 'Flat monthly, no per-bed fees'],
            ['Billing', 'Totalled by hand at discharge', 'Ready as care happens'],
            ['Data', 'Varies', 'Stored in India, DPDP aligned'],
            ['Free trial', 'Usually paid pilot', '30-day free trial, no card'],
          ],
        },
      },
    ],
    faqs: [
      {
        q: `Is Uyirly available for hospitals in ${city}?`,
        a: `Yes. Uyirly is cloud-based, so any hospital, clinic or nursing home in ${city}, ${state} can sign up and start the same day — there is nothing to install and no server to buy. You get a 30-day free trial with no credit card.`,
      },
      {
        q: `How much does hospital management software cost in ${city}?`,
        a: `Uyirly uses flat monthly pricing with no per-bed or per-user fees, starting from ₹2,999/month, plus a 30-day free trial. A small ${city} clinic and a large hospital each pay for the plan they need. See the [pricing page](/pricing) and our [cost guide](/guides/hospital-management-software-cost-india).`,
      },
      {
        q: `Does it support GST billing and insurance claims for ${state}?`,
        a: 'Yes. Billing produces GST-ready invoices, and the insurance module handles cashless TPA claims end to end, so paperwork does not hold up a discharge — the same across every Indian state.',
      },
      {
        q: 'Is my patient data safe?',
        a: 'Yes. Patient data is stored in India and aligned with the DPDP Act, each hospital’s data is kept separate, access is by staff role, and everything is encrypted and audit-logged.',
      },
      {
        q: `Can a small clinic in ${city} use it, or only big hospitals?`,
        a: `Both. The same platform fits a single-doctor clinic, a nursing home and a multi-specialty hospital in ${city}. You switch modules on as you grow, with no migration.`,
      },
    ],
    related: [
      { label: 'Hospital management software', href: '/hospital-management-software' },
      { label: 'Best hospital management software in India', href: '/best-hospital-management-software-in-india' },
      { label: 'Clinic management software', href: '/clinic-management-software' },
      { label: 'Pricing', href: '/pricing' },
    ],
    updated: '2026-08-04',
  }
}

export function cityMetadata(slug: string): Metadata {
  const meta = getCityMeta(slug)
  if (!meta) return {}
  const url = `${SITE}/${meta.slug}`
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
