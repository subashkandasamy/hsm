import Link from 'next/link'
import Screenshot from '@/components/guides/Screenshot'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'
import WorkflowDiagram from '@/components/guides/diagrams/WorkflowDiagram'

export const faqs = [
  {
    q: 'What is lab analyzer integration?',
    a: 'It is the data link between the instrument that measures a sample and the software that reports it. Without it a technician reads the result off the analyzer’s screen and types it into the lab system. With it, the measurement travels to the patient’s record on its own.',
  },
  {
    q: 'What is ASTM, and how is it different from HL7?',
    a: 'ASTM E1394 is the older, simpler message standard most laboratory analyzers speak, often over a serial cable. HL7 is the broader healthcare messaging standard, more common on newer networked instruments. Many analyzers speak one and not the other, so ask your vendor which before assuming a system can connect.',
  },
  {
    q: 'What is the difference between one-way and two-way interfacing?',
    a: 'One-way (unidirectional) means results travel from the machine to the software. Two-way (bidirectional) adds the reverse: the software sends the machine the list of tests to run on each sample, so the technician does not select them at the instrument. Two-way is harder, is often licensed separately by the analyzer vendor, and matters most in high-volume labs.',
  },
  {
    q: 'Will analyzer integration work if the internet goes down?',
    a: 'Only if the listening program runs inside your laboratory rather than in the cloud. An analyzer transmits a result once and forgets it, so if nothing on the local network is listening at that moment the measurement is lost. Ask any vendor where their listener runs.',
  },
  {
    q: 'Do analyzer manufacturers charge for the interface?',
    a: 'Often, yes — and it is the cost most laboratories discover too late. The data-output module on the instrument can be a separately priced option from the analyzer vendor, quite apart from whatever your software company charges. Negotiate it while you are still buying the machine.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        A complete blood count is around twenty numbers. In most small Indian laboratories those twenty
        numbers are read off the analyzer&rsquo;s own screen and typed into the lab software by a
        technician who is also loading the next rack, answering the phone and labelling tubes. Multiply by
        a hundred samples a day.
      </p>
      <p>
        Analyzer integration removes that step. It is the single change that does most for a
        laboratory&rsquo;s accuracy and its turnaround time, and it is also the thing most hospitals put
        off until after they have bought everything else.
      </p>

      <h2>Why it matters more than it sounds</h2>
      <p>
        The case for integration is usually made on speed. Speed is real but it is the smaller half. The
        bigger half is that every manual transcription is an opportunity for a decimal point to move, and
        a decimal point in a potassium result is a clinical event.
      </p>
      <p>
        A laboratory running two hundred samples a day with ten measurements each is creating two thousand
        chances a day to mistype something. Most of those errors are caught, by a technician who notices
        the number looks wrong. Some are not. Integration does not reduce that rate &mdash; it removes the
        step entirely.
      </p>

      <CalloutBox tone="info" title="The second reason, which nobody mentions in the demo">
        An integrated result carries the instrument&rsquo;s own identity and timestamp. When an assessor
        asks which machine produced a given result and when, that is a question the record answers by
        itself rather than one a technician has to remember.
      </CalloutBox>

      <h2>How a machine actually talks</h2>
      <p>
        There are only a few ways an analyzer gets data out, and which one yours uses decides everything
        about the installation.
      </p>
      <ul>
        <li>
          <strong>Over the network.</strong> The instrument has an Ethernet socket and sends messages to an
          IP address and port on your LAN. The easiest case by far.
        </li>
        <li>
          <strong>Over a serial cable (RS-232).</strong> A physical cable from the instrument to a COM port
          on a nearby PC. Common on older and mid-range machines, and still completely workable &mdash; it
          just means the computer has to be beside the analyzer.
        </li>
        <li>
          <strong>By writing a file.</strong> Some semi-automatic instruments only export a results file to
          a folder. A program watching that folder can pick them up.
        </li>
        <li>
          <strong>By printing.</strong> Some entry-level analyzers can only drive their own built-in
          printer. These cannot be integrated &mdash; not by us, not by anyone. It is worth knowing before
          you buy the machine.
        </li>
      </ul>

      <h3>ASTM and HL7</h3>
      <p>
        Once there is a wire, the two ends still have to agree on a language. Laboratory instruments
        overwhelmingly speak <strong>ASTM E1394</strong>, an old and rather fussy standard with a
        handshake, framed messages and a checksum on each frame. Newer networked analyzers increasingly
        speak <strong>HL7</strong> instead.
      </p>
      <p>
        These are not interchangeable. A system that supports one does not automatically support the
        other. The useful question to put to any vendor is not &ldquo;do you support analyzer
        integration&rdquo; but &ldquo;here is my exact model &mdash; does it work?&rdquo;
      </p>

      <h3>Imaging is a different world: DICOM</h3>
      <p>
        Scanners do not speak ASTM at all. Ultrasound, X-ray and CT consoles speak{' '}
        <strong>DICOM</strong>, which does two useful things. A <em>modality worklist</em> lets the console
        pull the day&rsquo;s patient list from your software, so the radiographer picks a name instead of
        typing it. And the study itself is sent back, already matched to the right patient and accession
        number. See the{' '}
        <Link href="/guides/radiology-ris-reporting-guide">radiology reporting guide</Link> for what
        happens after that.
      </p>

      <h2>One-way or two-way</h2>
      <p>
        Vendors make a great deal of this distinction, and it is worth understanding before you pay extra
        for it.
      </p>
      <ul>
        <li>
          <strong>One-way (unidirectional)</strong> &mdash; results travel from the machine into the
          software. This is what removes the typing, and it is the part that delivers nearly all the
          benefit.
        </li>
        <li>
          <strong>Two-way (bidirectional)</strong> &mdash; the software also tells the instrument which
          tests to run on each sample, usually read off a barcode on the tube. It saves the technician
          selecting tests at the machine.
        </li>
      </ul>
      <p>
        Two-way genuinely helps a high-volume laboratory. In a hospital running under a hundred samples a
        day, the saving is small, and the cost is often not: analyzer manufacturers frequently license
        bidirectional support separately. Get one-way working first.
      </p>

      <h2>Where the listening program must run</h2>
      <p>
        This is the question that separates integration that survives a bad day from integration that
        does not.
      </p>
      <p>
        An analyzer transmits a result <em>once</em>. It does not queue, it does not retry, and it does not
        care whether anything received it. If the listener is in the cloud and your broadband is down at
        that moment, the measurement is gone and the sample has to be run again &mdash; assuming anyone
        notices.
      </p>
      <p>
        So the listener belongs on a computer in your laboratory, and it should write each result to that
        computer&rsquo;s own disk <em>before</em> attempting to send it anywhere.
      </p>

      <WorkflowDiagram
        title="The order that matters"
        steps={[
          { label: 'Analyzer', sublabel: 'Sends once, then forgets' },
          { label: 'Local program', sublabel: 'On a PC in the lab' },
          { label: 'Written to disk', sublabel: 'Before any upload' },
          { label: 'Uploaded', sublabel: 'Retried until confirmed' },
          { label: 'Patient record', sublabel: 'Unverified, awaiting a person' },
        ]}
      />

      <CalloutBox tone="warning" title="Ask this in the demo">
        &ldquo;If my internet drops for two hours while the lab is running, what happens to the results
        produced in those two hours?&rdquo; A vendor whose listener is in the cloud cannot give you a good
        answer to that question.
      </CalloutBox>

      <h2>A machine can produce a result. It must not release one.</h2>
      <p>
        Integration does not mean unattended reporting. Every analyzer result should land{' '}
        <strong>unverified</strong> and wait for someone in the laboratory to authorise it, with the report
        naming who did. That is NABL 112&rsquo;s requirement and it is also plain sense: an instrument
        cannot tell you that a sample was haemolysed or that the result does not fit the patient.
      </p>
      <p>
        A good system also withdraws that authorisation automatically if the value is later corrected. A
        result that has changed has not been checked by anybody yet.
      </p>

      <h2>What setting it up actually involves</h2>
      <Screenshot
        src="/guides/devices-connectors.png" width={2560} height={1992}
        alt="Analyzer and scanner connection settings showing the downloadable Windows connector, a connected computer giving two addresses — port 5150 for the analyzer engineer and port 11112 with AE title UYIRLY for the scanner engineer — then two analyzers on ASTM over network and serial, and a GE LOGIQ P9 ultrasound under Scanners"
        caption="One page, one program, two doors. Analyzers speak ASTM on one port and scanners speak DICOM on another — every machine below added itself the first time it sent something."
      />
      <p>
        Less than most people expect, for a one-way link.
      </p>
      <WorkflowDiagram
        steps={[
          { label: 'Install', sublabel: 'One program, on the PC beside the machines' },
          { label: 'Pair', sublabel: 'One short code, read off the screen' },
          { label: 'Point the machine', sublabel: 'Engineer sets an address or AE title' },
          { label: 'Done', sublabel: 'No per-instrument configuration' },
        ]}
      />
      <p>
        The one thing that genuinely takes time is the analyzer engineer&rsquo;s visit, and that is usually
        scheduling rather than work. A well-designed system should recognise the instrument from what it
        says when it first speaks, rather than making you describe each machine in a settings screen.
      </p>

      <h2>The costs to ask about before you buy</h2>
      <ul>
        <li>
          <strong>From the software vendor:</strong> is there a per-instrument fee, an interface licence,
          or a commissioning charge? Ask for the number with your actual machine count.
        </li>
        <li>
          <strong>From the analyzer manufacturer:</strong> is the data-output module included on this
          model, or priced separately? This is the one that ambushes people.
        </li>
        <li>
          <strong>From whoever installs it:</strong> cabling, if the machine is serial and the PC is not
          next to it.
        </li>
      </ul>

      <h2>How Uyirly does it</h2>
      <p>
        One small Windows program, installed on the computer that already sits beside your machines and
        paired with a single code. It listens on the network, on a serial cable and on a watched folder,
        and it handles DICOM for scanners at the same time. Every result is written to that
        computer&rsquo;s disk before any attempt to upload, so an outage costs you the delay and nothing
        else.
      </p>
      <p>
        There is no per-instrument fee and no interface licence, however many machines you connect. Two-way
        interfacing is not built, and we would rather say so here than let you discover it after signing.
        Full detail on the{' '}
        <Link href="/lab-analyzer-integration-software">analyzer integration page</Link>, and the
        laboratory module itself is covered under{' '}
        <Link href="/lab-management-software">lab management software</Link>.
      </p>
    </>
  )
}
