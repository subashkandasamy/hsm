import Link from 'next/link'
import WorkflowDiagram from '@/components/guides/diagrams/WorkflowDiagram'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'
import StatGrid from '@/components/guides/diagrams/StatGrid'
import ScreenMock, { MockTable } from '@/components/guides/diagrams/ScreenMock'

export const faqs = [
  {
    q: 'What is ophthalmology EMR software?',
    a: 'Ophthalmology EMR software is an eye-specialty electronic medical record — it captures the structured examination an eye clinic actually performs (vision, refraction, intraocular pressure, anterior and posterior segment findings) per eye, and produces the outputs an eye patient needs, most importantly a spectacle prescription. A general EMR that only has free-text notes cannot do this well.',
  },
  {
    q: 'Why can\'t a general EMR handle eye exams?',
    a: 'Because ophthalmology data is structured and paired by eye (right/left), not free text. Vision and refraction values, IOP, and segment findings all need dedicated fields for each eye, and the software must turn refraction into a printable spectacle prescription. Free-text notes lose that structure and can\'t generate the prescription.',
  },
  {
    q: 'What is a spectacle prescription and why does it matter?',
    a: 'A spectacle prescription is the sphere, cylinder, axis and add for each eye that an optician uses to make glasses. It is the single most common tangible output of an eye visit, so an ophthalmology EMR should generate a clean, printable spectacle prescription directly from the recorded refraction.',
  },
  {
    q: 'Does an eye clinic still need the rest of a hospital system?',
    a: 'Yes. An eye clinic still runs an OPD queue, bills consultations and procedures, dispenses pharmacy, schedules cataract and other surgeries in an OT, and keeps patient records. Specialty ophthalmology EMR is most useful as one module inside a full system, not a standalone island.',
  },
  {
    q: 'How does ophthalmology connect to OT and billing?',
    a: 'Eye surgery (cataract, etc.) is scheduled in the operation theatre module, its procedure fee and consumables flow into the patient\'s bill, and the consultation and investigations are billed like any OPD visit — so the specialty record and the hospital\'s billing and scheduling stay connected.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        An eye examination is not a paragraph of notes &mdash; it is a structured, per-eye dataset: vision and
        refraction for right and left, intraocular pressure, anterior and posterior segment findings, and, for
        most patients, a <strong>spectacle prescription</strong> to walk out with. A general EMR with a
        free-text box cannot capture this cleanly, and certainly cannot turn a refraction into printable glasses.
        That is why eye clinics need <strong>ophthalmology EMR</strong> &mdash; specialty structure on top of a
        full hospital system.
      </p>
      <p>
        This guide explains what an ophthalmology record must capture, why the structure matters, and how a
        specialty eye module fits alongside OPD, OT and billing.
      </p>

      <h2>Why eye care needs a specialty record</h2>
      <p>
        Ophthalmology data has two properties a general note field handles badly: it is <strong>structured</strong>
        (discrete values, not prose) and it is <strong>paired by eye</strong> (almost everything is recorded
        separately for the right eye and the left eye). Vision, refraction, pressure and segment findings all
        need dedicated right/left fields &mdash; and the refraction has to become a spectacle prescription. Force
        this into free text and you lose the structure, the comparability across visits, and the ability to print
        what the patient came for.
      </p>
      <CalloutBox tone="info" title="The test: can it print glasses?">
        The quickest way to judge an ophthalmology EMR is whether it turns the recorded refraction into a clean,
        printable <strong>spectacle prescription</strong> per eye. If it can&rsquo;t, it&rsquo;s a general note
        field wearing an eye-clinic label.
      </CalloutBox>

      <h2>What an ophthalmology record captures</h2>
      <p>
        A working eye record mirrors the exam the clinic actually performs, each part recorded for both eyes:
      </p>
      <WorkflowDiagram
        title="The eye examination, structured per eye"
        steps={[
          { label: 'Vision', sublabel: 'Unaided / best-corrected' },
          { label: 'Refraction', sublabel: 'Sphere · cyl · axis · add' },
          { label: 'IOP', sublabel: 'Intraocular pressure' },
          { label: 'Segments', sublabel: 'Anterior & posterior' },
          { label: 'Spectacle Rx', sublabel: 'Printable, per eye' },
        ]}
      />
      <p>
        A spectacle prescription output typically looks like this &mdash; the values an optician needs, per eye:
      </p>
      <ScreenMock title="Ophthalmology · Spectacle Prescription" caption="Refraction recorded per eye, printed as a spectacle prescription the optician can dispense from.">
        <MockTable
          head={['Eye', 'Sphere', 'Cyl', 'Axis', 'Add']}
          rows={[
            ['Right (OD)', '−1.50', '−0.75', '90°', '+2.00'],
            ['Left (OS)', '−1.25', '−0.50', '85°', '+2.00'],
          ]}
        />
      </ScreenMock>

      <h2>Eye care is still a hospital workflow</h2>
      <p>
        A specialty record is necessary but not sufficient. An eye clinic still runs everything a small hospital
        does &mdash; and the specialty module is most useful when it plugs into that, not when it sits alone:
      </p>
      <ul>
        <li><strong>OPD queue</strong> &mdash; eye patients wait, get tokens and are called like any OPD; see the{' '}
          <Link href="/guides/opd-queue-token-management-guide">OPD token &amp; queue guide</Link>.</li>
        <li><strong>Investigations</strong> &mdash; some feed the record; results belong with the patient&rsquo;s{' '}
          <Link href="/guides/patient-records-emr-uhid-guide">EMR</Link>.</li>
        <li><strong>OT scheduling</strong> &mdash; cataract and other eye surgeries are booked and recorded like
          any procedure; see <Link href="/guides/ot-scheduling-management-guide">OT scheduling</Link>.</li>
        <li><strong>Pharmacy &amp; billing</strong> &mdash; drops, consultation and procedure fees, consumables
          all flow into the bill.</li>
      </ul>

      <h2>The cataract surgery workflow</h2>
      <p>
        Cataract is the bread-and-butter surgery of most eye hospitals, and it shows why the specialty record and
        the rest of the system have to be one thing. A cataract journey runs: OPD consult and diagnosis &rarr;
        pre-operative investigations (biometry to choose the intraocular lens, plus fitness checks) &rarr; surgery
        scheduled in the OT &rarr; the procedure and its consumables (crucially, the IOL) &rarr; post-operative
        review visits. Every step touches a different part of the hospital &mdash; the eye record, investigations,
        the <Link href="/guides/ot-scheduling-management-guide">OT schedule</Link>, pharmacy and billing &mdash;
        for the <em>same</em> patient.
      </p>
      <p>
        If those live in separate tools, the lens used in theatre doesn&rsquo;t reach the bill, the follow-up
        isn&rsquo;t tied to the surgery, and the pre-op measurements aren&rsquo;t next to the operative record.
        When they live in one system, the surgeon&rsquo;s plan, the OT booking, the IOL charge and the follow-up
        schedule are all one connected thread &mdash; which is the entire argument for ophthalmology inside a full
        HMS rather than a standalone eye-record app.
      </p>

      <h2>Investigations an eye clinic depends on</h2>
      <p>
        Beyond the basic exam, eye care leans on specific investigations &mdash; biometry for lens power, OCT for
        retinal and optic-nerve imaging, fundus photography, visual field testing, and more. What matters for the
        record is that these results attach to the patient&rsquo;s eye record per eye and over time, so the
        clinician can compare today against the last visit. Progression &mdash; is the field worsening, is the OCT
        thickness changing &mdash; is often the whole clinical question, and it is only answerable when structured
        results sit in a comparable history rather than scattered across printouts.
      </p>

      <h2>The optical shop</h2>
      <p>
        Many eye hospitals run an attached optical shop, and it flows directly from the record: the spectacle
        prescription generated from the refraction is what the optical counter dispenses against. When the
        prescription is structured data rather than a handwritten slip, the optical sale can reference it cleanly,
        the patient&rsquo;s eyewear history is retained, and the shop&rsquo;s sale is billed through the same
        system as the consultation &mdash; turning the optical counter from a detached cash desk into part of the
        patient&rsquo;s record and the hospital&rsquo;s books.
      </p>

      <h2>Single-specialty vs multi-specialty eye care</h2>
      <p>
        The same specialty module serves two very different hospitals. A <strong>standalone eye hospital</strong>
        wants the full depth &mdash; structured exams, biometry, surgery scheduling, an optical shop &mdash; as
        its core system, often with multiple ophthalmologists and optometrists sharing one queue and record. A{' '}
        <strong>multi-specialty hospital</strong> wants eye care to be simply one department on the same platform
        as everything else, sharing patients, the OPD queue, OT and billing with medicine, surgery and the rest.
        Because the ophthalmology record sits on the shared clinical core, the same software fits both &mdash; the
        eye clinic just turns on the depth it needs.
      </p>

      <h2>How Uyirly offers this</h2>
      <p>
        Uyirly includes an <strong>ophthalmology</strong> specialty record as part of the full platform, so eye
        clinics get the structured exam <em>and</em> everything else a clinic runs on.
      </p>
      <StatGrid stats={[
        { value: 'Per-eye', label: 'Right / left structured fields' },
        { value: 'Spectacle Rx', label: 'Printable from refraction' },
        { value: 'In OPD flow', label: 'Tokens, queue, records' },
        { value: 'OT + billing', label: 'Surgery & fees connected' },
      ]} />
      <p>
        The eye exam is captured as structured, per-eye data &mdash; vision, refraction, IOP and segment findings
        &mdash; and the refraction generates a clean spectacle prescription the patient can take to any optician.
        Because it lives inside Uyirly rather than as a separate tool, the eye visit uses the same OPD queue and
        tokens, the same <Link href="/guides/patient-records-emr-uhid-guide">patient record and UHID</Link>,
        cataract and other surgeries schedule through the same{' '}
        <Link href="/guides/ot-scheduling-management-guide">OT module</Link>, and every consultation, drop and
        procedure flows into the patient&rsquo;s bill.
      </p>
      <CalloutBox tone="tip" title="Specialty depth, without a second system">
        An eye clinic shouldn&rsquo;t run one app for eye records and another for the queue, pharmacy, OT and
        billing. The value of ophthalmology-in-a-full-HMS is that the specialty record and the running of the
        clinic are the same system.
      </CalloutBox>

      <h2>Recall and continuity in eye care</h2>
      <p>
        Eye conditions are frequently long-term and progressive &mdash; glaucoma, diabetic retinopathy, post-op
        review, spectacle changes over years. That makes <strong>recall and continuity</strong> central to a good
        eye practice, not an afterthought. The record should make it easy to see a patient&rsquo;s full eye
        history at a glance and to bring them back at the right interval &mdash; a glaucoma patient for pressure
        checks, a diabetic for annual retinal screening, a post-cataract patient for their scheduled reviews.
      </p>
      <p>
        This is where a specialty record inside a full system pays off again: the same platform that holds the
        structured exams can drive follow-up recommendations and appointment booking, so continuity is built into
        the workflow rather than depending on the patient remembering. A missed glaucoma review is not a minor
        administrative gap &mdash; it can mean irreversible vision loss &mdash; so the ability to track who is due
        and gently bring them back is part of good clinical care, not just good marketing.
      </p>

      <h2>Multiple clinicians and roles in an eye clinic</h2>
      <p>
        A busy eye clinic is rarely one doctor. Optometrists perform refraction and preliminary workup,
        ophthalmologists handle diagnosis and surgery, and counsellors and optical staff support the journey. The
        record has to reflect that division cleanly &mdash; the optometrist&rsquo;s refraction feeds the
        ophthalmologist&rsquo;s consultation, which feeds the surgical plan &mdash; with each role doing its part
        on the same patient record rather than re-entering data. When roles and permissions map to how the clinic
        actually works, the workup done at the pre-consultation station is right there when the doctor sees the
        patient, and nobody is transcribing numbers from one screen to another.
      </p>

      <h2>Where it fits</h2>
      <p>
        Ophthalmology is one of several specialty records that sit on the shared clinical core &mdash; alongside{' '}
        <Link href="/guides/dental-clinic-software-guide">dental</Link> and general OPD/IPD. If you&rsquo;re a
        single-specialty eye hospital, you get the depth of an eye EMR; if you&rsquo;re multi-specialty, eye care
        is simply one more department on the same platform, sharing patients, scheduling and billing with the
        rest. See <Link href="/guides/hospital-digitization-workflow-guide">how to digitize a hospital</Link> for
        the bigger picture.
      </p>
    </>
  )
}
