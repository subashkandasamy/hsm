import type { Metadata } from 'next'

// Commercial "solution" landing pages — the buyer-intent counterpart to /guides.
// Each entry is one top-level page (e.g. /lab-management-software) built to rank
// for a high-volume, low-competition, buyer-intent keyword cluster and convert to
// a free-trial signup. Content lives here (single source of truth); the route
// folder under src/app/<slug>/ is a thin wrapper around <SolutionShell slug=… />,
// and the /solutions hub lists every entry grouped by `group`.

export interface SolutionSection {
  h2: string
  body: string
  bullets?: string[]
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
  updated: string // YYYY-MM-DD
}

const GROUP_SOFTWARE = 'Software for your hospital'
const GROUP_BUYING = 'Choosing & buying'
const GROUP_SPECIALTY = 'By specialty & facility'

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
        h2: 'What lab management software actually does',
        body:
          'A laboratory information management system — LIMS, or LIS when people mean the clinical-lab version — exists to make one thing impossible: a sample getting lost, or a result reaching the wrong patient. Good lab management software gives every sample a barcoded identity the instant it is collected, then tracks it through accessioning, testing and verification, so at any moment you know exactly where a test is and who touched it. That living audit trail is the one thing a paper register or an Excel sheet can never give a pathology lab.',
      },
      {
        h2: 'Sample tracking that closes the biggest gap in a lab',
        body:
          'Most of a lab’s real risk sits between collection and result — the tube that gets mislabelled, the sample nobody logged, the report that goes out under the wrong name. Uyirly’s sample tracking follows each specimen by barcode through every stage, flags anything overdue, and ties the final value back to the exact tube it came from. Technicians stop hunting for samples and start clearing the worklist.',
        bullets: [
          'Barcoded samples from the collection point onward',
          'A live worklist of what’s pending, in-process and verified',
          'Overdue and unaccessioned samples flagged automatically',
        ],
      },
      {
        h2: 'The test catalogue does the heavy lifting',
        body:
          'Everything in a diagnostic lab flows from the test master. In Uyirly every test carries its reference ranges, units, sample type, method and price, and you can bundle tests into panels, profiles and health packages once. After that, ordering, reporting and billing all read from the same definition — so a CBC or an LFT is priced, collected and reported the same way no matter who books it or on which day.',
        bullets: [
          'Reference ranges flag high and low values on the report automatically',
          'Panels, profiles and health packages with package pricing',
          'Per-test and per-panel pricing flows straight to the bill',
        ],
      },
      {
        h2: 'Reports that are ready to hand over',
        body:
          'The whole point of the software is the finished report, and reporting is where cheap lab software falls down. Uyirly formats results into a clean, letterhead PDF the moment a value is verified — reference ranges in place, the verifying pathologist named, interpretive notes and cumulative history where they help. Instead of asking a patient to come back for a printout, you deliver it over WhatsApp or a patient portal the minute it’s signed off.',
      },
      {
        h2: 'Lab billing and records are one system, not three',
        body:
          'Standalone LIMS force you to re-key the patient and reconcile the bill somewhere else. In Uyirly the lab shares the same patient record and billing as OPD, IPD and pharmacy. A test ordered from a doctor’s consultation lands on the same patient and the same bill; a walk-in lab customer is registered, billed and receipted in one screen; and every test a patient has ever had sits on one history. That’s the difference between lab software and a lab bolted onto a spreadsheet.',
        bullets: [
          'Tests ordered in OPD/IPD reach the lab with no re-registration',
          'Lab charges join the patient’s running bill automatically',
          'One patient history across lab, pharmacy, radiology and clinic',
        ],
      },
      {
        h2: 'From a single pathology lab to a full hospital lab',
        body:
          'A standalone diagnostic lab uses Uyirly for walk-in registration, sample tracking, reporting and billing on its own. A hospital pathology department uses the very same lab management system inside the wider platform, so tests ordered from the wards and OPD flow in without re-registering the patient and every charge lands on the patient’s bill. You don’t outgrow it — the lab you set up today is the lab that scales.',
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
      { label: 'Radiology & RIS reporting', href: '/guides/radiology-ris-reporting-guide' },
    ],
    updated: '2026-07-29',
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
        h2: 'What clinic management software should do',
        body:
          'The everyday failure of a paper clinic is that the front desk, the doctor and the pharmacy each keep their own version of the patient. Good clinic management software keeps exactly one: registration, the consultation, the prescription, the bill and the medicines dispensed all attach to a single patient record that everyone in the clinic reads from. Nothing is re-entered, nothing is lost between the desk and the doctor, and the clinic finally runs off one source of truth instead of three registers.',
      },
      {
        h2: 'Appointments and a queue the waiting room actually needs',
        body:
          'Walk-ins and booked appointments arrive in the same waiting room, and fairness is about who is genuinely next — not who asks loudest. Uyirly gives patients online appointment booking and runs a live token queue that the front desk and the doctor share, so patients are called in order and the doctor’s screen always shows who is waiting. It’s the part of any clinic software that staff feel on day one.',
        bullets: [
          'Online booking plus walk-in tokens in one ordered queue',
          'The doctor’s worklist updates live as patients arrive and finish',
          'Repeat patients found instantly by phone number or UHID',
        ],
      },
      {
        h2: 'Prescribe, bill and dispense without re-typing',
        body:
          'A consultation ends in a prescription and a bill, and often a strip of medicine from the clinic pharmacy. Uyirly carries the same order through all three: the doctor prescribes from a drug list, the charge lands on the bill, and the pharmacy dispenses against the same prescription. The money and the medicine always match the consultation — and a doctor can reuse a previous prescription in a couple of taps for a returning patient.',
      },
      {
        h2: 'One patient history, seen by the whole clinic',
        body:
          'Because every visit hangs on one patient record, any doctor in the clinic opens a patient and sees the full history — past complaints, prescriptions, lab results and bills — instead of flipping through an OPD card. For a doctor clinic that means better continuity; for a polyclinic with several specialists it means a patient moving between departments carries their record with them.',
        bullets: [
          'Every visit, prescription and bill on one patient timeline',
          'Works for a single doctor or many doctors on the same database',
          'Lab and pharmacy results attached to the same record',
        ],
      },
      {
        h2: 'Is there free clinic management software?',
        body:
          'Plenty of tools advertise “free clinic management software”, and the catch is usually the same — free until you have real patients, then a per-user or per-patient meter starts running. Uyirly takes the honest version of free: a 30-day free trial with no credit card, so you can run your actual front desk, consultations and billing before paying anything. After that it’s a flat monthly plan, not a fee that grows every time you add a patient or a login.',
      },
      {
        h2: 'Starts as a clinic, grows into a hospital',
        body:
          'A clinic that adds beds, a lab, or a second and third doctor shouldn’t have to switch software and re-enter its patients. Uyirly is the same platform that runs full hospitals — OPD, IPD, pharmacy, lab, billing and staff — so the clinic you set up today extends into admissions, diagnostics and multiple doctors without a migration. It’s cloud-based, so there’s nothing to install and it works on any device.',
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
        a: 'Uyirly offers a 30-day free trial with no credit card, so a clinic can run its real front desk, consultations and billing before paying anything. After the trial it moves to a flat monthly plan with no per-user or per-patient metering, which is usually cheaper in practice than “free” tools that charge as you grow.',
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
        q: 'Is the clinic software cloud-based?',
        a: 'Yes. Uyirly is fully cloud-based — there is nothing to install, it works on any device, and your data is backed up automatically. You can sign up and start seeing patients the same day.',
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
        h2: 'The record is the point',
        body:
          'Electronic medical records software earns its place by answering one question instantly: what has happened to this patient before? Uyirly gives every patient a single UHID and hangs everything on it — each OPD consultation, each admission, every lab result and scan, every prescription and bill — so a doctor opening the record sees the whole history on one timeline, not a folder someone has to reassemble. That is the difference between digital medical records and a pile of scanned paper.',
      },
      {
        h2: 'EMR and EHR — and why the difference matters in India',
        body:
          'An EMR (electronic medical record) is the record within one hospital; an EHR (electronic health record) is the record designed to follow the patient between providers. India’s ABDM — the Ayushman Bharat Digital Mission — is building exactly that portability through the ABHA health ID. Uyirly is built for both: a complete EMR inside your facility, and ABDM/ABHA-ready so records can link to a patient’s national health account rather than staying locked in one building.',
        bullets: [
          'A full EMR across OPD, IPD, lab, radiology and pharmacy',
          'ABDM/ABHA-ready — link records to a patient’s ABHA',
          'Scan-and-share style registration on the roadmap',
        ],
      },
      {
        h2: 'Structured records, not just typed notes',
        body:
          'Digital medical records software is only useful if you can find things in it later. Uyirly captures vitals, diagnoses, prescriptions, lab and radiology results as structured data attached to the visit — so a patient’s medication history, past diagnoses and trends in a lab value are searchable and visible at a glance, not buried in free text. Doctors get the context they need in seconds instead of leafing through old sheets.',
      },
      {
        h2: 'One record, safely shared',
        body:
          'A shared record is only safe if access is controlled. Uyirly is role-based — a receptionist, a doctor, a lab technician and an accountant each see exactly what their job needs — and every access and change is audit-logged. The record is one; who can read and edit which part of it is not. That combination is what makes an electronic health record system both useful across the hospital and defensible under India’s data-protection rules.',
        bullets: [
          'Role-based access for reception, doctors, lab, pharmacy and accounts',
          'Every view and edit audit-logged',
          'Aligned with India’s DPDP data-protection expectations',
        ],
      },
      {
        h2: 'Records connected to the work, not a separate silo',
        body:
          'Many EMR systems sit apart from billing and operations, so the record and the money drift out of sync. In Uyirly the medical record is the same system that runs the queue, the lab, the pharmacy and the bill — so ordering a test, dispensing a medicine or raising an invoice all write to the same patient history automatically. The record stays complete without anyone re-entering it, because it’s a by-product of running the hospital.',
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
    ],
    updated: '2026-07-29',
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
        h2: 'What a hospital management system is',
        body:
          'Hospital management software — an HMS, sometimes called a hospital information system or hospital ERP — is one system that runs a hospital’s day-to-day operations on a single shared patient record. Instead of separate registers for registration, the OPD queue, IPD beds, pharmacy, lab, radiology, billing, insurance and staff, everything lives in one place and talks to everything else. A patient registered once flows through consultation, admission, tests, medicines and billing without being re-entered anywhere.',
      },
      {
        h2: 'One system beats a dozen registers',
        body:
          'A hospital run on separate registers and spreadsheets spends its day reconciling them — the pharmacy stock never matches the bill, the lab result never reaches the ward, the discharge waits while someone totals charges by hand. Uyirly replaces that with one system where every department reads and writes the same patient. The reconciliation work simply disappears, because there’s only one set of numbers.',
      },
      {
        h2: 'Every department, actually connected',
        body:
          'The value isn’t any single module — it’s that they share one patient and one bill. A test ordered in OPD reaches the lab; the result reaches the doctor; the medicine dispensed by pharmacy and the bed charged in IPD both land on the same running bill, ready at discharge. That connectedness is what separates a real hospital management system from a bundle of tools that happen to share a login.',
        bullets: [
          'OPD queue, IPD admission & bed management, discharge billing',
          'Pharmacy, lab (LIS), radiology (RIS), blood bank and OT',
          'Insurance/TPA claims, emergency triage, staff & payroll',
        ],
      },
      {
        h2: 'Billing that is ready at discharge',
        body:
          'The slowest moment in most hospitals is discharge, because the final bill is assembled by hand. In Uyirly the bill builds itself as care happens — bed charges accrue daily, consultations, tests, medicines and procedures post automatically — so the discharge bill and the insurance claim are ready, itemised and defensible the moment the patient is cleared. Faster discharges, fewer disputes, and revenue that stops leaking through missed charges.',
      },
      {
        h2: 'Built for Indian hospitals',
        body:
          'Uyirly is made for how hospitals run in India — GST-ready billing, insurance and TPA cashless claims, ABDM/ABHA-ready records, and workflows that map to NABH expectations. It’s cloud-based with flat monthly pricing and no per-bed or per-user metering, so a small nursing home and a multi-specialty hospital run the same software and only pay for the plan they need.',
        bullets: [
          'GST-ready invoices and India insurance/TPA claim workflows',
          'ABDM/ABHA-ready records; NABH-friendly documentation',
          'Flat pricing, no per-bed fees; 30-day free trial, no card',
        ],
      },
      {
        h2: 'From a nursing home to a multi-specialty hospital',
        body:
          'Because it’s modular and cloud-based, the same platform fits a small nursing home running OPD and a handful of beds, and a multi-specialty hospital running theatres, a blood bank and a full insurance desk. You switch modules on as you need them instead of buying — or outgrowing — a fixed system. Start with what you run today and turn on the rest when you’re ready.',
      },
    ],
    faqs: [
      {
        q: 'What is hospital management software?',
        a: 'Hospital management software (an HMS, sometimes called a hospital information system) is one system that runs a hospital’s day-to-day operations — patient registration, the OPD queue, IPD admissions and beds, pharmacy, lab, radiology, billing, insurance and staff — on a single shared patient record and bill, instead of separate registers for each department. Uyirly is a cloud HMS built for Indian hospitals.',
      },
      {
        q: 'How much does hospital management software cost in India?',
        a: 'Uyirly uses flat monthly pricing with no per-bed or per-user metering, starting from ₹2,999/month, plus a 30-day free trial with no credit card. The flat model means a small hospital and a large one each pay for the plan they need, not for every bed or login. See the pricing page for the current plans.',
      },
      {
        q: 'Is it cloud-based, and does it work for small hospitals?',
        a: 'Yes. Uyirly is fully cloud-based — nothing to install, accessible on any device — and the same platform scales from a single clinic or nursing home up to a multi-specialty hospital, so small facilities run the same software the big ones do.',
      },
      {
        q: 'What modules does the hospital management system include?',
        a: 'OPD and appointments, IPD admission and bed management, pharmacy, lab (LIS), radiology (RIS), billing, insurance/TPA claims, blood bank, operation theatre scheduling, emergency, inventory, and staff/HR — all on one shared patient record. Modules can be switched on as you need them.',
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
          'Search “best hospital management software in India” and you get list after list of ten products in an order someone was paid to arrange. None of them knows your hospital — your size, your specialties, whether you run an insurance desk or a blood bank. The best HMS for a 20-bed nursing home is not the best one for a 300-bed multi-specialty. So treat the lists as a starting roster of names, and judge them against your own hospital using the criteria below.',
      },
      {
        h2: 'Judge integration, not the feature count',
        body:
          'Every HMS lists the same modules. What separates the best hospital software from the rest is whether those modules truly share one patient and one bill, or just sit behind the same login. Test it directly: register a patient, order a lab test from a consultation, dispense a medicine, and see whether it all lands on one bill at discharge without re-entry. If it does, the software saves your staff time every single day. If it doesn’t, a long feature list won’t rescue it.',
      },
      {
        h2: 'India-fit is not optional',
        body:
          'A hospital in India lives with GST rules, insurance and TPA cashless claims, ABDM/ABHA records and NABH expectations. Software built abroad, or for a different market, forces workarounds on all four — and workarounds are where errors and wasted hours hide. The best choice for an Indian hospital is one where these are native, not bolted on afterward.',
        bullets: [
          'GST-ready billing and India insurance/TPA claim workflows',
          'ABDM/ABHA-ready records for the national health mission',
          'NABH-friendly documentation and audit trails',
        ],
      },
      {
        h2: 'Watch the pricing model, not just the price',
        body:
          'Per-bed and per-user pricing looks cheap on day one and punishes you the moment you grow — every new bed and every new login raises the bill. Flat monthly pricing aligns the vendor with your growth instead of taxing it. Before you sign anything, ask exactly what triggers a higher fee: beds, users, patients, locations, or modules. The cheapest quote is often the most expensive system two years in.',
      },
      {
        h2: 'A short checklist for comparing vendors',
        body:
          'When you shortlist two or three systems, run each through the same real scenario and score them honestly. The one that handles your actual workflow with the least friction — and prices predictably — is your answer, regardless of where it sits on anyone’s top-10 list.',
        bullets: [
          'Does one patient and one bill flow through every department?',
          'Are GST, TPA claims, ABDM and NABH native or bolted on?',
          'Is pricing flat, or does it climb with beds, users or patients?',
          'Is it cloud-based, so there’s no server to buy and maintain?',
          'Can you trial it on real patients before you commit?',
        ],
      },
      {
        h2: 'Where Uyirly fits',
        body:
          'Uyirly is an all-in-one cloud HMS built for Indian hospitals: OPD, IPD, pharmacy, lab, radiology, billing, insurance, blood bank, OT and staff on one shared record and bill, with GST, TPA, ABDM and NABH handled natively and flat monthly pricing with no per-bed fees. We won’t claim to be “number one” — the honest way to judge it against any list is a free trial on your own hospital, with your own patients and your own bills.',
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
    group: GROUP_BUYING,
    tagline: 'Nothing to install, access anywhere, automatic backups — the case for a cloud/SaaS HMS.',
    metaTitle: 'Cloud-Based Hospital Management System | Uyirly',
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
          'A cloud-based hospital management system runs online, on managed infrastructure, and you reach it through a browser — which is why people also call it web-based or SaaS hospital software. The practical effect is that there is nothing to install and nothing to maintain on your own machines: no server humming in a back room, no local database to back up by hand, no IT person needed to patch it. You open a browser and the whole hospital is there.',
      },
      {
        h2: 'Why cloud beats an on-premise server',
        body:
          'An on-premise hospital system means buying a server, paying someone to maintain it, and losing access the moment that machine or your local network fails. A cloud-based system removes all of that: Uyirly runs on managed infrastructure, so there’s nothing to install, nothing to patch, and the software is reachable from the front desk, the ward, the doctor’s home or a second branch alike. Your uptime stops depending on one box in one building.',
      },
      {
        h2: 'Your data is safer in the cloud, not riskier',
        body:
          'The common worry is that the cloud is less secure — in practice it’s usually the opposite. A single clinic PC gets stolen, corrupted or hit by ransomware, often with no backup at all. Uyirly keeps data on managed infrastructure with automatic backups, encryption and role-based access, and every access is audit-logged, aligned with India’s DPDP Act expectations. The safe default isn’t a locked cupboard; it’s a system that backs itself up.',
        bullets: [
          'Automatic backups — no lost data when a local machine dies',
          'Encryption and role-based access control',
          'Audit logging aligned with India’s DPDP data-protection rules',
        ],
      },
      {
        h2: 'One record across branches and devices',
        body:
          'Because the system lives online, a multi-branch hospital, or a doctor moving between OPD and the ward, all read from the same live patient record — no syncing local databases, no “which PC has the latest version”. Add a branch and it’s on the same system the same day. For a group that runs more than one location, a web-based hospital management system is the only version of this that doesn’t become a data-merging nightmare.',
      },
      {
        h2: 'Pay monthly, start today',
        body:
          'Cloud turns a large one-time server-and-licence purchase into a small, predictable monthly cost — and you can start immediately. Sign up and the hospital is live without procurement or installation; there’s no six-week deployment before anyone can register a patient. Uyirly is flat monthly pricing with a 30-day free trial and no credit card, so the cost of trying it is nothing but your time.',
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
    ],
    related: [
      { label: 'Hospital management software', href: '/hospital-management-software' },
      { label: 'Data security & the DPDP Act', href: '/guides/hospital-software-data-security-dpdp' },
      { label: 'Pricing', href: '/pricing' },
    ],
    updated: '2026-07-29',
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
    ],
    updated: '2026-07-29',
  },

  'nursing-home-management-software': {
    slug: 'nursing-home-management-software',
    eyebrow: 'Nursing Home Software',
    group: GROUP_SPECIALTY,
    tagline: 'Right-sized software for a nursing home — OPD, beds, pharmacy and billing without hospital bloat.',
    metaTitle: 'Nursing Home Management Software (India)',
    description:
      'Uyirly is nursing home management software for India — OPD, beds and admissions, pharmacy, billing and patient records in one affordable cloud system that scales as you grow. Free trial.',
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
      { label: 'Pricing', href: '/pricing' },
    ],
    updated: '2026-07-29',
  },

  'multi-specialty-hospital-software': {
    slug: 'multi-specialty-hospital-software',
    eyebrow: 'Multi-Specialty Hospital Software',
    group: GROUP_SPECIALTY,
    tagline: 'One patient across every specialty and department — the whole multi-specialty hospital on one system.',
    metaTitle: 'Multi-Specialty Hospital Management Software (India)',
    description:
      'Uyirly is multi-specialty hospital management software for India — every department and specialty on one shared patient record and bill, with doctor-wise queues and all clinical modules. Free trial.',
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
