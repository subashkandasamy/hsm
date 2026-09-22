import type { Metadata } from 'next'

// Commercial "solution" landing pages — the buyer-intent counterpart to /guides.
// Each entry is one top-level page (e.g. /lab-management-software) built to rank
// for a high-volume, low-competition, buyer-intent keyword cluster and convert to
// a free-trial signup. Content lives here (single source of truth); the route
// folder under src/app/<slug>/ is a thin wrapper around <SolutionShell slug=… />,
// and the /solutions hub lists every entry grouped by `group`.

// Rich body text supports simple inline markup: [label](/href) for internal
// links (keyword anchors) and **bold** for emphasis. Everything else is plain.
export interface SolutionSubsection {
  h3: string
  body: string
  bullets?: string[]
}

export interface SolutionStep {
  title: string
  body: string
}

export interface SolutionTable {
  caption?: string
  headers: string[]
  rows: string[][]
}

export interface SolutionSection {
  h2: string
  body: string
  bullets?: string[]
  /** Deeper H3 blocks under this section. */
  subsections?: SolutionSubsection[]
  /** Numbered how-to steps. */
  steps?: SolutionStep[]
  /** A comparison / feature table. */
  table?: SolutionTable
  /** An on-brand product preview mockup: 'dashboard' | 'bill' | 'opd'. */
  preview?: string
}

export interface SolutionMeta {
  slug: string
  /** Chip above the H1, e.g. "Lab Management Software". */
  eyebrow: string
  /** Grouping label used by the /solutions hub. */
  group: string
  /** One clean human line for the /solutions hub card. */
  tagline: string
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
  /** Optional small-print note (e.g. trademark / neutrality on comparison pages). */
  disclaimer?: string
  updated: string // YYYY-MM-DD
}

const GROUP_SOFTWARE = 'Software for your hospital'
const GROUP_BUYING = 'Choosing & buying'
const GROUP_SPECIALTY = 'By specialty & facility'
const GROUP_MODULE = 'Department software'
const GROUP_COMPARE = 'Compare & alternatives'

const TM = (brand: string) =>
  `${brand} is a trademark of its respective owner and is not affiliated with or endorsed by Uyirly. This page is an independent comparison based on Uyirly’s own capabilities; please verify any other product’s current features and pricing with them directly.`

