import type { Metadata } from 'next'
import LegalShell from '@/components/marketing/LegalShell'

export const metadata: Metadata = {
  title: 'Security — Uyirly',
  description:
    'How Uyirly protects hospital and patient data: encryption in transit, tenant isolation, role-based access control, audit logging, backups, and data residency in India.',
  alternates: { canonical: '/security' },
  openGraph: {
    url: '/security',
    title: 'Security — Uyirly',
    description: 'Encryption, tenant isolation, RBAC, audit logging, backups and data residency in India.',
  },
}

export default function SecurityPage() {
  return (
    <LegalShell
      title="Security"
      lastUpdated="12 July 2026"
      intro="Protecting patient and hospital data is fundamental to Uyirly. This page summarises the security practices built into our platform. Security is a shared responsibility — we secure the platform, and your team is responsible for managing user access and following good practices within your hospital."
    >
      <h2>Data Residency</h2>
      <p>Customer Data is hosted on infrastructure located <strong>in India</strong>. We take reasonable steps to keep patient data within India, aligned with the expectations of the Digital Personal Data Protection Act, 2023.</p>

      <h2>Encryption</h2>
      <ul>
        <li><strong>In transit:</strong> all traffic between your browser or mobile app and the Service is encrypted using TLS (HTTPS).</li>
        <li><strong>At rest:</strong> data stored in our managed database and file storage is encrypted at rest by our hosting provider.</li>
      </ul>

      <h2>Tenant Isolation</h2>
      <p>Uyirly is multi-tenant by design. Every hospital operates on its own subdomain, and data access is scoped to the tenant at the database layer using row-level security. This is enforced on every request so one hospital cannot access another hospital’s data.</p>

      <h2>Access Control</h2>
      <ul>
        <li><strong>Role-based access control (RBAC):</strong> users are granted permissions based on their role (for example, doctor, nurse, pharmacist, billing, or administrator).</li>
        <li><strong>Least privilege:</strong> staff see only the modules and data their role requires.</li>
        <li><strong>Authentication:</strong> accounts are protected by passwords and secure session handling. Administrators control who has access and can revoke it at any time.</li>
      </ul>

      <h2>Audit Logging</h2>
      <p>Key actions within the Service are recorded in tamper-resistant audit logs, giving administrators visibility into who did what and when. This supports accountability, incident investigation and compliance.</p>

      <h2>Backups and Availability</h2>
      <p>Customer Data is backed up regularly by our managed infrastructure provider to support recovery in the event of a failure. We monitor the platform and work to maintain high availability, with maintenance scheduled to minimise disruption.</p>

      <h2>Secure Development</h2>
      <ul>
        <li>Access to production systems is restricted and controlled.</li>
        <li>We use trusted, industry-standard infrastructure and payment providers.</li>
        <li>We apply security updates and improvements on an ongoing basis.</li>
      </ul>

      <h2>Payments</h2>
      <p>Subscription payments are processed by <strong>Razorpay</strong>, a PCI-DSS compliant payment provider. We do not store your card or bank account numbers on our systems.</p>

      <h2>Your Responsibilities</h2>
      <ul>
        <li>Manage user accounts and remove access promptly when staff leave.</li>
        <li>Use strong, unique passwords and keep credentials confidential.</li>
        <li>Grant each user only the role and access they need.</li>
        <li>Follow your own regulatory and consent obligations as the Data Fiduciary.</li>
      </ul>

      <h2>Reporting a Vulnerability</h2>
      <p>If you believe you have found a security vulnerability, please report it responsibly to <a href="mailto:security@uyirly.com">security@uyirly.com</a>. We appreciate disclosures that give us a reasonable opportunity to investigate and address the issue before it is made public.</p>

      <h2>Contact</h2>
      <p>For security questions, contact <a href="mailto:security@uyirly.com">security@uyirly.com</a>.</p>
    </LegalShell>
  )
}
