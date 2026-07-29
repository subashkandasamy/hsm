import type { Metadata } from 'next'

// Commercial "solution" landing pages — the buyer-intent counterpart to /guides.
// Each entry is one top-level page (e.g. /lab-management-software) built to rank
// for a high-volume, low-competition, buyer-intent keyword cluster and convert to
// a free-trial signup. Content lives here (single source of truth); the route
// folder under src/app/<slug>/ is a thin wrapper around <SolutionShell slug=… />.

export interface SolutionSection {
  h2: string
  body: string
  bullets?: string[]
}

export interface SolutionMeta {
  slug: string
  /** Chip above the H1, e.g. "Lab Management Software". */
  eyebrow: string
  /** <title> — keep ≤60 chars before " | Uyirly". */
  metaTitle: string
  /** Meta description, ~150–160 chars. */
  description: string
  keywords: string[]
  primaryKeyword: string
  h1: string
  subhead: string
  /** 3–4 quick value props shown as check rows under the hero. */
  heroBullets: string[]
  sections: SolutionSection[]
  faqs: { q: string; a: string }[]
  related: { label: string; href: string }[]
  updated: string // YYYY-MM-DD
}

export const SOLUTIONS: Record<string, SolutionMeta> = {
  'lab-management-software': {
    slug: 'lab-management-software',
    eyebrow: 'Lab Management Software',
    metaTitle: 'Lab Management Software (LIMS) for Indian Labs',
    description:
      'Uyirly is cloud lab management software (LIMS) for Indian diagnostic labs and hospital pathology — sample tracking, test catalogue, auto reports, billing. Free trial.',
    keywords: [
      'lab management software',
      'laboratory information management system',
      'lims software',
      'laboratory management system',
      'lab management system',
      'pathology lab software',
      'lis system',
    ],
    primaryKeyword: 'lab management software',
    h1: 'Lab management software built for Indian labs',
    subhead:
      'Uyirly runs your diagnostic lab or hospital pathology department end to end — order to sample to verified report — on one cloud LIMS, with billing and patient records already connected.',
    heroBullets: [
      'Sample tracking from collection to verified result, no lost tubes',
      'Test catalogue with reference ranges, panels and per-test pricing',
      'Auto-formatted PDF reports, delivered by WhatsApp or portal',
      'Billing and patient records built in — no re-entry',
    ],
    sections: [
      {
        h2: 'A LIMS is a workflow, not a spreadsheet',
        body:
          "A laboratory information management system exists to make one thing impossible: a sample getting lost or a result going to the wrong patient. Uyirly gives every sample a barcoded identity at collection and tracks it through accessioning, analysis and verification — so at any moment you know exactly where a test is and who touched it. That audit trail is what a register or an Excel sheet can never give you.",
      },
      {
        h2: 'The test catalogue does the heavy lifting',
        body:
          'Every test carries its reference ranges, units, sample type, method and price. Group tests into panels and profiles once, and ordering, reporting and billing all read from the same definition — so a CBC is priced, collected and reported consistently no matter who books it.',
        bullets: [
          'Reference ranges flag high/low values automatically on the report',
          'Panels and health packages bundle tests with package pricing',
          'Per-test and per-panel pricing flows straight to the bill',
        ],
      },
      {
        h2: 'Reports that are ready to hand over',
        body:
          "The point of the software is the finished report. Uyirly formats results into a clean, letterhead PDF the moment a value is verified — with the reference ranges, the verifying pathologist and any interpretive notes in place. Deliver it over WhatsApp or a patient portal instead of asking the patient to come back for a printout.",
      },
      {
        h2: 'Lab, billing and records are one system',
        body:
          'Standalone LIMS force you to re-key the patient and reconcile the bill separately. In Uyirly the lab shares the same patient record and billing as OPD, IPD and pharmacy — so a test ordered from a doctor’s consultation lands on the same patient and the same bill, and a walk-in lab customer is billed in one screen.',
        bullets: [
          'Tests ordered in OPD/IPD flow to the lab with no re-registration',
          'Lab charges join the patient’s running bill automatically',
          'One patient history across lab, pharmacy, radiology and clinic',
        ],
      },
    ],
    faqs: [
      {
        q: 'What is the difference between LIMS and LIS?',
        a: 'They overlap heavily. A LIS (laboratory information system) is the clinical-lab term for the system that manages patient samples, orders and results in a diagnostic or hospital lab; LIMS (laboratory information management system) is the broader term also used in research and industrial labs. For an Indian diagnostic lab or hospital pathology department, the two words describe the same thing Uyirly provides: sample tracking, a test catalogue, result entry and reporting.',
      },
      {
        q: 'Can it work for a standalone diagnostic lab as well as a hospital lab?',
        a: 'Yes. A standalone lab uses it for walk-in registration, sample tracking, reporting and billing on its own. A hospital lab uses the same module inside the full system, so tests ordered from OPD and IPD flow in without re-registering the patient and charges join the patient’s bill.',
      },
      {
        q: 'Does it handle report delivery to patients?',
        a: 'Yes. Verified results are formatted into a letterhead PDF automatically and can be delivered by WhatsApp or a patient portal, so patients get their reports without a second trip to the lab.',
      },
    ],
    related: [
      { label: 'How a lab LIS workflow actually works', href: '/guides/lab-lis-workflow-guide' },
      { label: 'Hospital management software', href: '/hospital-management-software' },
      { label: 'Radiology & RIS reporting', href: '/guides/radiology-ris-reporting-guide' },
    ],
    updated: '2026-07-29',
  },

  'clinic-management-software': {
    slug: 'clinic-management-software',
    eyebrow: 'Clinic Management Software',
    metaTitle: 'Clinic Management Software for Indian Clinics',
    description:
      'Uyirly is cloud clinic management software for Indian clinics — appointments, OPD queue, prescriptions, billing, pharmacy and patient records in one place. 30-day free trial.',
    keywords: [
      'clinic management software',
      'clinic management system',
      'clinic software',
      'best clinic management software',
      'clinic management software free',
      'doctor clinic software',
    ],
    primaryKeyword: 'clinic management software',
    h1: 'Clinic management software that runs the whole clinic',
    subhead:
      'Appointments, the OPD queue, prescriptions, billing and pharmacy — Uyirly puts everything a busy clinic touches in one cloud system, so the front desk, the doctor and the pharmacy all work from the same patient.',
    heroBullets: [
      'Online appointments and a live OPD token queue',
      'Prescriptions with a drug list, reusable across visits',
      'One-screen billing with GST-ready invoices',
      'Patient history every doctor in the clinic can see',
    ],
    sections: [
      {
        h2: 'One patient, seen by the whole clinic',
        body:
          'The everyday failure of a paper clinic is that the front desk, the doctor and the pharmacy each keep their own version of the patient. Uyirly keeps one: registration, the consultation, the prescription, the bill and the medicines dispensed all attach to a single patient record that everyone in the clinic reads from. Nothing is re-entered and nothing is lost between the desk and the doctor.',
      },
      {
        h2: 'The queue that the waiting room actually needs',
        body:
          'Walk-ins and appointments arrive in the same waiting room, and fairness is about who is genuinely next, not who shouted loudest. Uyirly runs a live token queue the front desk and the doctor share, so patients are called in order and the doctor’s screen always shows who is waiting.',
        bullets: [
          'Online booking plus walk-in tokens in one ordered queue',
          'Doctor’s worklist updates live as patients arrive and finish',
          'Repeat patients are found instantly by phone or UHID',
        ],
      },
      {
        h2: 'Prescribe, bill and dispense without re-typing',
        body:
          'A consultation ends in a prescription and a bill, and often a strip of medicine from the clinic pharmacy. Uyirly carries the same order through all three: the doctor prescribes from a drug list, the charge lands on the bill, and the pharmacy dispenses against the same prescription — so the money and the medicine always match the consultation.',
      },
      {
        h2: 'Starts as a clinic, grows into a hospital',
        body:
          'A clinic that adds beds, a lab or a second doctor shouldn’t have to change software. Uyirly is the same platform that runs full hospitals — OPD, IPD, pharmacy, lab, billing and staff — so the clinic you set up today extends into admissions, diagnostics and multiple doctors without a migration.',
        bullets: [
          'Add a lab, pharmacy or beds without switching systems',
          'Multi-doctor and multi-location on the same patient database',
          'Cloud-based: nothing to install, works on any device',
        ],
      },
    ],
    faqs: [
      {
        q: 'Is there a free version of the clinic management software?',
        a: 'Uyirly offers a 30-day free trial with no credit card, so a clinic can run its real front desk, consultations and billing before paying anything. After the trial it moves to a flat monthly plan with no per-user or per-patient metering.',
      },
      {
        q: 'Does it work for a single-doctor clinic?',
        a: 'Yes. A single-doctor clinic uses it for appointments, the token queue, prescriptions and billing on one screen. Because it is the same platform that runs multi-doctor clinics and hospitals, the same setup extends when you add a second doctor, a pharmacy or a lab.',
      },
      {
        q: 'Can the clinic pharmacy be billed in the same system?',
        a: 'Yes. The prescription a doctor writes flows to the clinic pharmacy, which dispenses against it and adds the charge to the same patient bill — so the consultation, the medicine and the money all stay in one place.',
      },
    ],
    related: [
      { label: 'OPD queue & token management explained', href: '/guides/opd-queue-token-management-guide' },
      { label: 'Hospital management software', href: '/hospital-management-software' },
      { label: 'Pricing', href: '/pricing' },
    ],
    updated: '2026-07-29',
  },

  'electronic-medical-records-software': {
    slug: 'electronic-medical-records-software',
    eyebrow: 'EMR / EHR Software',
    metaTitle: 'Electronic Medical Records (EMR/EHR) Software India',
    description:
      'Uyirly is cloud EMR/EHR software for Indian hospitals and clinics — one lifelong patient record across OPD, IPD, lab, pharmacy and radiology, ABDM/ABHA-ready. Free trial.',
    keywords: [
      'electronic medical records software',
      'emr software',
      'ehr software',
      'electronic health record systems',
      'digital medical records software',
      'medical records software',
      'emr medical records',
    ],
    primaryKeyword: 'electronic medical records software',
    h1: 'Electronic medical records, one lifelong patient history',
    subhead:
      'Uyirly’s EMR/EHR keeps a single record for each patient across every visit and every department — consultations, admissions, lab, radiology, pharmacy and billing — instead of scattered files that never meet.',
    heroBullets: [
      'One UHID that unifies a patient’s whole history',
      'Consultations, labs, scans and medicines on one timeline',
      'ABDM/ABHA-ready for India’s digital health mission',
      'Cloud-based, access-controlled and audit-logged',
    ],
    sections: [
      {
        h2: 'The record is the point',
        body:
          'An electronic medical record earns its place by answering one question instantly: what has happened to this patient before? Uyirly gives every patient a single UHID and hangs everything on it — each OPD consultation, each admission, every lab result and scan, every prescription and bill — so a doctor opening the record sees the whole history on one timeline, not a folder someone has to reassemble.',
      },
      {
        h2: 'EMR and EHR — and why the difference matters in India',
        body:
          'An EMR is the record within one hospital; an EHR is the record that follows the patient between providers. India’s ABDM (Ayushman Bharat Digital Mission) is building exactly that portability through the ABHA health ID. Uyirly is designed for both: a complete EMR inside your hospital, and ABDM/ABHA-ready so records can link to a patient’s national health account.',
        bullets: [
          'Full EMR across OPD, IPD, lab, radiology and pharmacy',
          'ABDM/ABHA-ready — link records to a patient’s ABHA',
          'Scan-and-share style registration on the roadmap',
        ],
      },
      {
        h2: 'One record, safely shared',
        body:
          'A shared record is only useful if it is also controlled. Uyirly is role-based — a receptionist, a doctor, a lab technician and an accountant each see exactly what their job needs — and every access and change is audit-logged. The record is one, but who can read and edit which part is not.',
      },
      {
        h2: 'Records that connect to the work, not a separate silo',
        body:
          'Many EMRs sit apart from billing and operations, so the record and the money drift out of sync. In Uyirly the record is the same system that runs the queue, the lab, the pharmacy and the bill — so ordering a test, dispensing a medicine or raising an invoice all write to the same patient history automatically.',
      },
    ],
    faqs: [
      {
        q: 'What is the difference between EMR and EHR software?',
        a: 'An EMR (electronic medical record) is the digital chart of a patient within a single hospital or clinic. An EHR (electronic health record) is designed to travel with the patient across different providers. Uyirly is a full EMR inside your facility and is ABDM/ABHA-ready, so records can link to a patient’s national health account under India’s digital health mission.',
      },
      {
        q: 'Is the EMR ABDM and ABHA compliant?',
        a: 'Uyirly is built to be ABDM/ABHA-ready — it can link a patient’s records to their ABHA (Ayushman Bharat Health Account) health ID so the record fits into India’s national digital health framework, rather than staying locked inside one hospital.',
      },
      {
        q: 'Who can see a patient’s medical record?',
        a: 'Access is role-based: reception, doctors, lab, pharmacy and accounts each see only what their role needs, and every view and edit is audit-logged. The record is unified, but access to each part is controlled.',
      },
    ],
    related: [
      { label: 'Patient records, EMR & UHID explained', href: '/guides/patient-records-emr-uhid-guide' },
      { label: 'ABDM & ABHA health ID for hospitals', href: '/guides/abdm-abha-health-id-hospitals-guide' },
      { label: 'Hospital management software', href: '/hospital-management-software' },
    ],
    updated: '2026-07-29',
  },

  'hospital-management-software': {
    slug: 'hospital-management-software',
    eyebrow: 'Hospital Management Software',
    metaTitle: 'Hospital Management Software (HMS) for India',
    description:
      'Uyirly is all-in-one cloud hospital management software for India — OPD, IPD, pharmacy, lab, radiology, billing, insurance and staff in one system. 30-day free trial, no card.',
    keywords: [
      'hospital management software',
      'hospital management system',
      'hms software',
      'hospital information system',
      'hospital management software india',
      'hospital erp software',
    ],
    primaryKeyword: 'hospital management software',
    h1: 'Hospital management software, the whole hospital in one system',
    subhead:
      'Uyirly runs OPD, IPD, pharmacy, lab, radiology, billing, insurance and staff on one cloud platform — so every department works from the same patient and the same bill, instead of a dozen disconnected registers.',
    heroBullets: [
      'OPD, IPD, pharmacy, lab, radiology and billing in one place',
      'One patient record and one bill across the hospital',
      'Insurance/TPA, blood bank, OT and emergency built in',
      'Cloud-based, ABDM-ready, NABH-friendly',
    ],
    sections: [
      {
        h2: 'One system beats a dozen registers',
        body:
          'A hospital run on separate registers and spreadsheets spends its day reconciling them — the pharmacy stock never matches the bill, the lab result never reaches the ward, the discharge waits while someone adds up charges by hand. Uyirly replaces that with one system where a patient registered once flows through consultation, admission, tests, medicines and billing without being re-entered anywhere.',
      },
      {
        h2: 'Every department, actually connected',
        body:
          'The value isn’t any single module — it’s that they share one patient and one bill. A test ordered in OPD reaches the lab; the result reaches the doctor; the medicine dispensed by pharmacy and the bed charged in IPD all land on the same running bill, ready at discharge.',
        bullets: [
          'OPD queue, IPD admission & bed management, discharge billing',
          'Pharmacy, lab (LIS), radiology (RIS), blood bank and OT',
          'Insurance/TPA claims, emergency triage, staff & payroll',
        ],
      },
      {
        h2: 'Billing that is ready at discharge',
        body:
          'The slowest moment in most hospitals is discharge, because the final bill is assembled by hand. In Uyirly the bill builds itself as care happens — bed charges accrue daily, consultations, tests, medicines and procedures post automatically — so the discharge bill and the insurance claim are ready, itemised and defensible, the moment the patient is cleared.',
      },
      {
        h2: 'Built for Indian hospitals',
        body:
          'Uyirly is made for how hospitals actually run in India — GST-ready billing, insurance and TPA cashless claims, ABDM/ABHA-ready records, and workflows that map to NABH expectations. It’s cloud-based with flat monthly pricing (no per-bed or per-user metering), so a small nursing home and a multi-specialty hospital run the same software.',
        bullets: [
          'GST-ready invoices and India insurance/TPA claim workflows',
          'ABDM/ABHA-ready records; NABH-friendly documentation',
          'Flat pricing, no per-bed fees; 30-day free trial, no card',
        ],
      },
    ],
    faqs: [
      {
        q: 'What is hospital management software?',
        a: 'Hospital management software (an HMS, sometimes called a hospital information system) is one system that runs a hospital’s day-to-day operations — patient registration, the OPD queue, IPD admissions and beds, pharmacy, lab, radiology, billing, insurance and staff — on a single shared patient record and bill, instead of separate registers for each department. Uyirly is a cloud HMS built for Indian hospitals.',
      },
      {
        q: 'How much does hospital management software cost in India?',
        a: 'Uyirly uses flat monthly pricing with no per-bed or per-user metering, starting from ₹2,999/month, plus a 30-day free trial with no credit card. See the pricing page for the current plans; the flat model means a small hospital and a large one pay for the plan they need, not for every bed or login.',
      },
      {
        q: 'Is it cloud-based, and does it work for small hospitals?',
        a: 'Yes. Uyirly is fully cloud-based — nothing to install, accessible on any device — and the same platform scales from a single clinic or nursing home up to a multi-specialty hospital, so small facilities run the same software the big ones do.',
      },
    ],
    related: [
      { label: 'What is a hospital management system?', href: '/guides/what-is-hospital-management-system' },
      { label: 'Hospital management software cost in India', href: '/guides/hospital-management-software-cost-india' },
      { label: 'Best hospital management software in India', href: '/best-hospital-management-software-in-india' },
      { label: 'Pricing', href: '/pricing' },
    ],
    updated: '2026-07-29',
  },

  // ── Phase 2 — buyer-modifier / intent variants ────────────────────────────
  'best-hospital-management-software-in-india': {
    slug: 'best-hospital-management-software-in-india',
    eyebrow: 'Buyer’s Guide',
    metaTitle: 'Best Hospital Management Software in India (2026)',
    description:
      'How to choose the best hospital management software in India — what to look for, red flags to avoid, and why Uyirly fits Indian hospitals: GST, TPA, ABDM, flat pricing.',
    keywords: [
      'best hospital management software in india',
      'best hospital management software india',
      'top 10 hospital management software in india',
      'best hospital software in india',
      'best hms software in india',
    ],
    primaryKeyword: 'best hospital management software in india',
    h1: 'Best hospital management software in India: how to choose',
    subhead:
      'Every vendor claims to be the best. The useful question is which system fits how Indian hospitals actually run — GST billing, TPA claims, ABDM records and pricing that won’t punish you for growing. Here’s what to weigh, and where Uyirly lands.',
    heroBullets: [
      'What genuinely matters when comparing HMS vendors',
      'The red flags that cost hospitals later',
      'Why India-specific fit beats a longer feature list',
      'A free trial so you judge on your own hospital, not a demo',
    ],
    sections: [
      {
        h2: 'Judge integration, not the feature count',
        body:
          'Every HMS lists the same modules. What separates the best from the rest is whether those modules truly share one patient and one bill, or just sit in the same login. Test it directly: register a patient, order a lab test from a consultation, dispense a medicine, and see whether it all lands on one bill at discharge without re-entry. If it does, the software will save your staff time every day. If it doesn’t, a long feature list won’t help.',
      },
      {
        h2: 'India-fit is not optional',
        body:
          'A hospital in India lives with GST rules, insurance and TPA cashless claims, ABDM/ABHA records and NABH expectations. Software built abroad or for a different market forces workarounds on all four. The best choice for an Indian hospital is one where these are native, not bolted on.',
        bullets: [
          'GST-ready billing and India insurance/TPA claim workflows',
          'ABDM/ABHA-ready records for the national health mission',
          'NABH-friendly documentation and audit trails',
        ],
      },
      {
        h2: 'Watch the pricing model, not just the price',
        body:
          'Per-bed and per-user pricing looks cheap on day one and punishes you the moment you grow — every new bed, every new login raises the bill. Flat monthly pricing aligns the vendor with your growth instead of taxing it. Ask exactly what triggers a higher fee before you sign.',
      },
      {
        h2: 'Where Uyirly fits',
        body:
          'Uyirly is an all-in-one cloud HMS built for Indian hospitals: OPD, IPD, pharmacy, lab, radiology, billing, insurance, blood bank, OT and staff on one shared record and bill, with GST, TPA, ABDM and NABH handled natively and flat monthly pricing with no per-bed fees. The honest way to judge it against any list of “top 10” is a free trial on your own hospital.',
        bullets: [
          'One patient and one bill across every department',
          'Flat pricing from ₹2,999/mo, no per-bed or per-user metering',
          '30-day free trial, no credit card — judge it on real work',
        ],
      },
    ],
    faqs: [
      {
        q: 'Which is the best hospital management software in India?',
        a: 'There is no single “best” for every hospital — the right choice depends on your size, specialties and budget. What matters is fit: a system where modules truly share one patient and one bill, that handles GST, insurance/TPA, ABDM and NABH natively, and prices flatly rather than per bed. Uyirly is built specifically for Indian hospitals on all of these, and offers a 30-day free trial so you can judge it on your own workflows rather than a sales demo.',
      },
      {
        q: 'How do I compare hospital management software vendors?',
        a: 'Run the same real scenario through each: register a patient, order a test from a consultation, dispense a medicine, and reach discharge with an itemised bill and an insurance claim ready. Whichever system does that without re-entering the patient or hand-totalling the bill is the one that will save your staff time every day. Feature lists all look similar; integration is where they differ.',
      },
      {
        q: 'Is cheaper hospital software better for a small hospital?',
        a: 'Cheapest on day one is often the most expensive later — per-bed and per-user pricing rises every time you add a bed or a login. For a small hospital, flat monthly pricing on a platform that can scale up (so you never have to migrate) usually wins over a cheap tool you outgrow.',
      },
    ],
    related: [
      { label: 'Hospital management software', href: '/hospital-management-software' },
      { label: 'Hospital management software cost in India', href: '/guides/hospital-management-software-cost-india' },
      { label: 'Pricing', href: '/pricing' },
    ],
    updated: '2026-07-29',
  },

  'cloud-based-hospital-management-system': {
    slug: 'cloud-based-hospital-management-system',
    eyebrow: 'Cloud HMS',
    metaTitle: 'Cloud-Based Hospital Management System | Uyirly',
    description:
      'Uyirly is a cloud-based hospital management system — nothing to install, access from any device, automatic backups and updates, and pay-monthly pricing. 30-day free trial.',
    keywords: [
      'cloud based hospital management system',
      'cloud based hospital management software',
      'saas hospital management system',
      'online hospital management software',
      'web based hospital management system',
    ],
    primaryKeyword: 'cloud based hospital management system',
    h1: 'A cloud-based hospital management system, nothing to install',
    subhead:
      'Uyirly runs your whole hospital in the cloud — reachable from any device, backed up automatically, updated for you, and paid monthly instead of a heavy one-time server purchase.',
    heroBullets: [
      'No server to buy, install or maintain',
      'Access from any device, any location, in real time',
      'Automatic backups and security updates',
      'Pay monthly — turn a big capital cost into a small operating one',
    ],
    sections: [
      {
        h2: 'Why cloud beats an on-premise server',
        body:
          'An on-premise hospital system means buying a server, paying someone to maintain it, and losing access the moment that machine or your local network fails. A cloud-based system removes all of that: Uyirly runs on managed infrastructure, so there is nothing to install, nothing to patch, and the software is reachable from the front desk, the ward, the doctor’s home or a second branch alike.',
      },
      {
        h2: 'Your data is safer in the cloud, not riskier',
        body:
          'The common worry is that the cloud is less secure — in practice it is usually the opposite. A single clinic PC gets stolen, corrupted or ransomwared with no backup. Uyirly keeps data on managed infrastructure with automatic backups, encryption and role-based access, and every access is audit-logged, aligned with India’s DPDP Act expectations.',
        bullets: [
          'Automatic backups — no lost data when a local machine dies',
          'Encryption and role-based access control',
          'Audit logging aligned with India’s DPDP data-protection rules',
        ],
      },
      {
        h2: 'One record across branches and devices',
        body:
          'Because the system lives in the cloud, a multi-branch hospital or a doctor moving between OPD and the ward all read from the same live patient record — no syncing local databases, no “which PC has the latest version”. Add a branch and it’s on the same system the same day.',
      },
      {
        h2: 'Pay monthly, start today',
        body:
          'Cloud turns a large one-time server-and-licence purchase into a small predictable monthly cost, and you can start immediately — sign up, and the hospital is live without procurement or installation. Uyirly is flat monthly pricing with a 30-day free trial and no credit card.',
      },
    ],
    faqs: [
      {
        q: 'Is a cloud-based hospital management system safe?',
        a: 'Generally safer than a single on-premise PC. A local machine can be stolen, corrupted or hit by ransomware with no backup; a cloud system like Uyirly keeps data on managed infrastructure with automatic backups, encryption, role-based access and audit logging, aligned with India’s DPDP Act expectations.',
      },
      {
        q: 'Does it need the internet to work?',
        a: 'A cloud system needs a working internet connection, which most hospitals now have as standard. The trade-off is worth it: no server to buy or maintain, access from any device or branch, automatic backups and updates, and the ability to start the same day without installation.',
      },
      {
        q: 'How is cloud pricing different from buying hospital software?',
        a: 'Traditional on-premise software is a large one-time purchase plus server and maintenance costs. A cloud/SaaS system like Uyirly is a predictable monthly fee that includes hosting, backups and updates — turning a big capital expense into a small operating one, with a 30-day free trial to start.',
      },
    ],
    related: [
      { label: 'Hospital management software', href: '/hospital-management-software' },
      { label: 'Data security & the DPDP Act', href: '/guides/hospital-software-data-security-dpdp' },
      { label: 'Pricing', href: '/pricing' },
    ],
    updated: '2026-07-29',
  },
}

export function solutionSlugs(): string[] {
  return Object.keys(SOLUTIONS)
}

export function getSolution(slug: string): SolutionMeta | undefined {
  return SOLUTIONS[slug]
}

const SITE = 'https://uyirly.com'

export function solutionMetadata(slug: string): Metadata {
  const meta = SOLUTIONS[slug]
  if (!meta) return {}
  const url = `${SITE}/${meta.slug}`
  const title = `${meta.metaTitle} | Uyirly`
  return {
    title,
    description: meta.description,
    keywords: meta.keywords,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: meta.description,
      url,
      siteName: 'Uyirly',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: meta.description,
    },
  }
}