export const SOLUTIONS: Record<string, SolutionMeta> = {
  'lab-management-software': {
    slug: 'lab-management-software',
    eyebrow: 'Lab Management Software',
    group: GROUP_SOFTWARE,
    tagline: 'Run a diagnostic lab or hospital pathology department — samples, tests, reports and billing on one LIMS.',
    metaTitle: 'Lab Management Software (LIMS) for Indian Labs',
    description:
      'Uyirly is cloud lab management software (LIMS) for Indian diagnostic labs and hospital pathology — sample tracking, test catalogue, automated reports and billing. Free trial.',
    keywords: [
      'lab management software',
      'laboratory information management system',
      'lims software',
      'laboratory management system',
      'lab management system',
      'pathology lab software',
      'lis system',
      'diagnostic lab software',
      'lab billing software',
      'pathology software',
    ],
    primaryKeyword: 'lab management software',
    h1: 'Lab management software built for Indian labs',
    subhead:
      'Uyirly is a cloud laboratory information management system (LIMS) that runs your diagnostic lab or hospital pathology department end to end — from the moment a sample is collected to the moment a verified report reaches the patient — with billing and patient records already connected. It’s the same lab management system a standalone pathology lab and a busy hospital lab can both run.',
    heroBullets: [
      'Sample tracking from collection to verified result, no lost tubes',
      'Test catalogue with reference ranges, panels and per-test pricing',
      'Auto-formatted PDF reports, delivered by WhatsApp or patient portal',
      'Lab billing and patient records built in — nothing re-entered',
    ],
    sections: [
      {
        h2: 'What is lab management software (LIMS)?',
        body:
          'Lab management software — a laboratory information management system (LIMS), or LIS when people mean the clinical-lab version — runs a diagnostic lab or hospital pathology department end to end. It exists to make one thing impossible: a sample getting lost, or a result reaching the wrong patient. [Uyirly](/hospital-management-software) gives every sample a barcoded identity the instant it is collected, then tracks it through accessioning, testing and verification, so at any moment you know exactly where a test is and who touched it. That living audit trail is the one thing a paper register or an Excel sheet can never give a lab.',
        bullets: [
          'Sample tracking from collection to verified result — no lost tubes',
          'Test catalogue with reference ranges, panels and per-test pricing',
          'Auto-formatted PDF reports, delivered by WhatsApp or portal',
          'Lab billing and patient records built in — nothing re-entered',
        ],
      },
      {
        h2: 'What runs inside the lab module',
        body:
          'Everything a lab needs is in one place, and it all reads from the same test master and the same patient record.',
        preview: 'lab',
        subsections: [
          {
            h3: 'Sample tracking',
            body:
              'Most of a lab’s real risk sits between collection and result — the tube that gets mislabelled, the sample nobody logged. Uyirly follows each specimen by barcode through every stage, flags anything overdue, and ties the final value back to the exact tube it came from. Technicians stop hunting for samples and start clearing the worklist.',
          },
          {
            h3: 'The test catalogue',
            body:
              'Every test carries its reference ranges, units, sample type, method and price, and tests bundle into panels, profiles and health packages. After that, ordering, reporting and billing all read from the same definition — so a CBC or an LFT is priced, collected and reported the same way every time.',
          },
          {
            h3: 'Result entry and verification',
            body:
              'Technicians enter values against the reference ranges, which flag high and low results automatically, and a pathologist verifies before anything is released. Nothing goes out unsigned.',
          },
          {
            h3: 'Reports and delivery',
            body:
              'The moment a value is verified, Uyirly formats it into a clean, letterhead PDF — ranges in place, the verifying pathologist named — and delivers it over WhatsApp or a patient portal. No second trip for a printout.',
          },
          {
            h3: 'Lab billing',
            body:
              'Walk-in patients are billed in one screen, and tests ordered from a consultation post to the patient’s existing bill — so the money and the tests never drift apart.',
          },
        ],
      },
      {
        h2: 'The order-to-report workflow',
        body:
          'Here is a test’s full journey through Uyirly — the same [lab workflow](/guides/lab-lis-workflow-guide) whether it is a walk-in or a ward order.',
        steps: [
          { title: 'Order', body: 'A doctor orders the test from a consultation, or a walk-in customer is registered and billed at the counter.' },
          { title: 'Collect', body: 'The sample is collected and barcoded, so it can never be mixed up with another patient’s.' },
          { title: 'Process', body: 'The lab enters results against reference ranges on a live worklist that shows what is pending, in process and done.' },
          { title: 'Verify', body: 'A pathologist checks and signs off. Only verified results are released.' },
          { title: 'Deliver', body: 'The letterhead PDF report goes to the patient by WhatsApp or portal, and the charge is already on the bill.' },
        ],
      },
      {
        h2: 'A LIMS vs a paper / Excel lab',
        body:
          'Here is what changes the day a lab moves off registers and spreadsheets.',
        table: {
          headers: ['', 'Paper / Excel lab', 'With Uyirly LIMS'],
          rows: [
            ['Samples', 'Handwritten labels, easy to mix up', 'Barcoded, tracked at every step'],
            ['Worklist', 'No live view of what is pending', 'Live pending / in-process / verified'],
            ['Reference ranges', 'Checked by memory', 'High/low flagged automatically'],
            ['Reports', 'Typed by hand', 'Auto-formatted letterhead PDF'],
            ['Delivery', 'Patient returns for a printout', 'WhatsApp / patient portal'],
            ['Billing', 'Separate register', 'On the patient’s bill automatically'],
          ],
        },
      },
      {
        h2: 'From a single pathology lab to a full hospital lab',
        body:
          'A standalone diagnostic lab uses Uyirly for walk-in registration, sample tracking, reporting and billing on its own. A [hospital](/hospital-management-software) pathology department uses the very same lab management system inside the wider platform, so tests ordered from the wards and OPD flow in without re-registering the patient and every charge lands on the patient’s bill. You do not outgrow it — the lab you set up today is the lab that scales.',
      },
    ],
    faqs: [
      {
        q: 'What is the difference between LIMS and LIS?',
        a: 'They overlap heavily. A LIS (laboratory information system) is the clinical-lab term for the system that manages patient samples, orders and results in a diagnostic or hospital lab; LIMS (laboratory information management system) is the broader term, also used in research and industrial labs. For an Indian diagnostic lab or hospital pathology department the two words describe the same thing Uyirly provides: sample tracking, a test catalogue, result entry, reporting and billing.',
      },
      {
        q: 'Can it work for a standalone diagnostic lab as well as a hospital lab?',
        a: 'Yes. A standalone pathology or diagnostic lab uses it for walk-in registration, sample tracking, reporting and billing on its own. A hospital lab uses the same module inside the full system, so tests ordered from OPD and IPD flow in without re-registering the patient and charges join the patient’s bill.',
      },
      {
        q: 'Does the lab software handle report delivery to patients?',
        a: 'Yes. Verified results are formatted into a letterhead PDF automatically and can be delivered by WhatsApp or a patient portal, so patients get their reports without a second trip to the lab.',
      },
      {
        q: 'Does it include lab billing?',
        a: 'Yes. Lab billing is built in — walk-in patients are billed in one screen, and tests ordered from a consultation post to the patient’s existing bill, so the money and the tests never drift apart.',
      },
    ],
    related: [
      { label: 'How a lab LIS workflow actually works', href: '/guides/lab-lis-workflow-guide' },
      { label: 'Hospital management software', href: '/hospital-management-software' },
      { label: 'Radiology information system (RIS)', href: '/radiology-information-system-software' },
      { label: 'Pricing', href: '/pricing' },
    ],
    updated: '2026-08-04',
  },

  'clinic-management-software': {
    slug: 'clinic-management-software',
    eyebrow: 'Clinic Management Software',
    group: GROUP_SOFTWARE,
    tagline: 'Appointments, the OPD queue, prescriptions, billing and pharmacy — the whole clinic on one screen.',
    metaTitle: 'Clinic Management Software for Indian Clinics',
    description:
      'Uyirly is cloud clinic management software for Indian clinics — appointments, OPD queue, prescriptions, billing, pharmacy and patient records in one system. 30-day free trial.',
    keywords: [
      'clinic management software',
      'clinic management system',
      'clinic software',
      'best clinic management software',
      'clinic management software free',
      'doctor clinic software',
      'polyclinic software',
      'clinic software india',
      'opd management software',
    ],
    primaryKeyword: 'clinic management software',
    h1: 'Clinic management software that runs the whole clinic',
    subhead:
      'Appointments, the OPD queue, prescriptions, billing and the clinic pharmacy — Uyirly is clinic management software that puts everything a busy clinic touches on one cloud system, so the front desk, the doctor and the pharmacy all work from the same patient. It fits a single-doctor clinic and scales to a multi-doctor polyclinic without changing anything.',
    heroBullets: [
      'Online appointments and a live OPD token queue',
      'Prescriptions from a drug list, reusable across visits',
      'One-screen billing with GST-ready invoices',
      'A shared patient history every doctor in the clinic can see',
    ],
    sections: [
      {
        h2: 'What is clinic management software?',
        body:
          'Clinic management software is one system that runs your whole clinic — appointments, the OPD queue, doctor consultations, prescriptions, billing and the clinic pharmacy — on a single shared patient record. The everyday problem in a paper clinic is that the front desk, the doctor and the pharmacy each keep their own version of the patient. Good clinic software keeps exactly one. Nothing is re-typed, nothing is lost between the desk and the doctor, and the clinic runs off one source of truth instead of three registers.',
        bullets: [
          'Online appointments and a live token queue',
          'Doctor consultation notes, diagnoses and prescriptions',
          'One-screen billing with GST-ready invoices',
          'A clinic pharmacy that dispenses against the prescription',
          'A shared patient history every doctor can see',
        ],
      },
      {
        h2: 'Everything your clinic runs, on one screen',
        body:
          '[Uyirly](/) puts every part of a busy clinic in one place. It fits a single-doctor clinic and scales to a multi-doctor polyclinic without changing anything. Here is what runs inside it.',
        preview: 'opd',
        subsections: [
          {
            h3: 'Appointments and the token queue',
            body:
              'Patients book online, and walk-ins get a token — both land in one ordered [OPD queue](/guides/opd-queue-token-management-guide) that the front desk and the doctor share. Patients are called in fair order, and the doctor’s worklist updates live as people arrive and finish. Repeat patients are found instantly by phone number or UHID.',
          },
          {
            h3: 'Consultation and prescriptions',
            body:
              'The doctor writes notes, diagnosis and a prescription on screen, choosing medicines from a drug list. For a returning patient, a past prescription can be reused in a couple of taps — no re-writing the same regimen every visit.',
          },
          {
            h3: 'Billing and GST invoices',
            body:
              'The consultation charge, any procedures and the pharmacy items all land on one bill, and the clinic prints a GST-ready invoice. The money always matches what was actually done in the consultation.',
          },
          {
            h3: 'The clinic pharmacy',
            body:
              'The prescription flows straight to the clinic [pharmacy](/pharmacy-management-software), which dispenses against it, tracks stock and expiry, and adds the charge to the same patient bill. The medicine and the money stay in one place.',
          },
          {
            h3: 'One shared patient history',
            body:
              'Because every visit hangs on one patient record, any doctor opens a patient and sees the full history — past complaints, prescriptions, lab results and bills — instead of flipping through an OPD card. For a polyclinic, a patient moving between specialists carries their record with them.',
          },
        ],
      },
      {
        h2: 'How to get your clinic online in a day',
        body:
          'There is nothing to install and no server to buy. Most clinics are seeing patients on Uyirly the same day they sign up.',
        steps: [
          { title: 'Start your free trial', body: 'Sign up on [uyirly.com](/signup) with your clinic name and mobile number — no credit card needed.' },
          { title: 'Add your doctors and front desk', body: 'Invite your team so they can log in, each with the right access.' },
          { title: 'Add your services and medicines', body: 'Set your consultation fees, add common medicines to the pharmacy, and you are ready to bill.' },
          { title: 'See your first patient', body: 'Register a patient, run the token queue, write a prescription and print the bill — all in one flow.' },
        ],
      },
      {
        h2: 'Clinic software vs a paper clinic',
        body:
          'Here is what changes the day you move a clinic from registers to Uyirly.',
        table: {
          headers: ['Everyday task', 'Paper clinic', 'With Uyirly'],
          rows: [
            ['Finding a repeat patient', 'Search the OPD card box', 'Found by phone/UHID in seconds'],
            ['The waiting room', 'Whoever asks loudest', 'A fair, live token queue'],
            ['Prescriptions', 'Re-written every visit', 'Reused in a couple of taps'],
            ['Billing', 'Hand-written, no GST', 'One-screen GST invoice'],
            ['Pharmacy stock', 'Guesswork', 'Tracked with expiry alerts'],
            ['Patient history', 'Scattered across cards', 'One timeline every doctor sees'],
          ],
        },
      },
      {
        h2: 'Is there free clinic management software?',
        body:
          'Plenty of tools advertise “free clinic management software”, and the catch is usually the same — free until you have real patients, then a per-user or per-patient meter starts running. Uyirly takes the honest version of free: a **30-day free trial with no credit card**, so you can run your actual front desk, consultations and billing before paying anything. After that it is a flat monthly plan, not a fee that grows every time you add a patient or a login. See [pricing](/pricing) for details.',
      },
      {
        h2: 'Starts as a clinic, grows into a hospital',
        body:
          'A clinic that adds beds, a lab, or a second and third doctor should not have to switch software and re-enter its patients. Uyirly is the same platform that runs [full hospitals](/hospital-management-software) — OPD, IPD, pharmacy, lab, billing and staff — so the clinic you set up today extends into admissions, diagnostics and multiple doctors without a migration. It also fits [dental clinics](/dental-clinic-software) and [nursing homes](/nursing-home-management-software) on the same system.',
        bullets: [
          'Add a lab, pharmacy or beds without changing systems',
          'Multi-doctor and multi-location on one patient database',
          'Cloud-based — nothing to install, works on any device',
        ],
      },
    ],
    faqs: [
      {
        q: 'Is there a free version of the clinic management software?',
        a: 'Uyirly offers a 30-day free trial with no credit card, so a clinic can run its real front desk, consultations and billing before paying anything. After the trial it moves to a flat monthly plan with no per-user or per-patient metering, which is usually cheaper in practice than “free” tools that charge as you grow. See [pricing](/pricing).',
      },
      {
        q: 'Does it work for a single-doctor clinic?',
        a: 'Yes. A single-doctor clinic uses it for appointments, the token queue, prescriptions and billing on one screen. Because it is the same platform that runs multi-doctor clinics and polyclinics, the same setup extends when you add a second doctor, a pharmacy or a lab.',
      },
      {
        q: 'Can the clinic pharmacy be billed in the same system?',
        a: 'Yes. The prescription a doctor writes flows to the clinic pharmacy, which dispenses against it and adds the charge to the same patient bill — so the consultation, the medicine and the money all stay in one place.',
      },
      {
        q: 'How long does it take to set up a clinic?',
        a: 'Most clinics are up and running the same day. You sign up, add your doctors and front desk, set your fees and common medicines, and register your first patient. There is nothing to install because it is cloud-based.',
      },
      {
        q: 'Is the clinic software cloud-based?',
        a: 'Yes. Uyirly is fully cloud-based — there is nothing to install, it works on any device, your data is stored in India and backed up automatically. You can sign up and start seeing patients the same day.',
      },
    ],
    related: [
      { label: 'OPD queue & token management explained', href: '/guides/opd-queue-token-management-guide' },
      { label: 'Hospital management software', href: '/hospital-management-software' },
      { label: 'Dental clinic software', href: '/dental-clinic-software' },
      { label: 'Electronic medical records (EMR)', href: '/electronic-medical-records-software' },
      { label: 'Pricing', href: '/pricing' },
    ],
    updated: '2026-08-04',
  },

  'electronic-medical-records-software': {
    slug: 'electronic-medical-records-software',
    eyebrow: 'EMR / EHR Software',
    group: GROUP_SOFTWARE,
    tagline: 'One lifelong patient record across every visit and department — EMR/EHR that’s ABDM/ABHA-ready.',
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
      'patient records software',
      'emr ehr software',
    ],
    primaryKeyword: 'electronic medical records software',
    h1: 'Electronic medical records, one lifelong patient history',
    subhead:
      'Uyirly’s electronic medical records software keeps a single record for each patient across every visit and every department — consultations, admissions, lab, radiology, pharmacy and billing — instead of scattered files that never meet. It’s a full EMR inside your hospital and an ABDM/ABHA-ready EHR that can link to a patient’s national health account.',
    heroBullets: [
      'One UHID that unifies a patient’s whole history',
      'Consultations, labs, scans and medicines on one timeline',
      'ABDM/ABHA-ready for India’s digital health mission',
      'Cloud-based, role-based access, fully audit-logged',
    ],
    sections: [
      {
        h2: 'What is EMR / EHR software?',
        body:
          'Electronic medical records software keeps a patient’s medical history in digital form instead of on paper. It answers one question instantly: what has happened to this patient before? [Uyirly](/hospital-management-software) gives every patient a single UHID (a unique hospital ID) and hangs everything on it — each OPD consultation, each admission, every lab result and scan, every prescription and bill. A doctor opening the record sees the whole history on one timeline, not a folder someone has to reassemble. That is the difference between a real EMR and a pile of scanned paper.',
        bullets: [
          'One UHID that unifies a patient’s whole history',
          'Consultations, vitals, labs, scans and medicines on one timeline',
          'ABDM/ABHA-ready for India’s digital health mission',
          'Cloud-based, role-based access, fully audit-logged',
        ],
      },
      {
        h2: 'EMR vs EHR — and why it matters in India',
        body:
          'People use the two terms loosely, but there is a simple difference. An **EMR** (electronic medical record) is the record within one hospital. An **EHR** (electronic health record) is designed to follow the patient between providers. India’s [ABDM](/guides/abdm-abha-health-id-hospitals-guide) — the Ayushman Bharat Digital Mission — is building exactly that portability through the ABHA health ID. Uyirly is built for both: a complete EMR inside your facility, and ABDM/ABHA-ready so records can link to a patient’s national health account instead of staying locked in one building.',
        table: {
          headers: ['', 'EMR', 'EHR'],
          rows: [
            ['Scope', 'One hospital or clinic', 'Follows the patient everywhere'],
            ['Owner', 'The facility', 'The patient (via ABHA)'],
            ['In India', 'Your day-to-day record', 'Linked through ABDM/ABHA'],
            ['Uyirly', 'Full EMR built in', 'ABDM/ABHA-ready'],
          ],
        },
      },
      {
        h2: 'What is inside a Uyirly medical record',
        body:
          'A record is only useful if you can find things in it later. Uyirly captures everything as structured data attached to the visit — searchable and visible at a glance, not buried in free text.',
        subsections: [
          {
            h3: 'Patient profile and UHID',
            body:
              'Name, age, contact, allergies and a single UHID that ties every visit together — so a returning patient is found in seconds and never registered twice.',
          },
          {
            h3: 'Consultations and vitals',
            body:
              'Every OPD and IPD visit records complaints, vitals, diagnosis and notes, so the doctor sees past visits and trends instead of leafing through old sheets.',
          },
          {
            h3: 'Prescriptions and medication history',
            body:
              'Each prescription is saved to the timeline, so a doctor sees the full medication history and can reuse a past prescription in a couple of taps.',
          },
          {
            h3: 'Lab and radiology results',
            body:
              'Results from the [lab](/lab-management-software) and [radiology](/radiology-information-system-software) attach to the same record, so a trend in a lab value is visible at a glance.',
          },
          {
            h3: 'Documents and bills',
            body:
              'Scanned documents, discharge summaries and every bill sit on the same timeline — the whole patient in one place.',
          },
        ],
      },
      {
        h2: 'How the record builds itself',
        body:
          'The best part of a connected EMR is that nobody has to keep it up to date by hand — it fills in as you run the hospital.',
        steps: [
          { title: 'Register once', body: 'The patient is registered with a UHID. Every future visit attaches to it automatically.' },
          { title: 'Consult and prescribe', body: 'The doctor’s notes, diagnosis and prescription save to the timeline as they work.' },
          { title: 'Order tests', body: 'A lab test or scan ordered from the consultation writes its result back to the same record.' },
          { title: 'Dispense and bill', body: 'Medicines and charges post to the record on their own — so it stays complete with zero re-entry.' },
        ],
      },
      {
        h2: 'One record, safely shared',
        body:
          'A shared record is only safe if access is controlled. Uyirly is role-based — a receptionist, a doctor, a lab technician and an accountant each see exactly what their job needs — and every view and change is audit-logged. The record is one; who can read and edit which part of it is not. That combination makes it both useful across the hospital and defensible under India’s [DPDP data-protection rules](/guides/hospital-software-data-security-dpdp), with data stored in India.',
        bullets: [
          'Role-based access for reception, doctors, lab, pharmacy and accounts',
          'Every view and edit audit-logged',
          'Data stored in India, aligned with the DPDP Act',
        ],
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
      {
        q: 'Can it replace our paper files and scanned records?',
        a: 'Yes. Uyirly captures consultations, vitals, prescriptions and lab/radiology results as structured digital records on one patient timeline, and lets you attach scanned documents where needed — so the everyday record lives in the system and old paper doesn’t have to be leafed through.',
      },
    ],
    related: [
      { label: 'Patient records, EMR & UHID explained', href: '/guides/patient-records-emr-uhid-guide' },
      { label: 'ABDM & ABHA health ID for hospitals', href: '/guides/abdm-abha-health-id-hospitals-guide' },
      { label: 'Hospital management software', href: '/hospital-management-software' },
      { label: 'Clinic management software', href: '/clinic-management-software' },
      { label: 'Pricing', href: '/pricing' },
    ],
    updated: '2026-08-04',
  },

  'hospital-management-software': {
    slug: 'hospital-management-software',
    eyebrow: 'Hospital Management Software',
    group: GROUP_SOFTWARE,
    tagline: 'The whole hospital — OPD, IPD, pharmacy, lab, billing, insurance and staff — on one cloud system.',
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
      'hospital software',
      'his software',
    ],
    primaryKeyword: 'hospital management software',
    h1: 'Hospital management software, the whole hospital in one system',
    subhead:
      'Uyirly is all-in-one hospital management software that runs OPD, IPD, pharmacy, lab, radiology, billing, insurance and staff on one cloud platform — so every department works from the same patient and the same bill, instead of a dozen disconnected registers. It’s a complete hospital information system built for how hospitals actually run in India.',
    heroBullets: [
      'OPD, IPD, pharmacy, lab, radiology and billing in one place',
      'One patient record and one bill across the whole hospital',
      'Insurance/TPA, blood bank, OT and emergency built in',
      'Cloud-based, ABDM-ready and NABH-friendly',
    ],
    sections: [
      {
        h2: 'What is hospital management software?',
        body:
          'Hospital management software is one system that runs your whole hospital in a single place. It is also called a hospital management system, an HMS, or a hospital information system. Instead of keeping a separate register or spreadsheet for the front desk, the OPD queue, IPD beds, the pharmacy, the lab, billing and staff, you keep everything in one place — and every part talks to the others. A patient is registered once, and that same record then moves through consultation, admission, tests, medicines and the final bill. Nobody re-types the patient’s name at each step.',
        bullets: [
          'Patient registration and a lifelong UHID for every patient',
          'OPD appointments, token queue and doctor consultation notes',
          'IPD admission, bed and ward management, and discharge',
          'Pharmacy, laboratory (LIS) and radiology (RIS)',
          'Billing, GST invoices and insurance / TPA claims',
          'Blood bank, operation theatre, emergency, inventory and staff / HR',
        ],
      },
      {
        h2: 'Why a hospital needs it (the problem it solves)',
        body:
          'A hospital that runs on paper registers and spreadsheets spends half its day just checking one against another. The pharmacy stock does not match the bill. A lab result is ready but never reaches the ward. A discharge is stuck for an hour while someone adds up the charges by hand. Money quietly leaks out through charges that were given but never billed. **Hospital management software fixes this by giving every department one shared patient and one shared bill** — so there is only ever one set of numbers to trust.',
        bullets: [
          'No double entry — register the patient once, use it everywhere',
          'No lost charges — every test, medicine and bed charge is captured',
          'No waiting at discharge — the bill is already ready',
          'No guesswork — owners see live revenue, footfall and stock',
        ],
      },
      {
        h2: 'What Uyirly’s hospital management software includes',
        body:
          '[Uyirly](/) is a complete, cloud-based hospital management system built for Indian hospitals, nursing homes and clinics. Here is what runs inside it, department by department. Every module below shares the same patient and the same bill, so nothing is an island.',
        preview: 'opd',
        subsections: [
          {
            h3: 'OPD, appointments and the token queue',
            body:
              'Book appointments, run a live [OPD token queue](/guides/opd-queue-token-management-guide), and let doctors write consultation notes, diagnoses and prescriptions on screen. Patients move from the front desk to the doctor to the pharmacy without a paper slip going missing.',
          },
          {
            h3: 'IPD, wards and bed management',
            body:
              'Admit a patient, allot a bed, move them between wards, and track everything until discharge. [IPD bed management](/guides/ipd-admission-bed-management-guide) shows which beds are free at a glance, and daily bed charges are added to the bill automatically.',
          },
          {
            h3: 'Pharmacy',
            body:
              '[Pharmacy management](/pharmacy-management-software) handles stock, batches, expiry and billing. Dispense against a prescription, bill it to the patient’s running total, and get low-stock and near-expiry alerts before a medicine runs out or goes bad.',
          },
          {
            h3: 'Laboratory and radiology',
            body:
              'Order lab tests and scans straight from the doctor’s screen. The [lab (LIS)](/lab-management-software) and [radiology (RIS)](/radiology-information-system-software) modules track each sample and scan, capture results, and send the report back to the doctor and the patient — with the charge already on the bill.',
          },
          {
            h3: 'Billing, GST and insurance',
            body:
              'The [billing module](/guides/ipd-billing-software-explained) builds the bill as care happens, prints GST-ready invoices, and handles [insurance and TPA cashless claims](/guides/health-insurance-tpa-claims-guide) — pre-authorisation, claim and settlement — so the paperwork does not hold up a discharge.',
          },
          {
            h3: 'Blood bank, OT, emergency, inventory and staff',
            body:
              'The same system also runs the [blood bank](/blood-bank-management-software), [operation theatre scheduling](/operation-theatre-management-software), emergency triage, general inventory and purchase orders, and staff attendance, rosters and payroll — so the whole hospital is on one login.',
          },
        ],
      },
      {
        h2: 'How everything stays connected — one patient, one bill',
        body:
          'The real value is not any single module. It is that they all share the same patient and the same bill. A test ordered in OPD reaches the lab on its own. The result reaches the doctor. The medicine the pharmacy gives out and the bed the patient sleeps in both land on the same running bill, ready at discharge. That is the difference between a true hospital information system and a set of separate tools that only share a password. In Uyirly, the discharge bill and the insurance claim are itemised and ready the moment the patient is cleared — faster discharges, fewer disputes, and no revenue leaking through charges nobody remembered to add.',
        preview: 'bill',
      },
      {
        h2: 'How to get your hospital live on Uyirly',
        body:
          'Uyirly is cloud-based, so there is nothing to install and nothing to buy upfront. Most hospitals are up and running the same day. Here is the full path from sign-up to seeing your first patient:',
        steps: [
          { title: 'Start your free trial', body: 'Sign up on [uyirly.com](/signup) with your hospital name and mobile number. Your hospital gets its own private, secure workspace right away — no credit card needed.' },
          { title: 'Add your team', body: 'Invite your doctors, nurses and front-desk staff so they can log in. Each person gets the right access for their role.' },
          { title: 'Set up your departments', body: 'Turn on the modules you use — OPD, IPD, pharmacy, lab, radiology and so on — and add your lab tests, medicines and billing rates. A built-in setup guide walks you through it.' },
          { title: 'Register your first patient', body: 'Register a patient, book an appointment, and watch the visit, prescription and bill flow together in one place.' },
          { title: 'Go live and grow', body: 'Add more departments whenever you are ready. The same platform grows from a small nursing home to a full multi-specialty hospital.' },
        ],
      },
      {
        h2: 'Uyirly vs a typical hospital management system',
        body:
          'Most hospital software in India is either old on-premise software that is slow to set up and priced per bed, or a bundle of tools that do not really share data. Here is how Uyirly compares.',
        table: {
          headers: ['What matters', 'Typical hospital software', 'Uyirly'],
          rows: [
            ['Setup', 'Weeks of installation on your own servers', 'Cloud-based, live the same day'],
            ['Pricing', 'Per bed or per user — grows as you grow', 'Flat monthly price, no per-bed or per-user fees'],
            ['Departments', 'Often separate tools with separate logins', 'OPD, IPD, pharmacy, lab, billing and more on one login'],
            ['Billing', 'Assembled by hand at discharge', 'Builds itself as care happens; ready at discharge'],
            ['Data location', 'Varies', 'Stored in India, DPDP Act aligned'],
            ['Mobile app', 'Rare or extra cost', 'Native app for staff and patients, included'],
            ['Free trial', 'Usually a paid pilot', '30-day free trial, no credit card'],
          ],
        },
      },
      {
        h2: 'How much does hospital management software cost?',
        body:
          'Uyirly uses simple, flat monthly pricing with **no per-bed and no per-user fees**. Plans start at ₹2,999 a month, and every plan comes with a 30-day free trial and no credit card. A small clinic and a large hospital each pay for the plan they need, not for every bed or login. For a full breakdown of what hospital software costs in India — and what to watch out for — see our [hospital management software cost guide](/guides/hospital-management-software-cost-india), or view the current [pricing plans](/pricing).',
      },
      {
        h2: 'Who Uyirly is for',
        body:
          'Because it is modular and cloud-based, the same platform fits many kinds of facility. Turn on the modules you need today and add the rest later. It works well for [clinics](/clinic-management-software), [nursing homes](/nursing-home-management-software), [multi-specialty hospitals](/multi-specialty-hospital-software), diagnostic [labs](/lab-management-software) and [dental clinics](/dental-clinic-software) — all on the same simple system.',
      },
      {
        h2: 'Hospital management software by city',
        body:
          'Uyirly is cloud-based, so hospitals anywhere in India can use it. See how it works for your city: [Chennai](/hospital-management-software/chennai), [Coimbatore](/hospital-management-software/coimbatore), [Madurai](/hospital-management-software/madurai), [Tiruchirappalli](/hospital-management-software/tiruchirappalli), [Salem](/hospital-management-software/salem), [Bengaluru](/hospital-management-software/bangalore), [Hyderabad](/hospital-management-software/hyderabad), [Delhi](/hospital-management-software/delhi), [Mumbai](/hospital-management-software/mumbai), [Pune](/hospital-management-software/pune), [Kochi](/hospital-management-software/kochi) and [Vijayawada](/hospital-management-software/vijayawada).',
      },
    ],
    faqs: [
      {
        q: 'What is hospital management software?',
        a: 'Hospital management software (an HMS, also called a hospital information system) is one system that runs a hospital’s daily work — patient registration, the OPD queue, IPD admissions and beds, pharmacy, lab, radiology, billing, insurance and staff — on a single shared patient record and bill, instead of a separate register for each department. Uyirly is a cloud HMS built for Indian hospitals.',
      },
      {
        q: 'How much does hospital management software cost in India?',
        a: 'Uyirly uses flat monthly pricing with no per-bed or per-user fees, starting from ₹2,999/month, plus a 30-day free trial with no credit card. A small hospital and a large one each pay for the plan they need. See the [pricing page](/pricing) for current plans.',
      },
      {
        q: 'Is it cloud-based, and does it work for small hospitals?',
        a: 'Yes. Uyirly is fully cloud-based — nothing to install, and you can use it on any device or on the mobile app. The same platform works for a single clinic or nursing home and for a large multi-specialty hospital, so small facilities run the same software the big ones do.',
      },
      {
        q: 'What modules does the hospital management system include?',
        a: 'OPD and appointments, IPD admission and bed management, pharmacy, lab (LIS), radiology (RIS), billing, insurance/TPA claims, blood bank, operation theatre scheduling, emergency, inventory, and staff/HR — all on one shared patient record. You can switch modules on as you need them.',
      },
      {
        q: 'How long does it take to set up?',
        a: 'Most hospitals are up and running the same day. You sign up, add your staff, turn on the departments you use, and register your first patient. A built-in setup guide walks you through each step, and there is nothing to install because it is cloud-based.',
      },
      {
        q: 'Is my patient data safe?',
        a: 'Yes. Patient data is stored in India and the platform is aligned with the Digital Personal Data Protection (DPDP) Act. Each hospital’s data is kept separate, access is controlled by staff role, and all traffic is encrypted. See our security page for details.',
      },
      {
        q: 'Does it support GST billing and insurance claims?',
        a: 'Yes. Billing produces GST-ready invoices, and the insurance module handles cashless TPA claims end to end — pre-authorisation, claim and settlement — so paperwork does not hold up a patient’s discharge.',
      },
      {
        q: 'Is it ABDM / ABHA and NABH ready?',
        a: 'Yes. Records are ABDM/ABHA-ready, and the documentation and workflows are built to map to NABH expectations, which makes audits and accreditation easier to prepare for.',
      },
    ],
    related: [
      { label: 'What is a hospital management system?', href: '/guides/what-is-hospital-management-system' },
      { label: 'Hospital management software cost in India', href: '/guides/hospital-management-software-cost-india' },
      { label: 'Best hospital management software in India', href: '/best-hospital-management-software-in-india' },
      { label: 'Cloud-based hospital management system', href: '/cloud-based-hospital-management-system' },
      { label: 'Clinic management software', href: '/clinic-management-software' },
      { label: 'Pricing', href: '/pricing' },
    ],
    updated: '2026-08-04',
  },

  // ── Choosing & buying — buyer-modifier / intent variants ──────────────────
  'best-hospital-management-software-in-india': {
    slug: 'best-hospital-management-software-in-india',
    eyebrow: 'Buyer’s Guide',
    group: GROUP_BUYING,
    tagline: 'How to actually choose the best HMS for an Indian hospital — what matters, what to avoid.',
    metaTitle: 'Best Hospital Management Software in India (2026)',
    description:
      'How to choose the best hospital management software in India — what to look for, red flags to avoid, and why Uyirly fits Indian hospitals: GST, TPA, ABDM, flat pricing.',
    keywords: [
      'best hospital management software in india',
      'best hospital management software india',
      'top 10 hospital management software in india',
      'best hospital software in india',
      'best hms software in india',
      'hospital management software india',
    ],
    primaryKeyword: 'best hospital management software in india',
    h1: 'Best hospital management software in India: how to choose',
    subhead:
      'Every vendor claims to be the best hospital management software in India, and every “top 10” list is really an ad. The useful question isn’t which brand wins a listicle — it’s which system fits how Indian hospitals actually run: GST billing, TPA cashless claims, ABDM records, and pricing that won’t punish you for growing. Here’s what to weigh, and where Uyirly lands.',
    heroBullets: [
      'What genuinely matters when comparing HMS vendors',
      'The red flags that cost hospitals later',
      'Why India-specific fit beats a longer feature list',
      'A free trial so you judge on your own hospital, not a demo',
    ],
    sections: [
      {
        h2: 'Why “top 10” lists don’t answer the question',
        body:
          'Search “best hospital management software in India” and you get list after list of ten products in an order someone was paid to arrange. None of those lists knows your hospital — your size, your specialties, whether you run an insurance desk or a blood bank. The best HMS for a 20-bed nursing home is not the best one for a 300-bed multi-specialty hospital. So treat the lists as a starting set of names, and then judge each one against your own hospital using the checklist below. The “best” software is simply the one that fits **your** hospital the closest.',
      },
      {
        h2: '7 things that actually decide the best HMS for your hospital',
        body:
          'Every vendor lists the same long feature list. These seven things are what really separate a good [hospital management system](/hospital-management-software) from one you will regret. Score each shortlisted product out of these seven and the winner usually becomes obvious.',
        subsections: [
          {
            h3: '1. Is it truly one connected system?',
            body:
              'The biggest difference between products is whether every module shares one patient and one bill — or just sits behind the same login. Test it: register a patient, order a lab test from a consultation, dispense a medicine, and see if it all lands on one bill at discharge with no re-typing. If it does, the software saves your staff time every single day.',
          },
          {
            h3: '2. Is it built for India?',
            body:
              'An Indian hospital lives with GST billing, [insurance and TPA cashless claims](/guides/health-insurance-tpa-claims-guide), [ABDM/ABHA records](/guides/abdm-abha-health-id-hospitals-guide) and [NABH expectations](/guides/nabh-accreditation-software-checklist). Software built for another market forces workarounds on all four — and workarounds are where errors hide. Pick one where these are built in, not bolted on.',
          },
          {
            h3: '3. How is it priced?',
            body:
              'Per-bed and per-user pricing looks cheap on day one and punishes you the moment you grow. Flat monthly pricing keeps your cost predictable. Before you sign, ask exactly what raises the fee — beds, users, patients, locations or modules. See our [cost guide](/guides/hospital-management-software-cost-india) for what to expect.',
          },
          {
            h3: '4. Cloud or on-premise?',
            body:
              'A [cloud-based system](/cloud-based-hospital-management-system) has nothing to install, no server to buy or maintain, automatic backups, and works on any device. On-premise software ties you to one machine and an IT person to keep it alive. For most hospitals today, cloud is the simpler and safer choice.',
          },
          {
            h3: '5. Is it easy enough for your staff?',
            body:
              'Your front desk, nurses and doctors will use this all day. If it needs a week of training, it will not get used properly. Look for a clean, simple screen and a system your team can pick up in a day.',
          },
          {
            h3: '6. Is your patient data safe and in India?',
            body:
              'Patient data is sensitive. Check that data is stored in India, that the vendor follows the DPDP Act, that access is controlled by staff role, and that everything is encrypted.',
          },
          {
            h3: '7. What is the support and setup like?',
            body:
              'Ask how long setup takes, whether they help you move your existing data, and how you reach support when something breaks during a busy OPD. Good onboarding is the difference between going live in a day and struggling for a month.',
          },
        ],
      },
      {
        h2: 'Red flags to avoid',
        body:
          'While you compare, watch for these warning signs. Any one of them can cost you far more than the software saves.',
        bullets: [
          'Pricing that climbs with every bed, user or patient',
          'Modules that do not share one patient and one bill',
          'GST, TPA, ABDM or NABH handled as “custom work”, not built in',
          'On-premise only, with a server you must buy and maintain',
          'No free trial — you can only see a scripted sales demo',
          'Patient data stored outside India, or unclear on security',
        ],
      },
      {
        h2: 'A simple scorecard to compare vendors',
        body:
          'Run each shortlisted product through the same checklist and mark it honestly. The one with the most green ticks — not the one highest on a paid list — is the best hospital management software for you.',
        table: {
          headers: ['What to check', 'Good sign', 'Red flag'],
          rows: [
            ['Integration', 'One patient & one bill everywhere', 'Separate tools, re-entry needed'],
            ['India fit', 'GST, TPA, ABDM, NABH built in', 'Handled as custom work'],
            ['Pricing', 'Flat monthly, no per-bed fees', 'Per bed / per user / per patient'],
            ['Hosting', 'Cloud — nothing to install', 'On-premise server to maintain'],
            ['Ease of use', 'Staff learn it in a day', 'Needs a week of training'],
            ['Data & security', 'Stored in India, DPDP aligned', 'Unclear or stored abroad'],
            ['Trial', 'Free trial on real patients', 'Demo only, no trial'],
          ],
        },
      },
      {
        h2: 'How to actually choose — run a real trial',
        body:
          'The best way to pick is not a spreadsheet of features — it is a short, real test. Here is how to do it in a week:',
        steps: [
          { title: 'Shortlist two or three', body: 'Take names from the “top 10” lists, then keep only the ones that pass the checklist above on paper.' },
          { title: 'Run the same real scenario in each', body: 'Register a patient, order a test from a consultation, dispense a medicine, and reach discharge with an itemised bill and insurance claim ready.' },
          { title: 'Ask your staff', body: 'Let a front-desk person and a nurse try each one. They will tell you in ten minutes which is easier to use.' },
          { title: 'Check the real price', body: 'Ask for the total monthly cost at your current size and at double your size, so growth does not surprise you later.' },
          { title: 'Decide on fit, not the list', body: 'Pick the one that handled your workflow with the least friction and priced predictably — regardless of where it sat on anyone’s list.' },
        ],
      },
      {
        h2: 'Where Uyirly fits',
        body:
          'We will not claim to be “number one” — that is for you to decide on your own hospital. But [Uyirly](/hospital-management-software) is built to score well on all seven points above: OPD, IPD, pharmacy, lab, radiology, billing, insurance, blood bank, OT and staff on **one shared record and one bill**, with GST, TPA, ABDM and NABH built in, cloud-based, data stored in India, and **flat monthly pricing with no per-bed fees**. The honest way to judge it against any list is a free trial with your own patients and your own bills.',
        preview: 'dashboard',
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
        a: 'There is no single “best” for every hospital — the right choice depends on your size, specialties and budget. What matters is fit: a system where modules truly share one patient and one bill, that handles GST, insurance/TPA, ABDM and NABH natively, prices flatly rather than per bed, and is easy for your staff to use. [Uyirly](/hospital-management-software) is built for Indian hospitals on all of these, and offers a 30-day free trial so you can judge it on your own work rather than a sales demo.',
      },
      {
        q: 'How do I compare hospital management software vendors?',
        a: 'Run the same real scenario through each: register a patient, order a test from a consultation, dispense a medicine, and reach discharge with an itemised bill and an insurance claim ready. Whichever system does that without re-entering the patient or hand-totalling the bill will save your staff time every day. Feature lists all look similar; integration and ease of use are where they differ.',
      },
      {
        q: 'What should the best HMS cost in India?',
        a: 'Watch the pricing model, not just the number. Per-bed and per-user pricing rises every time you grow. Flat monthly pricing keeps it predictable. Uyirly starts at ₹2,999/month with no per-bed or per-user fees. See the [cost guide](/guides/hospital-management-software-cost-india) and [pricing](/pricing) for details.',
      },
      {
        q: 'Is cheaper hospital software better for a small hospital?',
        a: 'Cheapest on day one is often the most expensive later — per-bed and per-user pricing rises every time you add a bed or a login. For a small hospital, flat monthly pricing on a platform that can scale up (so you never have to migrate) usually wins over a cheap tool you outgrow.',
      },
      {
        q: 'Should I choose cloud or on-premise hospital software?',
        a: 'For most hospitals, cloud is the simpler and safer choice — nothing to install, no server to buy or maintain, automatic backups, and access from any device. On-premise ties you to one machine and someone to keep it running. Uyirly is fully cloud-based, with data stored in India.',
      },
    ],
    related: [
      { label: 'Hospital management software', href: '/hospital-management-software' },
      { label: 'Hospital management software cost in India', href: '/guides/hospital-management-software-cost-india' },
      { label: 'Cloud-based hospital management system', href: '/cloud-based-hospital-management-system' },
      { label: 'What is a hospital management system?', href: '/guides/what-is-hospital-management-system' },
      { label: 'Pricing', href: '/pricing' },
    ],
    updated: '2026-08-04',
  },

  'cloud-based-hospital-management-system': {
    slug: 'cloud-based-hospital-management-system',
    eyebrow: 'Cloud HMS',
    group: GROUP_BUYING,
    tagline: 'Nothing to install, access anywhere, automatic backups — the case for a cloud/SaaS HMS.',
    metaTitle: 'Cloud-Based Hospital Management System',
    description:
      'Uyirly is a cloud-based hospital management system — nothing to install, access from any device, automatic backups and updates, and pay-monthly pricing. 30-day free trial.',
    keywords: [
      'cloud based hospital management system',
      'cloud based hospital management software',
      'saas hospital management system',
      'online hospital management software',
      'web based hospital management system',
      'cloud hospital software',
    ],
    primaryKeyword: 'cloud based hospital management system',
    h1: 'A cloud-based hospital management system, nothing to install',
    subhead:
      'Uyirly is a cloud-based hospital management system — a web-based, SaaS platform that runs your whole hospital online. There’s no server to buy, it’s reachable from any device or branch, it’s backed up automatically and updated for you, and you pay monthly instead of making a heavy one-time purchase.',
    heroBullets: [
      'No server to buy, install or maintain',
      'Access from any device, any branch, in real time',
      'Automatic backups and security updates',
      'Pay monthly — a small operating cost, not a big capital one',
    ],
    sections: [
      {
        h2: 'What “cloud-based” actually means for a hospital',
        body:
          'A cloud-based hospital management system runs online and you reach it through a web browser — which is why people also call it web-based, online or SaaS hospital software. The practical effect is simple: there is nothing to install and nothing to maintain on your own machines. No server humming in a back room, no local database to back up by hand, no IT person needed to patch it. You open a browser and your whole hospital is there. [Uyirly](/hospital-management-software) is exactly this kind of system.',
        bullets: [
          'No server to buy, install or maintain',
          'Reachable from any device, any branch, in real time',
          'Automatic backups and security updates',
          'Pay monthly — a small running cost, not a big one-time buy',
        ],
      },
      {
        h2: 'Cloud vs an on-premise server',
        body:
          'On-premise hospital software means buying a server, paying someone to keep it running, and losing access the moment that machine or your local network fails. Here is the difference in plain terms.',
        table: {
          headers: ['', 'On-premise server', 'Cloud (Uyirly)'],
          rows: [
            ['Setup', 'Weeks of installation', 'Live the same day'],
            ['Upfront cost', 'Buy a server + licences', 'Nothing to buy'],
            ['Maintenance', 'You patch and maintain it', 'Handled for you'],
            ['Backups', 'Manual, often forgotten', 'Automatic'],
            ['Access', 'One building, one network', 'Any device, any branch'],
            ['If the PC dies', 'Data can be lost', 'Data is safe in the cloud'],
            ['Updates', 'Paid, occasional', 'Automatic, included'],
          ],
        },
      },
      {
        h2: 'What you get with a cloud system',
        body:
          'The move to cloud is not just about convenience — it removes whole categories of daily risk and cost.',
        preview: 'dashboard',
        subsections: [
          {
            h3: 'Nothing to install or maintain',
            body:
              'There is no server to buy, no software to install, and no IT person needed to keep it alive. You sign up and start — setup that used to take weeks now takes a day.',
          },
          {
            h3: 'Access from anywhere, across branches',
            body:
              'Because it lives online, a doctor moving between OPD and the ward, or a group with several branches, all read the same live patient record. Add a branch and it is on the same system the same day — no syncing local databases, no “which PC has the latest version”.',
          },
          {
            h3: 'Automatic backups and updates',
            body:
              'Your data is backed up automatically, and new features and security fixes arrive on their own. You are never stuck on an old version, and a stolen or corrupted PC no longer means lost records.',
          },
          {
            h3: 'A native mobile app',
            body:
              'Because it is online, the same system is on the phone too — staff and patients get a native app, so you are not tied to a desktop in one room.',
          },
        ],
      },
      {
        h2: 'Is your data safe in the cloud?',
        body:
          'The common worry is that the cloud is less secure — in practice it is usually the opposite. A single clinic PC gets stolen, corrupted or hit by ransomware, often with no backup at all. Uyirly keeps data on managed infrastructure **in India**, with automatic backups, encryption and role-based access, and every access is audit-logged, aligned with India’s [DPDP Act](/guides/hospital-software-data-security-dpdp). The safe default is not a locked cupboard; it is a system that backs itself up.',
      },
      {
        h2: 'How to start today',
        body:
          'There is no procurement, no installation and no six-week deployment before anyone can register a patient.',
        steps: [
          { title: 'Sign up', body: 'Create your hospital on [uyirly.com](/signup) — no credit card, no server, nothing to install.' },
          { title: 'Add your team and departments', body: 'Invite staff and switch on the modules you use. A setup guide walks you through it.' },
          { title: 'Go live the same day', body: 'Register your first patient and run OPD, billing and pharmacy right away. Add branches or modules whenever you are ready.' },
        ],
      },
    ],
    faqs: [
      {
        q: 'Is a cloud-based hospital management system safe?',
        a: 'Generally safer than a single on-premise PC. A local machine can be stolen, corrupted or hit by ransomware with no backup; a cloud system like Uyirly keeps data on managed infrastructure with automatic backups, encryption, role-based access and audit logging, aligned with India’s DPDP Act expectations.',
      },
      {
        q: 'Does it need the internet to work?',
        a: 'A cloud/web-based system needs a working internet connection, which most hospitals now have as standard. The trade-off is worth it: no server to buy or maintain, access from any device or branch, automatic backups and updates, and the ability to start the same day without installation.',
      },
      {
        q: 'How is cloud pricing different from buying hospital software?',
        a: 'Traditional on-premise software is a large one-time purchase plus server and maintenance costs. A cloud/SaaS system like Uyirly is a predictable monthly fee that includes hosting, backups and updates — turning a big capital expense into a small operating one, with a 30-day free trial to start.',
      },
      {
        q: 'Can it handle multiple branches?',
        a: 'Yes. Because it’s online, every branch reads and writes the same live patient database — no syncing local servers. Adding a location puts it on the same system the same day, which is exactly where a web-based hospital management system beats an on-premise one for groups.',
      },
      {
        q: 'Do I need to install anything?',
        a: 'No. There is nothing to install and no server to buy. You use it in a web browser or the mobile app, and setup takes about a day instead of weeks. See [pricing](/pricing) for plans.',
      },
    ],
    related: [
      { label: 'Hospital management software', href: '/hospital-management-software' },
      { label: 'Data security & the DPDP Act', href: '/guides/hospital-software-data-security-dpdp' },
      { label: 'Best hospital management software in India', href: '/best-hospital-management-software-in-india' },
      { label: 'Pricing', href: '/pricing' },
    ],
    updated: '2026-08-04',
  },

  // ── By specialty & facility (Phase 3) ─────────────────────────────────────
  'dental-clinic-software': {
    slug: 'dental-clinic-software',
    eyebrow: 'Dental Clinic Software',
    group: GROUP_SPECIALTY,
    tagline: 'Tooth-level charting, treatment plans across visits and recalls — with shared records, pharmacy and billing.',
    metaTitle: 'Dental Clinic Software & Practice Management (India)',
    description:
      'Uyirly is dental clinic software for Indian dental practices — tooth charting, treatment plans, recall reminders, appointments and billing, with shared patient records. Free trial.',
    keywords: [
      'dental clinic software',
      'dental practice management software',
      'dental software',
      'dentist software',
      'dental management software',
      'dental clinic management software',
      'dental software india',
    ],
    primaryKeyword: 'dental clinic software',
    h1: 'Dental clinic software built around the tooth',
    subhead:
      'Dentistry looks like OPD from a distance, but the record is completely different — everything is anchored to a specific tooth, and most of the work recurs over months. Uyirly gives the dental chair tooth-level charting, treatment plans that span visits, and recall reminders, while sharing the same patient records, pharmacy and billing as the rest of the practice.',
    heroBullets: [
      'Tooth-level charting with a standard dental notation',
      'Treatment plans tracked across multiple visits',
      'Recall scheduling and reminders — the engine of repeat revenue',
      'Appointments, billing and pharmacy on one shared record',
    ],
    sections: [
      {
        h2: 'What dental software adds beyond a normal OPD screen',
        body:
          'A general OPD note is a paragraph of text; a dental record is a map. The core of any real dental clinic software is tooth-level charting — findings, procedures and plans recorded against individual teeth using a standard dental notation, so a dentist sees at a glance what has been done where. A generic hospital OPD form has no concept of individual teeth, which is exactly what dentistry revolves around, so software that just relabels an OPD screen as “dental” misses the point.',
      },
      {
        h2: 'Treatment plans that span many visits',
        body:
          'A root canal or an orthodontic case isn’t one appointment — it’s a sequence. Dental practice management software has to hold the plan across visits, showing what’s done and what remains, so any dentist in the practice can pick up where the last one left off. Because the state lives on the teeth rather than in someone’s memory, a returning patient’s plan is right there the moment their chart opens.',
        bullets: [
          'Multi-visit treatment plans with done / pending status per tooth',
          'Any dentist in the clinic can continue a colleague’s plan',
          'Estimates and quotations built from the planned procedures',
        ],
      },
      {
        h2: 'Recalls are the clinic’s repeat revenue',
        body:
          'Cleanings, reviews and staged treatments all depend on the patient coming back at the right time. Recall scheduling — and a reminder that actually reaches the patient by SMS or WhatsApp — is both good clinical care and the main driver of a dental clinic’s income. Tying recalls to the patient record keeps the chair filled without anyone manually chasing a diary.',
      },
      {
        h2: 'One record for a standalone clinic or a hospital dental department',
        body:
          'A standalone dental clinic gets exactly the specialty screen it needs. A dental department inside a multi-specialty hospital gets the same tooth-charting screen while sharing the hospital’s patient records, pharmacy and billing — so the dentist gets dentistry, and the hospital keeps one unified patient and one bill. Either way the appointments, prescriptions and payments live in the same system as the chart.',
        bullets: [
          'Standalone dental clinic or a hospital’s dental OPD',
          'Shared patient records, pharmacy and billing',
          'Cloud-based — nothing to install, works on any device',
        ],
      },
      {
        h2: 'How a dental visit flows',
        body:
          'From the chair to the bill, everything hangs on the tooth chart — so a returning patient’s plan is right there when the chart opens.',
        steps: [
          { title: 'Chart', body: 'Record findings on individual teeth using a standard dental notation.' },
          { title: 'Plan', body: 'Build a multi-visit treatment plan and an estimate from the planned procedures.' },
          { title: 'Treat', body: 'Mark procedures done per tooth as you work; any dentist can continue the plan.' },
          { title: 'Recall', body: 'Schedule the next visit and send an SMS/WhatsApp reminder — the engine of repeat revenue.' },
          { title: 'Bill', body: 'Consultation, procedures and pharmacy items land on one bill.' },
        ],
      },
      {
        h2: 'A generic OPD screen vs real dental software',
        body:
          'A general [OPD screen](/clinic-management-software) has no idea what a tooth is. Here is the difference.',
        table: {
          headers: ['', 'Generic OPD screen', 'Uyirly dental'],
          rows: [
            ['The record', 'One free-text note', 'Charting per tooth'],
            ['Treatment', 'Single visit', 'Multi-visit plans, done/pending per tooth'],
            ['Follow-up', 'Manual diary', 'Recall reminders by SMS/WhatsApp'],
            ['Continuity', 'Depends on memory', 'Any dentist continues the plan'],
            ['Billing', 'Separate', 'On the same shared bill'],
          ],
        },
      },
    ],
    faqs: [
      {
        q: 'What does dental clinic software add beyond a normal OPD consultation?',
        a: 'The key addition is tooth-level charting: recording findings, procedures and treatment plans against specific teeth using a dental notation, rather than one free-text note. A general OPD screen has no concept of individual teeth, which is exactly what dentistry revolves around. Good dental software also handles multi-visit treatment plans and recall reminders.',
      },
      {
        q: 'Does it work for a single dentist as well as a multi-chair clinic?',
        a: 'Yes. A single dentist uses it for charting, appointments, plans and billing on one screen. A multi-chair or multi-dentist clinic shares one patient database, so any dentist can continue a colleague’s treatment plan and the front desk runs one appointment book across all chairs.',
      },
      {
        q: 'Can a multi-specialty hospital run its dental department in the same system?',
        a: 'Yes. The dental OPD gets a dental-specific tooth-charting screen while sharing the same patient records, pharmacy and billing as the rest of the hospital — so the dentist gets tooth charting and the hospital keeps one unified patient and one bill.',
      },
    ],
    related: [
      { label: 'Dental clinic software: how it works', href: '/guides/dental-clinic-software-guide' },
      { label: 'Clinic management software', href: '/clinic-management-software' },
      { label: 'Hospital management software', href: '/hospital-management-software' },
      { label: 'Pricing', href: '/pricing' },
    ],
    updated: '2026-08-04',
  },

  'nursing-home-management-software': {
    slug: 'nursing-home-management-software',
    eyebrow: 'Nursing Home Software',
    group: GROUP_SPECIALTY,
    tagline: 'Right-sized software for a nursing home — OPD, beds, pharmacy and billing without hospital bloat.',
    metaTitle: 'Nursing Home Management Software (India)',
    description:
      'Nursing home management software for India — OPD, beds and admissions, pharmacy, billing and patient records in one affordable cloud system. Free trial.',
    keywords: [
      'nursing home management software',
      'nursing home software',
      'nursing home software india',
      'nursing home management system',
      'small hospital software',
      'care home software',
    ],
    primaryKeyword: 'nursing home management software',
    h1: 'Nursing home management software, right-sized',
    subhead:
      'A nursing home is a small hospital — a handful of beds, an OPD, a pharmacy and a lot of billing — and it shouldn’t have to run enterprise software built for a 300-bed institution. Uyirly gives a nursing home exactly what it needs: registration, OPD, admissions and beds, pharmacy and billing on one affordable cloud system, with room to grow into a full hospital later.',
    heroBullets: [
      'OPD, admissions and bed management in one place',
      'Pharmacy and billing on the same patient record',
      'Flat, affordable pricing — no per-bed metering',
      'Cloud-based; scales into a full hospital when you grow',
    ],
    sections: [
      {
        h2: 'A nursing home is a small hospital',
        body:
          'The everyday work of a nursing home is the everyday work of a hospital, just smaller: register a patient, run the OPD, admit some to beds, dispense from the pharmacy, and bill it all correctly. The trap is that most software is either a toy that can’t handle admissions, or an enterprise system priced and built for a large hospital. Uyirly is sized for the middle — genuinely capable, without the bloat or the price tag.',
      },
      {
        h2: 'Admissions and beds, done simply',
        body:
          'Even a 10- or 20-bed nursing home needs to admit patients, assign beds, accrue daily charges and discharge with a clean itemised bill. Uyirly handles admissions and bed management the same way a big hospital does, but with a simpler screen — so the front desk isn’t fighting a system designed for a hundred wards.',
        preview: 'bill',
        bullets: [
          'Admit, assign a bed, and accrue daily bed and nursing charges',
          'Discharge with an itemised bill that’s ready, not reconstructed',
          'Advance payments applied automatically against the running bill',
        ],
      },
      {
        h2: 'Affordable, and priced to not punish growth',
        body:
          'For a small facility, per-bed or per-user pricing is exactly the wrong model — it taxes you the moment you add a bed. Uyirly is flat monthly pricing with a 30-day free trial and no card, so a nursing home pays for the plan it needs, not for every bed or login. It’s the difference between software that fits a nursing home’s budget and software that outgrows it.',
      },
      {
        h2: 'Grows into a full hospital without a migration',
        body:
          'A nursing home that adds a lab, a second doctor, or more beds shouldn’t have to switch systems and re-enter its patients. Uyirly is the same platform that runs full hospitals, so you turn on lab, radiology, insurance or OT when you’re ready — the nursing home you set up today extends into a hospital without re-platforming.',
        bullets: [
          'Add lab, radiology, insurance or OT modules as you grow',
          'One patient database carries forward — no migration',
          'Cloud-based: nothing to install, access from anywhere',
        ],
      },
      {
        h2: 'A day in a nursing home on Uyirly',
        body:
          'The same flow a big [hospital](/hospital-management-software) runs, on a simpler screen sized for a small facility.',
        steps: [
          { title: 'Register', body: 'A patient is registered once with a UHID and found instantly next time.' },
          { title: 'OPD or admit', body: 'See them in OPD, or admit and assign a bed — daily bed and nursing charges start accruing.' },
          { title: 'Treat and dispense', body: 'Prescriptions and pharmacy items post to the same patient and bill.' },
          { title: 'Discharge', body: 'The itemised bill is ready, advances applied — no manual reconstruction.' },
        ],
      },
    ],
    faqs: [
      {
        q: 'Is Uyirly suitable for a small nursing home?',
        a: 'Yes — it’s specifically sized for nursing homes and small hospitals. You get OPD, admissions and bed management, pharmacy and billing without the complexity of enterprise hospital software, and flat pricing that doesn’t charge per bed. A 30-day free trial lets you run your real front desk before paying.',
      },
      {
        q: 'Can it handle inpatient admissions and daily billing?',
        a: 'Yes. Even a small nursing home can admit patients, assign beds, accrue daily bed and nursing charges automatically, and discharge with an itemised bill — advances are applied against the running total, so discharge is fast rather than a manual reconciliation.',
      },
      {
        q: 'What happens when the nursing home grows into a bigger hospital?',
        a: 'Nothing to rip out. Uyirly is the same platform that runs full hospitals, so you switch on lab, radiology, insurance, OT and more as you need them. The same patient database carries forward, so there’s no migration when you scale up.',
      },
    ],
    related: [
      { label: 'Hospital management software', href: '/hospital-management-software' },
      { label: 'Clinic management software', href: '/clinic-management-software' },
      { label: 'Multi-specialty hospital software', href: '/multi-specialty-hospital-software' },
      { label: 'Pricing', href: '/pricing' },
    ],
    updated: '2026-08-04',
  },

  'multi-specialty-hospital-software': {
    slug: 'multi-specialty-hospital-software',
    eyebrow: 'Multi-Specialty Hospital Software',
    group: GROUP_SPECIALTY,
    tagline: 'One patient across every specialty and department — the whole multi-specialty hospital on one system.',
    metaTitle: 'Multi-Specialty Hospital Management Software (India)',
    description:
      'Multi-specialty hospital management software for India — every department on one shared patient record and bill, with doctor-wise queues and all modules.',
    keywords: [
      'multi specialty hospital software',
      'multi specialty hospital management software',
      'multispecialty hospital management system',
      'multi specialty hospital management system',
      'multi speciality hospital software',
    ],
    primaryKeyword: 'multi specialty hospital software',
    h1: 'Multi-specialty hospital software, one patient across every department',
    subhead:
      'A multi-specialty hospital’s hardest problem is keeping one patient coherent as they move between cardiology, orthopaedics, the lab, the pharmacy and the billing desk. Uyirly runs every specialty and every department on one shared patient record and one bill, with doctor-wise and department-wise queues, so the hospital works as a single system rather than a set of silos.',
    heroBullets: [
      'One patient record shared across every specialty',
      'Doctor-wise and department-wise OPD queues',
      'All modules — IPD, pharmacy, lab, radiology, OT, blood bank',
      'One combined bill across departments, ready at discharge',
    ],
    sections: [
      {
        h2: 'One patient, seen by many specialties',
        body:
          'In a multi-specialty hospital a single patient might see a physician, get referred to a cardiologist, have a scan, collect medicines and settle one bill — all in a day. If each specialty keeps its own record, that patient fragments. Uyirly keeps one record per patient that every specialty reads from and writes to, so a referral carries the full history with it and nobody re-takes what another department already recorded.',
      },
      {
        h2: 'Doctor-wise and department-wise queues',
        body:
          'A hospital-wide single queue makes no sense when twenty doctors across ten departments are consulting at once. Uyirly routes each token to the right doctor and department at registration and shows each doctor only their own queue — so a patient waiting for cardiology isn’t stuck behind orthopaedics, and reception isn’t manually deciding whose turn it is.',
        preview: 'opd',
        bullets: [
          'Tokens routed to the correct doctor and department at registration',
          'Each doctor sees only their own live queue',
          'Appointments and walk-ins share one fair line per doctor',
        ],
      },
      {
        h2: 'Every clinical module, actually connected',
        body:
          'A multi-specialty hospital needs the full stack — IPD and wards, pharmacy, lab, radiology, operation theatre, blood bank, emergency and insurance — and the value is that they share one patient and one bill. A test ordered in a consultation reaches the lab; the result reaches the doctor; the medicine and the bed charge land on the same running bill. It’s the difference between departments that cooperate and departments that merely coexist.',
        bullets: [
          'IPD, pharmacy, lab (LIS), radiology (RIS), OT, blood bank, emergency',
          'Insurance/TPA claims built on the same accumulating bill',
          'One combined, itemised bill across every department at discharge',
        ],
      },
      {
        h2: 'Built for Indian multi-specialty hospitals',
        body:
          'Uyirly handles what an Indian multi-specialty hospital actually deals with — GST-ready billing, insurance and TPA cashless claims, ABDM/ABHA-ready records and NABH-friendly documentation — on flat monthly pricing with no per-bed metering. It’s cloud-based, so multiple branches read from the same live patient database, and it scales from a growing hospital to a large institution on the same platform.',
        bullets: [
          'GST billing, TPA claims, ABDM/ABHA records, NABH documentation',
          'Cloud-based, multi-branch on one live database',
          'Flat pricing; 30-day free trial, no credit card',
        ],
      },
      {
        h2: 'Silos vs one connected system',
        body:
          'The whole point of [multi-specialty software](/hospital-management-software) is that departments cooperate instead of merely coexisting.',
        table: {
          headers: ['', 'Separate department tools', 'Uyirly'],
          rows: [
            ['Patient record', 'One per department', 'One shared across all specialties'],
            ['Referral', 'History re-taken each time', 'Full history travels with the patient'],
            ['Queues', 'One confusing line', 'Per doctor, per department'],
            ['Tests & medicines', 'Re-registered each place', 'Flow to the same patient & bill'],
            ['Billing', 'A bill per department', 'One combined bill at discharge'],
          ],
        },
      },
    ],
    faqs: [
      {
        q: 'What makes software “multi-specialty” rather than a general HMS?',
        a: 'The key is handling many specialties and doctors against one shared patient record — doctor-wise and department-wise queues, referrals that carry the full history, and one combined bill across departments. Uyirly is a full HMS built to run exactly this: every specialty and module on one patient and one bill.',
      },
      {
        q: 'Can each department and doctor have their own queue?',
        a: 'Yes. Tokens are routed to the right doctor and department at registration, and each doctor sees only their own live queue, so patients for one specialty aren’t blocked behind another. Appointments and walk-ins share one fair line per doctor.',
      },
      {
        q: 'Does it include all the clinical modules a large hospital needs?',
        a: 'Yes — IPD and wards, pharmacy, lab (LIS), radiology (RIS), operation theatre, blood bank, emergency, inventory, insurance/TPA and staff — all on one shared patient record and bill. Modules can be switched on as the hospital needs them.',
      },
    ],
    related: [
      { label: 'Hospital management software', href: '/hospital-management-software' },
      { label: 'Best hospital management software in India', href: '/best-hospital-management-software-in-india' },
      { label: 'Operation theatre management software', href: '/operation-theatre-management-software' },
      { label: 'Pricing', href: '/pricing' },
    ],
    updated: '2026-08-04',
  },

  // ── Department software (Phase 5) ─────────────────────────────────────────
  'pharmacy-management-software': {
    slug: 'pharmacy-management-software',
    eyebrow: 'Pharmacy Management Software',
    group: GROUP_MODULE,
    tagline: 'Stock, batch and expiry, dispensing against prescriptions, and billing — for the OPD counter and the IPD ward.',
    metaTitle: 'Pharmacy Management Software for Hospitals (India)',
    description:
      'Hospital pharmacy management software for India — drug stock with batch and expiry, dispensing against prescriptions, billing, and Schedule H/H1/X records.',
    keywords: [
      'pharmacy management software',
      'hospital pharmacy software',
      'pharmacy software',
      'pharmacy billing software',
      'pharmacy inventory software',
      'medical store software',
      'pharmacy management system',
    ],
    primaryKeyword: 'pharmacy management software',
    h1: 'Pharmacy management software for hospitals',
    subhead:
      'A hospital pharmacy has to do three hard things at once — hold stock with batch and expiry under control, dispense the right drug against the right prescription, and bill it correctly for both the OPD counter and the IPD ward. Uyirly’s pharmacy management software does all three on the same patient record, with drug-schedule compliance built in.',
    heroBullets: [
      'Drug stock with batch and expiry tracking',
      'Dispensing against the prescription, for OPD and IPD',
      'Pharmacy billing on the patient’s bill, no re-entry',
      'Schedule H / H1 / X records captured automatically',
    ],
    sections: [
      {
        h2: 'What pharmacy management software does',
        body:
          'A hospital [pharmacy](/hospital-management-software) has to do three hard things at once: hold stock with batch and expiry under control, dispense the right drug against the right prescription, and bill it correctly for both the OPD counter and the IPD ward. Uyirly’s pharmacy management software does all three on the same patient record, with drug-schedule compliance built in — so the pharmacy stops being a separate register and becomes part of the same system as the doctor and the bill.',
        bullets: [
          'Drug stock with batch and expiry tracking',
          'Dispensing against the prescription, for OPD and IPD',
          'Pharmacy billing on the patient’s bill, no re-entry',
          'Schedule H / H1 / X records captured automatically',
        ],
      },
      {
        h2: 'What runs inside the pharmacy module',
        body:
          'One counter, one screen — for the walk-in OPD customer and the admitted ward patient alike.',
        preview: 'pharmacy',
        subsections: [
          {
            h3: 'Stock with batch and expiry',
            body:
              'The most expensive mistake a pharmacy makes is letting stock expire on the shelf, or dispensing a batch it should not. Uyirly tracks every drug by batch and expiry, warns before items expire, and dispenses oldest-valid-first — so inventory stays accurate and money does not walk out as write-offs. Low-stock flags feed straight into purchase orders.',
          },
          {
            h3: 'Dispensing against the prescription',
            body:
              'The doctor’s prescription flows to the pharmacy, which dispenses against it — so the medicine matches the consultation and the charge lands on the same patient bill. There is no re-keying the drug list, and nothing is dispensed against a bill that does not exist.',
          },
          {
            h3: 'OPD counter and IPD ward',
            body:
              'A walk-in OPD sale is billed and receipted in one screen, while medication issued to an admitted patient posts straight to their IPD bill — so the pharmacy is not running two disconnected processes.',
          },
          {
            h3: 'Schedule H / H1 / X compliance',
            body:
              'Each drug carries its [schedule (H, H1, X)](/guides/drug-schedule-h-h1-x-pharmacy-compliance), and H1 dispensing captures the register fields the law needs — prescriber, patient, drug, quantity — so compliance is a by-product of dispensing, not a separate logbook.',
          },
        ],
      },
      {
        h2: 'How a medicine gets dispensed',
        body:
          'Here is the flow from prescription to a medicine in the patient’s hand.',
        steps: [
          { title: 'Prescription arrives', body: 'The doctor prescribes; the pharmacy sees it on screen — no paper slip to lose.' },
          { title: 'Pick the batch', body: 'The system suggests the oldest valid batch, so nothing expires unused and nothing expired goes out.' },
          { title: 'Dispense', body: 'The pharmacist dispenses against the prescription; stock drops automatically.' },
          { title: 'Bill', body: 'The charge posts to the walk-in receipt or the admitted patient’s running bill — no double entry.' },
        ],
      },
      {
        h2: 'Pharmacy software vs a stock register',
        body:
          'What changes the day a pharmacy moves off a paper stock book.',
        table: {
          headers: ['', 'Stock register', 'With Uyirly'],
          rows: [
            ['Expiry', 'Found when it is too late', 'Flagged before it expires'],
            ['Stock count', 'Always slightly out of date', 'Live and accurate'],
            ['Dispensing', 'Copied from a paper slip', 'Against the actual prescription'],
            ['Billing', 'Separate counter book', 'On the patient’s bill'],
            ['Reorder', 'From memory', 'Low-stock flags start the next purchase'],
            ['Schedule H1', 'A physical logbook', 'Captured automatically'],
          ],
        },
      },
    ],
    faqs: [
      {
        q: 'Does the pharmacy software track batch and expiry?',
        a: 'Yes. Every drug is tracked by batch and expiry, with alerts before items expire and oldest-valid-first dispensing, so stock stays accurate and expiry write-offs shrink. Anything below its reorder level starts the next purchase already filled in.',
      },
      {
        q: 'Can it bill both OPD walk-in sales and IPD ward medication?',
        a: 'Yes. A walk-in OPD customer is billed and receipted in one screen, while medication issued to an admitted patient posts straight to their IPD bill — both from the same pharmacy module, on the same patient record.',
      },
      {
        q: 'Does it handle Schedule H, H1 and X drug records?',
        a: 'Yes. Each drug carries its schedule, and every Schedule H1 or X supply writes itself to the register — serial number, date, patient, prescriber, drug, batch and quantity — as the medicine is handed over, exportable for inspection instead of kept as a physical logbook.',
      },
    ],
    related: [
      { label: 'Hospital pharmacy management, explained', href: '/guides/hospital-pharmacy-management-software-guide' },
      { label: 'Schedule H, H1 & X drugs', href: '/guides/drug-schedule-h-h1-x-pharmacy-compliance' },
      { label: 'Hospital management software', href: '/hospital-management-software' },
      { label: 'Hospital inventory & purchase orders', href: '/guides/hospital-inventory-purchase-order-guide' },
      { label: 'Pricing', href: '/pricing' },
    ],
    updated: '2026-08-04',
  },

  'radiology-information-system-software': {
    slug: 'radiology-information-system-software',
    eyebrow: 'Radiology (RIS) Software',
    group: GROUP_MODULE,
    tagline: 'Order to scan to report — modality worklist, structured reporting and templates on one patient record.',
    metaTitle: 'Radiology Information System (RIS) Software India',
    description:
      'Radiology information system (RIS) software for Indian hospitals — order to scan to verified report, modality worklist, reporting templates and billing.',
    keywords: [
      'radiology information system',
      'ris software',
      'radiology software',
      'radiology management software',
      'radiology reporting software',
      'radiology information system software',
    ],
    primaryKeyword: 'radiology information system',
    h1: 'Radiology information system (RIS) software',
    subhead:
      'A radiology department’s job is to turn an order into a verified report without anything getting lost in between. Uyirly’s RIS runs that whole path — order, modality worklist, scan, structured report — on the same patient record and billing as the rest of the hospital, so a scan ordered in a consultation comes back as a report the doctor can actually see.',
    heroBullets: [
      'Order → worklist → scan → verified report in one flow',
      'Modality worklist so technicians know what’s pending',
      'Reporting templates for faster, consistent reports',
      'Billing and patient record shared with the hospital',
    ],
    sections: [
      {
        h2: 'What a radiology information system does',
        body:
          'A RIS (radiology information system) manages the workflow and reports of a radiology department — distinct from a PACS, which stores the images themselves. The RIS is what makes sure an order becomes a worklist entry, the scan gets done, the report gets written and verified, and the result reaches the ordering doctor. Uyirly is the RIS layer: the workflow, the reporting and the billing, connected to one patient record.',
      },
      {
        h2: 'A worklist the technicians actually use',
        body:
          'The everyday failure of a busy radiology department is a scan that no one realises is pending. Uyirly gives technicians a live modality worklist — what’s ordered, what’s in progress, what’s done — so nothing sits forgotten and the department can see its own backlog at a glance.',
        preview: 'radiology',
        bullets: [
          'Orders flow from OPD/IPD into the radiology worklist',
          'Live status: ordered, in-progress, reported, verified',
          'Overdue scans surfaced instead of lost',
        ],
      },
      {
        h2: 'Structured reporting with templates',
        body:
          'Radiology reports are faster and more consistent when the radiologist starts from a template rather than a blank page. Uyirly supports reporting templates per study type, so a chest X-ray or an ultrasound report follows the same structure every time, and the verified report is formatted into a clean PDF ready to hand to the patient or attach to their record.',
      },
      {
        h2: 'Connected to the rest of the hospital',
        body:
          'A standalone radiology system means re-registering the patient and reconciling the bill separately. In Uyirly the RIS shares the same patient record and billing as OPD, IPD and the lab — so a scan ordered during a consultation lands on the same patient and the same bill, and the report joins the patient’s history alongside their lab results.',
        bullets: [
          'Scans ordered in a consultation reach radiology with no re-registration',
          'Radiology charges post to the patient’s running bill',
          'Reports sit on one history with lab and consultation records',
        ],
      },
      {
        h2: 'The order-to-report workflow',
        body:
          'A scan’s full journey through Uyirly — the same [radiology workflow](/guides/radiology-ris-reporting-guide) whether it is ordered from OPD or the ward.',
        steps: [
          { title: 'Order', body: 'The doctor orders the scan from a consultation; it appears on the radiology worklist.' },
          { title: 'Scan', body: 'The technician performs the study and marks it done — the worklist status updates live.' },
          { title: 'Report', body: 'The radiologist writes the report from a template for that study type.' },
          { title: 'Verify', body: 'The report is checked and signed off before release.' },
          { title: 'Deliver', body: 'The letterhead PDF reaches the doctor and patient, and the charge is already on the bill.' },
        ],
      },
    ],
    faqs: [
      {
        q: 'What is the difference between RIS and PACS?',
        a: 'A RIS (radiology information system) manages the workflow and reports — orders, worklist, reporting, billing — while a PACS stores and displays the actual images. They complement each other. Uyirly provides the RIS workflow and reporting on one shared patient record.',
      },
      {
        q: 'Does it handle reporting templates?',
        a: 'Yes. Radiologists can report from templates per study type, so reports are faster and consistent, and the verified report is formatted into a clean PDF for the patient or their record.',
      },
      {
        q: 'Can radiology share the same patient record as the rest of the hospital?',
        a: 'Yes. A scan ordered in an OPD or IPD consultation flows to radiology without re-registering the patient, the charge posts to their bill, and the report joins the same patient history as their lab and consultation records.',
      },
    ],
    related: [
      { label: 'Radiology & RIS reporting, explained', href: '/guides/radiology-ris-reporting-guide' },
      { label: 'Lab management software (LIMS)', href: '/lab-management-software' },
      { label: 'Hospital management software', href: '/hospital-management-software' },
      { label: 'Pricing', href: '/pricing' },
    ],
    updated: '2026-08-04',
  },

  'blood-bank-management-software': {
    slug: 'blood-bank-management-software',
    eyebrow: 'Blood Bank Software',
    group: GROUP_MODULE,
    tagline: 'Donors, stock by group and component, cross-match and full issue traceability — with expiry under control.',
    metaTitle: 'Blood Bank Management Software (India)',
    description:
      'Blood bank management software for India — donor records, stock by group and component, cross-matching, issue traceability and expiry control. Free trial.',
    keywords: [
      'blood bank management software',
      'blood bank software',
      'blood bank management system',
      'blood bank information system',
      'blood bank software india',
    ],
    primaryKeyword: 'blood bank management software',
    h1: 'Blood bank management software you can trust',
    subhead:
      'A blood bank runs on traceability: every unit has to be accounted for from donor to recipient, stored by group and component, cross-matched before issue, and never used past expiry. Uyirly’s blood bank management software tracks all of it on one system, so the bank is auditable and safe rather than run on a register and hope.',
    heroBullets: [
      'Donor records and donation history',
      'Stock by blood group and component',
      'Cross-matching before issue',
      'Full unit traceability, donor to recipient',
    ],
    sections: [
      {
        h2: 'Every unit accounted for, donor to recipient',
        body:
          'The whole point of a blood bank system is that no unit is ever unaccounted for. Uyirly gives each unit an identity from the moment it’s donated and tracks it through testing, storage, cross-match and issue, so at any time you know exactly what’s in stock, where each unit came from, and where it went. That traceability is what a paper register can never reliably give you.',
      },
      {
        h2: 'Stock by group and component',
        body:
          'Blood isn’t one thing — it’s groups and components (whole blood, packed cells, plasma, platelets), each with its own shelf life. Uyirly holds stock by group and component with expiry tracking, so you can see availability at a glance, use oldest-valid-first, and get warned before units expire instead of discovering it during a shortage.',
        preview: 'blood',
        bullets: [
          'Live availability by blood group and component',
          'Expiry tracking with warnings before units lapse',
          'Component separation recorded against the source unit',
        ],
      },
      {
        h2: 'Cross-match and safe issue',
        body:
          'A unit should only leave the bank against a valid request and a completed cross-match. Uyirly ties issue to the request and the cross-match result, records who authorised it, and keeps the recipient link — so issuing blood is a controlled, logged step, not a note in a book.',
      },
      {
        h2: 'Part of the hospital, not a silo',
        body:
          'Because the blood bank shares the hospital’s patient records and billing, a cross-match request for an admitted patient and the charge for a unit issued both connect to the same patient — no separate registration, no reconciling the bill later. It’s one system, with the blood bank’s controls where they’re needed.',
        bullets: [
          'Requests linked to the patient’s admission',
          'Issue charges post to the patient’s bill',
          'Auditable log of every donation, test and issue',
        ],
      },
      {
        h2: 'From donor to recipient',
        body:
          'Every unit follows a controlled, logged path — the same [blood bank workflow](/guides/blood-bank-management-guide) end to end.',
        steps: [
          { title: 'Donation', body: 'A donor is registered and the unit is recorded with its group and donation details.' },
          { title: 'Testing', body: 'The unit is screened and marked safe before it can be used.' },
          { title: 'Storage', body: 'It is stored by group and component with an expiry date the system watches.' },
          { title: 'Cross-match', body: 'On a request, the unit is cross-matched against the patient before issue.' },
          { title: 'Issue', body: 'The unit is issued against the request, the authoriser and recipient are recorded, and the charge posts to the bill.' },
        ],
      },
    ],
    faqs: [
      {
        q: 'Does it track blood units by group and component?',
        a: 'Yes. Stock is held by blood group and component (whole blood, packed cells, plasma, platelets) with expiry tracking, so availability is visible at a glance and units are used oldest-valid-first with warnings before they expire.',
      },
      {
        q: 'Does it support cross-matching and traceability?',
        a: 'Yes. Issue is tied to a valid request and a completed cross-match, with the authoriser and recipient recorded, and every unit is traceable from donor through testing and storage to issue.',
      },
      {
        q: 'Can it connect to the rest of the hospital system?',
        a: 'Yes. The blood bank shares the hospital’s patient records and billing, so a cross-match request links to the patient’s admission and the charge for an issued unit posts to their bill — no separate registration.',
      },
    ],
    related: [
      { label: 'Blood bank management, explained', href: '/guides/blood-bank-management-guide' },
      { label: 'Hospital management software', href: '/hospital-management-software' },
      { label: 'Multi-specialty hospital software', href: '/multi-specialty-hospital-software' },
      { label: 'Pricing', href: '/pricing' },
    ],
    updated: '2026-08-04',
  },

  'operation-theatre-management-software': {
    slug: 'operation-theatre-management-software',
    eyebrow: 'OT Management Software',
    group: GROUP_MODULE,
    tagline: 'Schedule theatres, teams and cases — with pre-op checklists, consumables and OT notes on the patient record.',
    metaTitle: 'Operation Theatre (OT) Management Software India',
    description:
      'Operation theatre (OT) management software for India — surgery scheduling, surgical team allocation, pre-op checklists, consumables and OT notes.',
    keywords: [
      'operation theatre management software',
      'ot management software',
      'ot scheduling software',
      'surgery scheduling software',
      'operation theatre scheduling',
      'ot management system',
    ],
    primaryKeyword: 'operation theatre management software',
    h1: 'Operation theatre management software',
    subhead:
      'An operation theatre is the most tightly scheduled, highest-stakes room in the hospital — a clash or a missed pre-op check has real consequences. Uyirly’s OT management software schedules theatres, surgeons and cases, runs the pre-op checklist, tracks consumables and captures OT notes, all tied to the patient record and the bill.',
    heroBullets: [
      'Theatre and surgery scheduling without clashes',
      'Surgeon, anaesthetist and room allocation',
      'Pre-op checklists so nothing is missed',
      'Consumables and OT notes on the patient record',
    ],
    sections: [
      {
        h2: 'Scheduling that prevents clashes',
        body:
          'The core of OT management is the schedule: a theatre, a surgeon, an anaesthetist and a slot, none of them double-booked. Uyirly schedules cases against theatre and team availability so two surgeries never land on the same table at the same time, and the day’s OT list is clear to everyone who needs it. That alone removes the most common source of theatre chaos.',
        preview: 'ot',
        bullets: [
          'Cases scheduled against theatre and team availability',
          'A clear daily OT list for staff',
          'Surgeon, anaesthetist and room allocated per case',
        ],
      },
      {
        h2: 'Pre-op checklists so nothing is missed',
        body:
          'A surgical safety checklist exists because missed steps in the OT are dangerous. Uyirly runs the pre-op checklist as part of the case, so consent, fasting status, investigations and the surgical site are confirmed before the patient enters — recorded, not remembered.',
      },
      {
        h2: 'Consumables and OT notes captured in place',
        body:
          'What’s used in theatre and what happened during surgery both need to be recorded — for the bill and for the record. Uyirly captures consumables and implants used in the case (so they reach the bill) and the OT / operative notes (so they join the patient’s history), instead of these being written on a slip and re-entered later.',
        bullets: [
          'Consumables and implants recorded against the case',
          'OT / operative notes on the patient record',
          'Case charges post to the patient’s bill',
        ],
      },
      {
        h2: 'Connected to admission and billing',
        body:
          'A surgery doesn’t stand alone — it’s part of an admission, with a bed, medicines and a bill. Because OT sits inside the wider system, the case links to the patient’s admission, the consumables and procedure charges post to the same IPD bill, and the whole stay stays coherent from admission to discharge.',
      },
      {
        h2: 'How a surgery flows through Uyirly',
        body:
          'From scheduling the case to the charges landing on the bill — the same [OT workflow](/guides/ot-scheduling-management-guide) every time.',
        steps: [
          { title: 'Schedule', body: 'Book the case against theatre, surgeon and anaesthetist availability — no clashes.' },
          { title: 'Pre-op check', body: 'Run the safety checklist — consent, fasting, investigations and surgical site — before the patient enters.' },
          { title: 'Surgery', body: 'The case proceeds; the team and room are already assigned.' },
          { title: 'Record', body: 'Consumables, implants and operative notes are captured against the case.' },
          { title: 'Bill', body: 'Procedure and consumable charges post to the patient’s IPD bill automatically.' },
        ],
      },
    ],
    faqs: [
      {
        q: 'Does it prevent double-booking of theatres?',
        a: 'Yes. Cases are scheduled against theatre and team availability, so a theatre, surgeon or anaesthetist can’t be double-booked, and the day’s OT list is clear to everyone involved.',
      },
      {
        q: 'Does it include a pre-op checklist?',
        a: 'Yes. The pre-op surgical safety checklist runs as part of the case — consent, fasting, investigations and surgical site confirmed and recorded before the patient enters theatre.',
      },
      {
        q: 'Do consumables and OT notes reach the bill and record?',
        a: 'Yes. Consumables and implants used in a case are recorded and post to the patient’s IPD bill, and the OT/operative notes join the patient’s record — no separate slip to re-enter.',
      },
    ],
    related: [
      { label: 'OT scheduling & management, explained', href: '/guides/ot-scheduling-management-guide' },
      { label: 'Multi-specialty hospital software', href: '/multi-specialty-hospital-software' },
      { label: 'Hospital management software', href: '/hospital-management-software' },
      { label: 'Pricing', href: '/pricing' },
    ],
    updated: '2026-08-04',
  },

  // ── Compare & alternatives (Phase 4) ──────────────────────────────────────
  // Neutral, nominative-fair-use comparison pages. No unverified claims about
  // the competitor; focus on Uyirly's own facts + honest evaluation criteria.
  'mocdoc-alternative': {
    slug: 'mocdoc-alternative',
    eyebrow: 'MocDoc Alternative',
    group: GROUP_COMPARE,
    tagline: 'Comparing MocDoc? Here’s how Uyirly approaches the same job — and what to weigh before you choose.',
    metaTitle: 'MocDoc Alternative for Indian Hospitals — Uyirly',
    description:
      'Considering a MocDoc alternative? See how Uyirly runs OPD, IPD, pharmacy, lab and billing on one platform with flat pricing and a 30-day free trial.',
    keywords: [
      'mocdoc alternative',
      'alternative to mocdoc',
      'mocdoc competitors',
      'mocdoc vs uyirly',
      'hospital software like mocdoc',
    ],
    primaryKeyword: 'mocdoc alternative',
    h1: 'A MocDoc alternative built for Indian hospitals',
    subhead:
      'MocDoc is a well-known hospital, clinic and diagnostics management platform in India. If you’re weighing it up, it’s worth comparing more than one option — this page lays out how Uyirly approaches the same job, and the criteria that actually matter when you choose, so you can decide on your own hospital rather than a demo.',
    heroBullets: [
      'OPD, IPD, pharmacy, lab and billing on one platform',
      'One patient record and one bill across departments',
      'Flat monthly pricing — no per-bed or per-user metering',
      '30-day free trial, no credit card',
    ],
    sections: [
      {
        h2: 'Why hospitals compare alternatives',
        body:
          'Choosing hospital software is a multi-year decision, so it makes sense to compare a few options rather than sign the first demo. The reasons hospitals look around are usually the same: they want modules that genuinely share one patient and one bill, pricing that stays predictable as they grow, workflows that fit how Indian hospitals actually run, and a way to try the software on real patients before committing. Judge every option — including Uyirly — against those, not a feature checklist.',
      },
      {
        h2: 'What Uyirly is',
        body:
          'Uyirly is an all-in-one cloud hospital management system built for India: OPD, IPD, pharmacy, lab (LIS), radiology (RIS), billing, insurance/TPA, blood bank, OT and staff, all on one shared patient record and one bill. It’s designed so a patient registered once flows through consultation, admission, tests, medicines and billing without being re-entered, and so the discharge bill and insurance claim are ready the moment the patient is cleared.',
        preview: 'dashboard',
        bullets: [
          'One patient and one bill across every department',
          'GST-ready billing, TPA cashless claims, ABDM/ABHA-ready records',
          'Cloud-based — nothing to install, works on any device',
        ],
      },
      {
        h2: 'Uyirly at a glance — and what to confirm',
        body:
          'Here is where Uyirly stands on the things that actually decide a hospital-software choice. We only speak for our own product — please confirm MocDoc’s current features and pricing with them directly.',
        table: {
          headers: ['What to compare', 'Uyirly', 'MocDoc'],
          rows: [
            ['Pricing model', 'Flat monthly, no per-bed/user fees', 'Confirm with vendor'],
            ['Hosting', 'Cloud — nothing to install', 'Confirm with vendor'],
            ['Integration', 'One patient & one bill everywhere', 'Confirm with vendor'],
            ['India fit', 'GST, TPA, ABDM, NABH built in', 'Confirm with vendor'],
            ['Free trial', '30-day free trial, no credit card', 'Confirm with vendor'],
            ['Mobile app', 'Native app for staff & patients', 'Confirm with vendor'],
          ],
        },
      },
      {
        h2: 'What to weigh when you compare',
        body:
          'The honest way to compare any two hospital systems is to run the same real scenario through each: register a patient, order a lab test from a consultation, dispense a medicine, and reach discharge with an itemised bill and an insurance claim ready. Whichever handles that without re-entering the patient or hand-totalling the bill will save your staff time every day. Then check the pricing model — flat, or metered per bed/user — and whether you can trial it on real work.',
        bullets: [
          'Does one patient and one bill flow through every department?',
          'Is pricing flat, or does it climb with beds and users?',
          'Can you trial it on your own hospital before committing?',
        ],
      },
      {
        h2: 'How to compare in a week',
        body:
          'The fairest comparison is a short, real test — not a feature spreadsheet. See our [buyer’s guide](/best-hospital-management-software-in-india) for the full method.',
        steps: [
          { title: 'Run the same scenario in each', body: 'Register a patient, order a test from a consultation, dispense a medicine, and reach discharge with an itemised bill and insurance claim ready.' },
          { title: 'Check the pricing model', body: 'Ask for the total monthly cost at your current size and at double your size — flat vs per-bed/user changes the answer fast.' },
          { title: 'Let your staff try it', body: 'A front-desk person and a nurse will tell you in minutes which is easier to use.' },
          { title: 'Decide on fit', body: 'Pick the one that handled your workflow with the least friction. Start a [free Uyirly trial](/signup) to include it in the test.' },
        ],
      },
      {
        h2: 'Why Uyirly could be your alternative',
        body:
          'Uyirly’s bet is simple: flat monthly pricing with no per-bed fees, genuine all-in-one integration, native India-fit (GST, TPA, ABDM, NABH), and a 30-day free trial with no card so you judge it on your own patients and bills. If those are the things pulling you to look beyond your current shortlist, it’s worth a trial — the fairest comparison you can run.',
      },
    ],
    faqs: [
      {
        q: 'Is Uyirly a good alternative to MocDoc?',
        a: 'It depends on what you need — the right choice varies by hospital size, specialties and budget. Uyirly is an all-in-one cloud HMS for Indian hospitals with flat pricing and a 30-day free trial, so the fairest way to judge it as an alternative is to run your real workflows through it and compare. We’d encourage you to verify any other product’s current features and pricing with them directly.',
      },
      {
        q: 'How do I compare Uyirly and MocDoc fairly?',
        a: 'Run the same scenario through both: register a patient, order a test from a consultation, dispense a medicine, and reach discharge with an itemised bill and an insurance claim ready. Also compare the pricing model (flat vs per-bed/user) and whether you can trial on real patients. Integration and pricing model separate most systems more than feature lists do.',
      },
      {
        q: 'Does Uyirly offer a free trial?',
        a: 'Yes — a 30-day free trial with no credit card, so you can run your real front desk, consultations and billing before paying anything.',
      },
    ],
    related: [
      { label: 'Best hospital management software in India', href: '/best-hospital-management-software-in-india' },
      { label: 'Hospital management software', href: '/hospital-management-software' },
      { label: 'Clinic management software', href: '/clinic-management-software' },
      { label: 'Pricing', href: '/pricing' },
    ],
    disclaimer: TM('MocDoc'),
    updated: '2026-08-04',
  },

  'healthray-alternative': {
    slug: 'healthray-alternative',
    eyebrow: 'Healthray Alternative',
    group: GROUP_COMPARE,
    tagline: 'Looking beyond Healthray? See how Uyirly runs the whole hospital on one system — and what to compare.',
    metaTitle: 'Healthray Alternative for Indian Hospitals — Uyirly',
    description:
      'Exploring a Healthray alternative? See how Uyirly connects OPD, IPD, pharmacy, lab and billing on one platform with flat pricing and a 30-day free trial.',
    keywords: [
      'healthray alternative',
      'alternative to healthray',
      'healthray competitors',
      'healthray vs uyirly',
      'hospital software like healthray',
    ],
    primaryKeyword: 'healthray alternative',
    h1: 'A Healthray alternative for Indian hospitals',
    subhead:
      'Healthray is a hospital management software that has been getting attention in India. If it’s on your shortlist, comparing a second option is time well spent — here’s how Uyirly approaches the same problem of running a whole hospital on one system, and the things worth checking before you commit.',
    heroBullets: [
      'Every department on one shared patient record and bill',
      'Discharge bill and TPA claim ready at checkout',
      'Flat monthly pricing, no per-bed metering',
      '30-day free trial, no credit card',
    ],
    sections: [
      {
        h2: 'Start from the job, not the brand',
        body:
          'A hospital system earns its keep by doing one thing well: keeping a single patient coherent as they move through registration, consultation, admission, tests, pharmacy and billing. Whatever names are on your shortlist, judge each on whether it does that cleanly. The rest — a longer feature list, a slicker demo — matters far less than whether the daily work flows without re-entry.',
      },
      {
        h2: 'How Uyirly runs the whole hospital',
        body:
          'Uyirly connects OPD, IPD, pharmacy, lab (LIS), radiology (RIS), billing, insurance/TPA, blood bank, OT and staff on one shared patient record. Bed charges accrue daily, tests and medicines post as they happen, and the discharge bill and insurance claim build themselves in real time — so discharge is fast and defensible rather than a manual reconciliation at the end.',
        preview: 'dashboard',
        bullets: [
          'One patient and one bill, no re-entry between departments',
          'Daily IPD auto-billing; discharge bill ready at checkout',
          'GST billing, TPA claims, ABDM/ABHA-ready records',
        ],
      },
      {
        h2: 'Uyirly at a glance — and what to confirm',
        body:
          'Where Uyirly stands on the things that decide the choice. We speak only for our own product — please confirm Healthray’s current features and pricing with them directly.',
        table: {
          headers: ['What to compare', 'Uyirly', 'Healthray'],
          rows: [
            ['Pricing model', 'Flat monthly, no per-bed/user fees', 'Confirm with vendor'],
            ['Integration', 'One patient & one bill everywhere', 'Confirm with vendor'],
            ['IPD billing', 'Daily auto-billing, ready at discharge', 'Confirm with vendor'],
            ['India fit', 'GST, TPA, ABDM, NABH built in', 'Confirm with vendor'],
            ['Free trial', '30-day free trial, no credit card', 'Confirm with vendor'],
          ],
        },
      },
      {
        h2: 'The comparison that tells you the truth',
        body:
          'Ask each vendor to show you a bill for a patient who is still admitted, mid-stay. A system where bed rent and nursing are already on that bill, current as of last night, has solved daily auto-billing. A system that calculates it at discharge is telling you discharge will be slow. That single test, plus the pricing model and a real free trial, separates the options faster than any feature grid.',
        bullets: [
          'Can it show a live, mid-stay bill that’s already accurate?',
          'Is pricing flat, or metered per bed and per user?',
          'Can you trial it on your own patients first?',
        ],
      },
      {
        h2: 'Why Uyirly could be the switch',
        body:
          'Uyirly leads with flat monthly pricing (no per-bed fees), all-in-one integration, native India-fit — GST, TPA, ABDM, NABH — and a 30-day free trial with no card. If those are what’s drawing you to compare, a trial on your own hospital is the most honest way to see whether it’s the right alternative for you.',
      },
    ],
    faqs: [
      {
        q: 'Is Uyirly a good alternative to Healthray?',
        a: 'The best fit depends on your hospital’s size, specialties and budget. Uyirly is an all-in-one cloud HMS built for Indian hospitals, with flat pricing and a 30-day free trial, so the fairest way to judge it as an alternative is to run your real workflows through it. Please verify any other product’s current features and pricing with them directly.',
      },
      {
        q: 'What should I compare between Uyirly and Healthray?',
        a: 'Focus on integration (does one patient and one bill flow through every department?), the pricing model (flat vs per-bed/user), India-fit (GST, TPA, ABDM, NABH handled natively), and whether you can trial the software on real patients before committing.',
      },
      {
        q: 'Can I try Uyirly before switching?',
        a: 'Yes — Uyirly offers a 30-day free trial with no credit card, so you can run your real hospital workflows and compare before making any decision.',
      },
    ],
    related: [
      { label: 'Best hospital management software in India', href: '/best-hospital-management-software-in-india' },
      { label: 'Hospital management software', href: '/hospital-management-software' },
      { label: 'Pricing', href: '/pricing' },
    ],
    disclaimer: TM('Healthray'),
    updated: '2026-08-04',
  },

  'docpulse-alternative': {
    slug: 'docpulse-alternative',
    eyebrow: 'DocPulse Alternative',
    group: GROUP_COMPARE,
    tagline: 'Comparing DocPulse? See how Uyirly connects clinic and hospital on one system — and what to check.',
    metaTitle: 'DocPulse Alternative for Clinics & Hospitals — Uyirly',
    description:
      'Considering a DocPulse alternative? See how Uyirly runs clinics and hospitals on one platform — appointments, OPD, IPD, pharmacy and billing — with flat pricing and a 30-day free trial.',
    keywords: [
      'docpulse alternative',
      'alternative to docpulse',
      'docpulse competitors',
      'docpulse vs uyirly',
      'clinic software like docpulse',
    ],
    primaryKeyword: 'docpulse alternative',
    h1: 'A DocPulse alternative for clinics and hospitals',
    subhead:
      'DocPulse is a clinic and hospital management platform used in India. If you’re comparing it, it’s worth seeing a second option that spans the same range — from a single clinic’s appointments and OPD to a full hospital’s IPD and billing. Here’s how Uyirly approaches it, and what to weigh before you choose.',
    heroBullets: [
      'Appointments and OPD queue through to IPD and billing',
      'One patient record from clinic to hospital',
      'Flat monthly pricing, no per-user metering',
      '30-day free trial, no credit card',
    ],
    sections: [
      {
        h2: 'From a clinic to a hospital on one platform',
        body:
          'A lot of practices start as a clinic and grow — adding beds, a lab, more doctors. The software you pick should cover that whole arc without a migration. Uyirly runs a single clinic’s appointments, OPD queue, prescriptions and billing, and the same platform runs a full hospital’s IPD, pharmacy, lab and insurance — so the clinic you set up today extends into a hospital on one patient database.',
      },
      {
        h2: 'What Uyirly connects',
        body:
          'Appointments and a live OPD token queue, prescriptions from a drug list, pharmacy dispensing, lab and radiology, IPD admissions and daily billing, insurance/TPA claims — all on one shared patient record and one bill. A test ordered in a consultation reaches the lab and its charge lands on the same bill; nothing is re-keyed between the front desk, the doctor and the pharmacy.',
        preview: 'dashboard',
        bullets: [
          'One patient record across clinic and hospital workflows',
          'Prescription, pharmacy and billing tied to the consultation',
          'GST billing, TPA claims, ABDM/ABHA-ready records',
        ],
      },
      {
        h2: 'Uyirly at a glance — and what to confirm',
        body:
          'Where Uyirly stands on the things that decide the choice. We speak only for our own product — please confirm DocPulse’s current features and pricing with them directly.',
        table: {
          headers: ['What to compare', 'Uyirly', 'DocPulse'],
          rows: [
            ['Clinic to hospital', 'Same platform, no migration', 'Confirm with vendor'],
            ['Pricing model', 'Flat monthly, no per-user fees', 'Confirm with vendor'],
            ['Integration', 'One patient & one bill everywhere', 'Confirm with vendor'],
            ['India fit', 'GST, TPA, ABDM, NABH built in', 'Confirm with vendor'],
            ['Free trial', '30-day free trial, no credit card', 'Confirm with vendor'],
          ],
        },
      },
      {
        h2: 'What to check before you choose',
        body:
          'Run the same real scenario through each option: book an appointment, see the patient, prescribe, dispense, and produce a clean bill — then, for a hospital, admit a patient and reach discharge with an itemised bill ready. Whichever does that without re-entry wins the day-to-day. Then compare the pricing model and whether you can trial it on real work rather than a demo dataset.',
        bullets: [
          'Does the clinic-to-hospital path work without switching systems?',
          'Is pricing flat, or metered per user?',
          'Can you trial it on your own patients first?',
        ],
      },
      {
        h2: 'Why Uyirly could be your pick',
        body:
          'Uyirly leads with flat monthly pricing (no per-user fees), one platform from clinic to hospital, native India-fit — GST, TPA, ABDM, NABH — and a 30-day free trial with no card. If you want one system that grows from a clinic into a hospital, a trial on your own practice is the clearest way to compare.',
      },
    ],
    faqs: [
      {
        q: 'Is Uyirly a good alternative to DocPulse?',
        a: 'It depends on your needs — clinic size, whether you run inpatient care, specialties and budget. Uyirly runs both clinic and hospital workflows on one platform with flat pricing and a 30-day free trial, so the fairest way to judge it as an alternative is to run your own workflows through it. Please verify any other product’s current features and pricing with them directly.',
      },
      {
        q: 'Does Uyirly work for both a clinic and a hospital?',
        a: 'Yes. The same platform runs a single clinic’s appointments, OPD, prescriptions and billing, and a full hospital’s IPD, pharmacy, lab and insurance — on one patient database, so a growing clinic extends into a hospital without re-platforming.',
      },
      {
        q: 'Is there a free trial to compare with?',
        a: 'Yes — a 30-day free trial with no credit card, so you can run your real clinic or hospital workflows before deciding.',
      },
    ],
    related: [
      { label: 'Clinic management software', href: '/clinic-management-software' },
      { label: 'Hospital management software', href: '/hospital-management-software' },
      { label: 'Best hospital management software in India', href: '/best-hospital-management-software-in-india' },
    ],
    disclaimer: TM('DocPulse'),
    updated: '2026-08-04',
  },

  'insta-alternative': {
    slug: 'insta-alternative',
    eyebrow: 'Insta Alternative',
    group: GROUP_COMPARE,
    tagline: 'Weighing Insta by Practo? See how Uyirly runs the whole hospital on one system — and what to compare.',
    metaTitle: 'Insta Alternative for Hospitals & Clinics — Uyirly',
    description:
      'Looking for an Insta (by Practo) alternative? See how Uyirly runs OPD, IPD, pharmacy, lab and billing on one platform with flat pricing and a 30-day free trial.',
    keywords: [
      'insta alternative',
      'alternative to insta',
      'insta by practo alternative',
      'insta hms competitors',
      'insta vs uyirly',
      'hospital software like insta',
    ],
    primaryKeyword: 'insta alternative',
    h1: 'An Insta alternative for hospitals and clinics',
    subhead:
      'Insta (by Practo) is a well-established hospital information system used across India, with a strength in larger hospitals. If it’s on your shortlist, comparing a second option is time well spent — especially if you run a clinic or nursing home, where fit and pricing matter as much as feature depth. Here’s how Uyirly approaches the same job, and what to check before you commit.',
    heroBullets: [
      'Every department on one shared patient record and bill',
      'Built to fit clinics & nursing homes, not just large hospitals',
      'Flat monthly pricing — no per-bed or per-user metering',
      '30-day free trial, no credit card',
    ],
    sections: [
      {
        h2: 'Match the software to your size',
        body:
          'Some hospital systems are built for large multi-specialty hospitals and can feel heavy in a clinic or nursing home — more modules to configure, more per-user and per-bed cost, a longer rollout. The right question isn’t “which has the longest feature list,” it’s “which fits how we actually run, at our size, without paying for scale we don’t have yet.” Judge every option — including Uyirly — on that fit, not on the demo for a 500-bed hospital.',
      },
      {
        h2: 'How Uyirly runs the whole hospital',
        body:
          'Uyirly connects OPD, IPD, pharmacy, lab (LIS), radiology (RIS), billing, insurance/TPA, blood bank, OT and staff on one shared patient record. A patient is registered once and flows through consultation, tests, medicines and billing without re-entry; bed charges accrue daily and the discharge bill and insurance claim build themselves in real time. It’s the same all-in-one integration a large hospital needs, packaged so a clinic can switch it on in days.',
        preview: 'dashboard',
        bullets: [
          'One patient and one bill across every department',
          'GST billing, TPA cashless claims, ABDM/ABHA-ready records',
          'Patient app with family accounts — reports & bills online',
        ],
      },
      {
        h2: 'Uyirly at a glance — and what to confirm',
        body:
          'Where Uyirly stands on the things that decide the choice. We speak only for our own product — please confirm Insta’s current features and pricing with them directly.',
        table: {
          headers: ['What to compare', 'Uyirly', 'Insta'],
          rows: [
            ['Best-fit size', 'Clinics, nursing homes & hospitals', 'Confirm with vendor'],
            ['Pricing model', 'Flat monthly, no per-bed/user fees', 'Confirm with vendor'],
            ['Integration', 'One patient & one bill everywhere', 'Confirm with vendor'],
            ['India fit', 'GST, TPA, ABDM, NABH built in', 'Confirm with vendor'],
            ['Patient app', 'Family accounts, reports & bills online', 'Confirm with vendor'],
            ['Free trial', '30-day free trial, no credit card', 'Confirm with vendor'],
          ],
        },
      },
      {
        h2: 'The comparison that tells you the truth',
        body:
          'Run the same real scenario through each system: register a patient, order a lab test from a consultation, dispense a medicine, and reach discharge with an itemised bill and an insurance claim ready. Then ask for the total monthly cost at your current size and at double your size — a flat plan and a per-bed/user plan diverge fast. Whichever handles the workflow with the least friction, at a price that stays predictable as you grow, is your answer.',
        bullets: [
          'Does one patient and one bill flow through every department?',
          'Is pricing flat, or does it climb with beds and users?',
          'Can you trial it on your own hospital before committing?',
        ],
      },
      {
        h2: 'How to compare in a week',
        body:
          'The fairest comparison is a short, real test — not a feature spreadsheet. See our [buyer’s guide](/best-hospital-management-software-in-india) for the full method.',
        steps: [
          { title: 'Run the same scenario in each', body: 'Register a patient, order a test from a consultation, dispense a medicine, and reach discharge with an itemised bill and insurance claim ready.' },
          { title: 'Check the pricing model', body: 'Ask for the total monthly cost at your current size and at double it — flat vs per-bed/user changes the answer fast.' },
          { title: 'Let your staff try it', body: 'A front-desk person and a nurse will tell you in minutes which is easier to use day to day.' },
          { title: 'Decide on fit', body: 'Pick the one that handled your workflow with the least friction. Start a [free Uyirly trial](/signup) to include it in the test.' },
        ],
      },
      {
        h2: 'Why Uyirly could be your alternative',
        body:
          'Uyirly’s bet is simple: all-in-one integration that fits a clinic as well as a hospital, flat monthly pricing with no per-bed fees, native India-fit (GST, TPA, ABDM, NABH), a patient app your patients actually use, and a 30-day free trial with no card. If you’re looking beyond Insta because you want something that fits your size and keeps pricing predictable, it’s worth a trial on your own patients — the most honest comparison you can run.',
      },
    ],
    faqs: [
      {
        q: 'Is Uyirly a good alternative to Insta?',
        a: 'It depends on your hospital’s size, specialties and budget. Uyirly is an all-in-one cloud HMS that fits clinics and nursing homes as well as hospitals, with flat pricing and a 30-day free trial — so the fairest way to judge it is to run your real workflows through it. Please verify any other product’s current features and pricing with them directly.',
      },
      {
        q: 'What should I compare between Uyirly and Insta?',
        a: 'Focus on best-fit size for your hospital, integration (does one patient and one bill flow through every department?), the pricing model (flat vs per-bed/user), India-fit (GST, TPA, ABDM, NABH handled natively), and whether you can trial the software on real patients before committing.',
      },
      {
        q: 'Does Uyirly offer a free trial?',
        a: 'Yes — a 30-day free trial with no credit card, so you can run your real front desk, consultations and billing before paying anything.',
      },
    ],
    related: [
      { label: 'Clinic management software', href: '/clinic-management-software' },
      { label: 'Nursing home management software', href: '/nursing-home-management-software' },
      { label: 'Best hospital management software in India', href: '/best-hospital-management-software-in-india' },
      { label: 'Pricing', href: '/pricing' },
    ],
    disclaimer: TM('Insta'),
    updated: '2026-08-12',
  },
}

export function solutionSlugs(): string[] {
  return Object.keys(SOLUTIONS)
}

export function getSolution(slug: string): SolutionMeta | undefined {
  return SOLUTIONS[slug]
}

/** All solutions, in registry order, grouped by their `group` for the hub page. */
export function solutionsByGroup(): { group: string; items: SolutionMeta[] }[] {
  const order: string[] = []
  const map = new Map<string, SolutionMeta[]>()
  for (const slug of solutionSlugs()) {
    const s = SOLUTIONS[slug]
    if (!map.has(s.group)) { map.set(s.group, []); order.push(s.group) }
    map.get(s.group)!.push(s)
  }
  return order.map((group) => ({ group, items: map.get(group)! }))
}

const SITE = 'https://www.uyirly.com'

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
