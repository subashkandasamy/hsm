import type { Metadata } from 'next'
import LegalShell from '@/components/marketing/LegalShell'

export const metadata: Metadata = {
  title: 'Privacy Policy — Uyirly',
  description:
    'How Uyirly collects, uses, stores and protects data on its hospital management platform. Aligned with India’s Digital Personal Data Protection Act, 2023. Data stored in India.',
  alternates: { canonical: '/privacy' },
  openGraph: {
    url: '/privacy',
    title: 'Privacy Policy — Uyirly',
    description: 'How Uyirly handles data on its hospital management platform. DPDP Act aligned, data stored in India.',
  },
}

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      lastUpdated="12 July 2026"
      intro="This Privacy Policy explains how Uyirly handles personal data in connection with our hospital management software. It is designed to align with India’s Digital Personal Data Protection Act, 2023 (the “DPDP Act”). Please also read our Terms of Service."
    >
      <h2>1. Our Role</h2>
      <p>We handle personal data in two capacities:</p>
      <ul>
        <li><strong>As a Data Processor</strong> for the patient and clinical data your hospital enters into the Service. Your organisation is the <strong>Data Fiduciary</strong> and decides why and how that data is processed; we process it on your instructions to provide the Service.</li>
        <li><strong>As a Data Fiduciary</strong> for the limited account data we collect directly from your administrators and staff to operate our business (for example, name, work email, and billing details).</li>
      </ul>

      <h2>2. Data We Process</h2>
      <ul>
        <li><strong>Account &amp; staff data:</strong> names, work email addresses, phone numbers, role, and authentication data of Authorised Users.</li>
        <li><strong>Customer Data (including patient data):</strong> patient demographics, clinical records, prescriptions, lab and radiology data, billing, insurance and operational data your organisation enters into the Service.</li>
        <li><strong>Billing data:</strong> plan, subscription status, and payment references. Card and bank details are handled by our payment processor and are not stored by us.</li>
        <li><strong>Technical &amp; usage data:</strong> log data, device and browser information, IP address, and audit records used for security, troubleshooting and improving the Service.</li>
      </ul>

      <h2>3. How We Use Data</h2>
      <ul>
        <li>To provide, secure, maintain, and improve the Service;</li>
        <li>To authenticate users and enforce access controls and audit trails;</li>
        <li>To process subscriptions and payments;</li>
        <li>To provide support and communicate with you about the Service;</li>
        <li>To detect, prevent and respond to fraud, abuse and security incidents;</li>
        <li>To comply with legal obligations.</li>
      </ul>
      <p>We process patient and clinical Customer Data <strong>only on your documented instructions</strong> and to provide the Service. We do not sell personal data, and we do not use patient data for advertising.</p>

      <h2>4. Where Data Is Stored</h2>
      <p>Customer Data is stored on infrastructure located <strong>in India</strong> through our hosting partner. We take reasonable steps to keep patient data within India.</p>

      <h2>5. Sub-Processors and Sharing</h2>
      <p>We use trusted third parties to deliver the Service. They may process data only to provide services to us and are bound by appropriate obligations. These currently include:</p>
      <ul>
        <li><strong>Cloud hosting and database</strong> — to host the application and store Customer Data in India;</li>
        <li><strong>Payment processing (Razorpay)</strong> — to process subscription payments;</li>
        <li><strong>Messaging providers</strong> — to send transactional email, SMS and WhatsApp notifications you enable.</li>
      </ul>
      <p>We may also disclose data if required by law, to enforce our Terms, or to protect the rights, safety and security of Uyirly, our users, or the public. We do not otherwise sell or rent personal data.</p>

      <h2>6. Data Retention</h2>
      <ul>
        <li>Customer Data is retained for as long as your account is active.</li>
        <li>After a trial ends without subscription, or after account termination, Customer Data may be retained for a limited window to allow export and then deleted (typically within 30 days), unless a longer period is required by law.</li>
        <li>Certain records (for example, invoices and audit logs) may be retained as required for legal, tax and security purposes.</li>
      </ul>

      <h2>7. Security</h2>
      <p>We implement technical and organisational measures to protect data, including encryption in transit, tenant data isolation, role-based access control, and audit logging. See our <a href="/security">Security</a> page for details. No system is completely secure, and we cannot guarantee absolute security.</p>

      <h2>8. Rights of Data Principals</h2>
      <p>Under the DPDP Act, individuals (data principals) have rights regarding their personal data, including access, correction, and erasure, and the right to grievance redressal. Because patient data is controlled by your hospital, <strong>patient requests should be directed to the hospital</strong> (the Data Fiduciary), which uses the tools within the Service to fulfil them. For account data we control directly, you may contact us using the details below.</p>

      <h2>9. Cookies and Similar Technologies</h2>
      <p>We use strictly necessary cookies and local storage to keep you signed in, maintain your session, and operate core features. We do not use third-party advertising cookies within the application.</p>

      <h2>10. Children’s and Sensitive Data</h2>
      <p>The Service is intended for use by healthcare organisations and their staff, not the general public. Patient records may include data about children and sensitive health information; responsibility for the lawful basis and any required consent for such data rests with your hospital as the Data Fiduciary.</p>

      <h2>11. Changes to this Policy</h2>
      <p>We may update this Policy from time to time. If we make material changes, we will provide reasonable notice by email or in-product notice. The “Last updated” date above reflects the latest revision.</p>

      <h2>12. Contact and Grievances</h2>
      <p>For privacy questions or to raise a grievance, contact our privacy team at <a href="mailto:privacy@uyirly.com">privacy@uyirly.com</a>. We will acknowledge and respond to grievances within the timelines required by applicable law.</p>
    </LegalShell>
  )
}
