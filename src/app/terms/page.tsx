import type { Metadata } from 'next'
import LegalShell from '@/components/marketing/LegalShell'

export const metadata: Metadata = {
  title: 'Terms of Service — Uyirly',
  description:
    'The Terms of Service governing use of the Uyirly hospital management software platform, including subscriptions, acceptable use, data responsibilities, disclaimers and liability.',
  alternates: { canonical: '/terms' },
  openGraph: {
    url: '/terms',
    title: 'Terms of Service — Uyirly',
    description: 'Terms governing use of the Uyirly hospital management software platform.',
  },
}

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of Service"
      lastUpdated="12 July 2026"
      intro="These Terms of Service (the “Terms”) form a binding agreement between Uyirly (“Uyirly”, “we”, “us”, “our”) and the hospital, clinic, nursing home or other organisation that registers for or uses our platform (“Customer”, “you”, “your”). By creating an account, clicking to accept, or using the Service, you agree to these Terms on behalf of your organisation and confirm you are authorised to do so."
    >
      <h2>1. Definitions</h2>
      <ul>
        <li><strong>“Service”</strong> means the Uyirly hospital management software platform, including the web application, native mobile applications, APIs, and any related services we provide.</li>
        <li><strong>“Customer Data”</strong> means all data you or your Authorised Users submit to the Service, including patient records, clinical, billing and operational data.</li>
        <li><strong>“Authorised User”</strong> means an individual you permit to access the Service under your account (e.g. doctors, nurses, pharmacists, billing and administrative staff).</li>
        <li><strong>“DPDP Act”</strong> means India’s Digital Personal Data Protection Act, 2023 and rules made under it.</li>
      </ul>

      <h2>2. The Service and Licence</h2>
      <p>Subject to your compliance with these Terms and payment of applicable fees, we grant you a limited, non-exclusive, non-transferable, non-sublicensable, revocable right to access and use the Service for your internal business operations during the subscription term.</p>
      <p>The Service is <strong>software that supports your operations</strong>. Uyirly is not a hospital, healthcare provider, laboratory, pharmacy or medical device manufacturer, does not practise medicine, and does not provide medical, diagnostic, legal, accounting or professional advice. All clinical, diagnostic, prescribing, billing and business decisions remain solely yours.</p>

      <h2>3. Accounts and Authorised Users</h2>
      <ul>
        <li>You must provide accurate, current and complete registration information and keep it updated.</li>
        <li>You are responsible for all activity under your account and for the acts and omissions of your Authorised Users.</li>
        <li>You must keep login credentials confidential, enforce appropriate access controls, and notify us promptly of any suspected unauthorised access.</li>
        <li>You are responsible for ensuring each Authorised User complies with these Terms.</li>
      </ul>

      <h2>4. Free Trial</h2>
      <p>We may offer a free trial (currently 30 days). Trials are provided “as is” without warranty. We may modify or discontinue trials at any time. If you do not subscribe by the end of the trial, your access may be suspended and Customer Data may be deleted in accordance with our retention practices described in our <a href="/privacy">Privacy Policy</a>.</p>

      <h2>5. Subscriptions, Fees and Taxes</h2>
      <ul>
        <li>Paid plans are billed in advance on a recurring monthly basis unless otherwise agreed. By subscribing you authorise us and our payment processor to charge the applicable fees.</li>
        <li>Fees are exclusive of taxes. You are responsible for all applicable taxes, including GST, which will be added at checkout.</li>
        <li>Subscriptions renew automatically until cancelled. You may cancel at any time; cancellation takes effect at the end of the current billing period.</li>
        <li>Except where required by law, <strong>fees are non-refundable</strong> and amounts already charged for a billing period are not pro-rated on cancellation.</li>
        <li>We may change pricing on prospective notice. Continued use after a price change takes effect constitutes acceptance.</li>
        <li>If payment fails or is overdue, we may suspend or downgrade the Service until amounts are paid.</li>
      </ul>

      <h2>6. Customer Data and Your Responsibilities</h2>
      <p>As between the parties, <strong>you own your Customer Data</strong>. You grant us a worldwide, non-exclusive licence to host, process, transmit, display and otherwise use Customer Data solely to provide, secure, maintain and improve the Service and as otherwise permitted in these Terms and our <a href="/privacy">Privacy Policy</a>.</p>
      <p>For personal data processed through the Service, you act as the <strong>Data Fiduciary</strong> and we act as a <strong>Data Processor</strong> processing data on your documented instructions. You represent and warrant that you will:</p>
      <ul>
        <li>obtain and maintain all consents and have a valid lawful basis required to collect and process patient and other personal data through the Service;</li>
        <li>provide all legally required notices to data principals (including patients);</li>
        <li>ensure the accuracy of Customer Data and the lawfulness of your instructions;</li>
        <li>comply with the DPDP Act and all other laws applicable to your use of the Service, including medical records, clinical and pharmacy regulations.</li>
      </ul>
      <p>You are solely responsible for the accuracy, quality, integrity and legality of Customer Data and for the clinical and business use you make of it.</p>

      <h2>7. Acceptable Use</h2>
      <p>You agree not to, and not to permit any Authorised User or third party to:</p>
      <ul>
        <li>use the Service in violation of any law or third-party right;</li>
        <li>upload malware or interfere with, disrupt, or attempt to gain unauthorised access to the Service or its infrastructure;</li>
        <li>reverse engineer, decompile, or attempt to derive source code, except to the extent permitted by law;</li>
        <li>copy, resell, sublicense, rent, or provide the Service to third parties as a service bureau;</li>
        <li>access the Service to build a competing product or benchmark it without our written consent;</li>
        <li>submit data you are not authorised to submit, or use the Service to store data unrelated to your legitimate operations.</li>
      </ul>
      <p>We may investigate suspected violations and suspend access to protect the Service, our users, or third parties.</p>

      <h2>8. Intellectual Property</h2>
      <p>The Service, including all software, designs, text, graphics, and the Uyirly name and logo, is owned by us and our licensors and is protected by intellectual property laws. Except for the limited licence in Section 2, no rights are granted to you. If you provide feedback or suggestions, you grant us a perpetual, irrevocable, royalty-free licence to use them without restriction.</p>

      <h2>9. Third-Party Services</h2>
      <p>The Service relies on third-party providers, including payment processing (Razorpay), cloud hosting and messaging providers. Your use may be subject to those providers’ terms. We are not responsible for third-party services and do not warrant their availability or performance.</p>

      <h2>10. Confidentiality</h2>
      <p>Each party may access confidential information of the other. The receiving party will use it only to perform under these Terms and protect it with reasonable care. This does not apply to information that is public, independently developed, or rightfully received from a third party.</p>

      <h2>11. Disclaimers</h2>
      <p>THE SERVICE IS PROVIDED <strong>“AS IS” AND “AS AVAILABLE”</strong>. TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. We do not warrant that the Service will be uninterrupted, error-free, or that it will meet your requirements. The Service is not a substitute for professional medical judgement, and any output must be independently verified by qualified personnel before it is relied upon.</p>

      <h2>12. Limitation of Liability</h2>
      <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, NEITHER PARTY WILL BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, REVENUE, DATA, OR GOODWILL, EVEN IF ADVISED OF THE POSSIBILITY. OUR TOTAL AGGREGATE LIABILITY ARISING OUT OF OR RELATING TO THESE TERMS OR THE SERVICE WILL NOT EXCEED THE AMOUNTS YOU ACTUALLY PAID TO US FOR THE SERVICE IN THE TWELVE (12) MONTHS IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO THE CLAIM.</p>

      <h2>13. Indemnification</h2>
      <p>You will defend, indemnify and hold harmless Uyirly and its officers, employees and agents from and against any claims, damages, losses, liabilities, and expenses (including reasonable legal fees) arising out of or related to: (a) your Customer Data; (b) your use of the Service; (c) your violation of these Terms or applicable law; or (d) your violation of any rights of a third party, including patients and data principals.</p>

      <h2>14. Term, Suspension and Termination</h2>
      <ul>
        <li>These Terms apply while you have an account or use the Service.</li>
        <li>We may suspend or terminate access immediately if you breach these Terms, fail to pay, or if required to protect the Service or comply with law.</li>
        <li>You may terminate by cancelling your subscription and ceasing use.</li>
        <li>On termination, your right to use the Service ends. We will make Customer Data available for export for a limited period, after which it may be deleted as described in our <a href="/privacy">Privacy Policy</a>.</li>
        <li>Sections that by their nature should survive (including 6, 8, 10–13, 16–17) survive termination.</li>
      </ul>

      <h2>15. Changes to the Service</h2>
      <p>We continuously improve the Service and may add, modify or remove features. We may discontinue the Service or a plan on reasonable notice. Except where an Enterprise agreement provides a specific service-level commitment, the Service is provided without an uptime guarantee.</p>

      <h2>16. Force Majeure</h2>
      <p>We are not liable for any failure or delay caused by events beyond our reasonable control, including internet or hosting outages, power failures, natural disasters, epidemics, government action, or acts of third-party providers.</p>

      <h2>17. Governing Law and Disputes</h2>
      <p>These Terms are governed by the laws of India. Subject to any applicable law, the courts at Chennai, Tamil Nadu, India will have exclusive jurisdiction over any dispute arising out of or relating to these Terms or the Service.</p>

      <h2>18. Changes to these Terms</h2>
      <p>We may update these Terms from time to time. If we make material changes, we will provide reasonable notice (for example, by email or in-product notice). Your continued use of the Service after changes take effect constitutes acceptance of the updated Terms.</p>

      <h2>19. General</h2>
      <ul>
        <li><strong>Entire agreement:</strong> These Terms and the documents they reference are the entire agreement between the parties regarding the Service.</li>
        <li><strong>Assignment:</strong> You may not assign these Terms without our consent. We may assign them in connection with a merger, acquisition, or sale of assets.</li>
        <li><strong>Severability:</strong> If any provision is unenforceable, the remaining provisions remain in effect.</li>
        <li><strong>Waiver:</strong> Failure to enforce a provision is not a waiver.</li>
        <li><strong>Notices:</strong> We may send notices to the email associated with your account.</li>
      </ul>

      <h2>20. Contact</h2>
      <p>Questions about these Terms can be sent to <a href="mailto:legal@uyirly.com">legal@uyirly.com</a>.</p>
    </LegalShell>
  )
}
