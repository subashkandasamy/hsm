import Link from 'next/link'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'What is the DPDP Act?',
    a: 'The Digital Personal Data Protection (DPDP) Act is India\'s data protection law, governing how organizations — including hospitals — collect, store, use and secure personal data, with patient health data among the most sensitive categories it covers.',
  },
  {
    q: 'Does the DPDP Act require hospital data to be stored in India?',
    a: 'The Act does not universally mandate in-country storage for all data, but it does give the government power to restrict cross-border transfer for certain categories, and many hospitals choose India-based hosting for sensitive health data regardless, both for compliance comfort and lower latency.',
  },
  {
    q: 'What security practices should hospital software have?',
    a: 'At minimum: encrypted data in transit and at rest, role-based access control so staff only see what their role requires, audit logging of who accessed or changed a record, and a clear data-export path for the hospital if it ever needs its data back.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        Patient health records are among the most sensitive personal data any organization handles — and
        hospital software is where that data lives day to day. India&apos;s DPDP Act sets the legal backdrop for
        how that data should be protected; this guide covers what it means practically for choosing and
        running hospital software.
      </p>

      <CalloutBox tone="warning" title="General guide, not legal advice">
        Data protection law and its interpretation evolve. Consult a legal advisor for your hospital&apos;s
        specific compliance obligations — this guide explains the general shape of good practice, not a
        substitute for professional legal review.
      </CalloutBox>

      <h2>What the DPDP Act covers</h2>
      <p>
        The Digital Personal Data Protection Act governs how organizations collect, process, store and secure
        personal data in India, with special sensitivity around health information. For a hospital, this
        touches everything from patient registration data to clinical records to billing information tied to
        an identifiable person.
      </p>

      <h2>Security practices to expect from hospital software</h2>
      <ul>
        <li><strong>Encryption</strong> — data encrypted both in transit (between browser and server) and at rest (in the database).</li>
        <li><strong>Role-based access control</strong> — a receptionist, nurse, doctor and accountant should each see only what their role needs, not the whole database.</li>
        <li><strong>Audit logging</strong> — a record of who accessed or changed sensitive data, and when, so any concern can actually be traced.</li>
        <li><strong>Tenant/data isolation</strong> — for cloud software serving multiple hospitals, one hospital&apos;s data must be architecturally isolated from another&apos;s, not just filtered at the application layer.</li>
        <li><strong>A clear data-export path</strong> — you should be able to get your own data out in a usable format if you ever need to.</li>
      </ul>

      <h2>Where this connects to national health ID systems</h2>
      <p>
        As more hospitals link records to India&apos;s ABHA national health ID, data protection and interoperability
        start to intersect — see our{' '}
        <Link href="/guides/abdm-abha-health-id-hospitals-guide">ABDM &amp; ABHA guide</Link> for what that
        national layer involves.
      </p>

      <h2>Questions worth asking a hospital software vendor</h2>
      <ul>
        <li>Where is patient data physically stored?</li>
        <li>Is data encrypted at rest, not just in transit?</li>
        <li>Can you show role-based access control in a live demo, not just describe it?</li>
        <li>Is there an audit log of record access and changes?</li>
        <li>What happens to your data, and how do you get it out, if you ever switch providers?</li>
      </ul>
      <h2>How Uyirly protects your data</h2>
      <p>
        <Link href="/cloud-based-hospital-management-system">Uyirly</Link> is built so patient data is safe by
        default. Data is stored in India and aligned with the DPDP Act. Each hospital&apos;s data is kept strictly
        separate from every other hospital&apos;s, access is controlled by staff role so people only see what their
        job needs, all traffic is encrypted, and every view and change is audit-logged. Backups are automatic,
        so a stolen or broken PC never means lost records &mdash; which is exactly where a single clinic computer
        is most at risk.
      </p>
      <ul>
        <li>Data stored in India, aligned with the DPDP Act.</li>
        <li>Strict separation between hospitals; role-based access within each.</li>
        <li>Encryption in transit and an audit log of every action.</li>
        <li>Automatic backups &mdash; no data lost when a local machine dies.</li>
      </ul>

      <h2>Getting started</h2>
      <p>
        These protections come built into Uyirly&apos;s{' '}
        <Link href="/cloud-based-hospital-management-system">cloud hospital management system</Link>. You can{' '}
        <Link href="/signup">start a 30-day free trial</Link> with no credit card.
      </p>
    </>
  )
}
