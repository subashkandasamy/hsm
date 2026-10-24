# Connecting a hospital's analyzers

Written 24 Oct 2026, from a site visit to a hospital in Karur whose machines are
photographed below in spirit if not in file. Every specification here was checked
against the manufacturer's own brochure, not a distributor's listing, except
where the table says otherwise.

Keep this current. The next hospital will have six different machines and the
only thing that transfers is the method.

---

## 1. What we found, and why it is the normal case

Eleven instruments. **None of them connected to anything.** Each sits on a bench
with a power lead, prints to its own paper roll, and a technician retypes the
numbers into whatever system the hospital uses.

This is not a backward hospital. It is the ordinary condition of a small Indian
laboratory, because nothing has ever asked these machines for their data. The
ports are on the back and have never been used.

Two consequences worth holding on to:

- **There is no wiring to inherit and no PC in the lab.** Cabling is part of the
  job, not a precondition somebody else has met.
- **The machines are already capable.** We are not asking anyone to buy an
  instrument. Every one of these can transmit; it has simply never been asked.

---

## 2. The instruments, verified

| Instrument | What it does | Data ports | LIS protocol | Source |
|---|---|---|---|---|
| **Erba H360** | Haematology, **3-part** diff | **4 USB + 1 LAN**. No RS-232 | **HL7 over TCP/IP** | [brochure](https://product.erbamannheim.com/upload/docs/1019059489-H%20360%204%20page%20Brochure%20(05-2019).pdf), [Erba India](https://erba.velocitabrandconsultants.com/product/by-product-segment/hematology/h-360/) |
| **Boditech iChroma II** | Immunoassay (TSH, troponin, HbA1c, CRP) | USB + **Ethernet** + SD. **Wi-Fi/Bluetooth dongle optional** | "LIS/HIS compatible", protocol unstated | [spec sheet](https://ethitech.co.za/wp-content/uploads/2019/05/iChroma-II.pdf) |
| **Erba ECL 105** | Coagulation — PT/INR, APTT, D-dimer | **RS-232C**, 2 USB (A + B) | Bidirectional TCP/IP & RS-232 | [spec](https://product.erbamannheim.com/upload/docs/1408391036-Erba%20ECL%20105%20_%20V02.pdf) |
| **Erba Chem 5x** | Semi-auto biochemistry | USB, **RS-232** | Bidirectional LIS | [Erba India](https://erba.velocitabrandconsultants.com/product/clinical-chemistry/chem-5x-semi-automated-clinical-chemistry-analyzer/) |
| **Erba Laura Smart** | Urine strips | **RS-232 or USB**, barcode port | LIS/HIS | [Erba](https://www.erbalachema.com/en/products-and-solutions/urine-analysis/urine-analyzer-laura-smart/) |
| **Aspen BG Plus** | Blood gas + electrolytes, cartridge | **4 USB only** — no LAN or RS-232 found | Not stated anywhere | [listing](https://www.hospitalstore.com/aspen-blood-gas-analyzer) — distributor, not manufacturer |
| **Electrolyte analyzer** | Na, K, iCa, pH, HCO₃, Cl | Unknown | Unknown | — |
| **Bionet CardioTouch 3000** | 12-channel ECG, **movable** | **LAN + USB**, Wi-Fi optional | BMS-Plus → JPEG/BMP/XML/**PDF** | [Bionet](https://bionetus.com/medical/ecg-spirometer/cardiotouch-3000-12-channel-electrocardiograph/) |
| **ADONIS + ECORAD/DROP/MediLite** | X-ray generator + DR panel PC | PC on a network | DICOM, to be confirmed | — |
| **RMS Helios** | Spirometry (PFT) | Windows PC | PDF export | — |
| **RMS TMT** | Treadmill test | Windows PC | PDF export | — |

### Notes that cost us time to learn

**The electrolyte analyzer has no identifiable maker.** The sticker reads
"Serviced & maintained by Chem-leon Diagnostics" — that is the service company,
not the manufacturer. These ISE analyzers are near-universally RS-232, but the
brand has to come off the back panel before anything is ordered.

**The Aspen BG Plus may have no LIS output at all.** Every listing shows USB and
nothing else. Before promising a hospital anything about blood gases, look at
the back of the unit and ask what the lab does with the results today.

**The H360's only data port is the LAN port.** This was counter-intuitive — a
machine of this class would historically be serial — and it is the single most
useful fact in this document. See §4.

---

## 3. What our connector can do today

`connector/` is a program the hospital runs on one of its own PCs. It is built
and published (v1.0.1). The architecture that matters:

```
analyzer → handshake → DISK → uploader → Uyirly
                        ▲
                  before anything is sent
```

A result is written to disk the moment it is complete and **before** any network
attempt, because an analyzer transmits once and forgets. Everything after the
disk write is retry logic and can fail safely.

| Transport | State | Notes |
|---|---|---|
| **TCP** (port 5150) | Works | Several analyzers concurrently, one link per connection, records never interleaved |
| **MLLP** (HL7 framing) | Works, added 24 Oct 2026 | `<VT> message <FS><CR>`, released on the end marker, HL7 `MSA\|AA` sent back |
| **Serial (RS-232)** | Code written, **not in the shipped exe** | `serialport` is a native module and is `external` in `build.mjs`; the dynamic import fails gracefully |
| **Watched folder** | Works | Waits until a file stops growing |
| **DICOM** | Works | C-STORE, C-FIND worklist, C-ECHO |

Server side: raw stored before parsing, idempotent by message hash, tenant from
the connector token. Analyzers move `discovered → quarantine → live → paused`.

**ASTM and HL7 are both parsed** as of 24 Oct 2026. `npm run verify:hl7` checks
the parser against a realistic H360 message and the ways a real instrument
misbehaves; pass it a captured file to inspect a new machine's traffic.

**The device library holds exactly one machine**, a Mindray BC-5130, and it is
not yet verified against a real unit.

---

## 4. The plan

Ordered by what unblocks the most for the least work, which is not the order
anyone expects.

### Phase 1 — HL7 ingest *(no hardware)* — **done 24 Oct 2026**

The H360 is the highest-volume instrument in the building and its only data port
is Ethernet speaking HL7 over TCP/IP. It needs a network cable and nothing else.
What blocked it was our parser.

- `src/lib/lab/hl7.ts` parses ORU^R01: MSH, PID, OBR, SPM, OBX.
- The instrument is identified from MSH-3 and MSH-4, the same fingerprint shape
  ASTM produces, so one device library serves both protocols.
- Everything downstream — mapping, quarantine, idempotency, sample matching —
  is unchanged and shared.
- `connector/src/astm-link.ts` gained MLLP framing (below).
- Replay already exists per message (`retryMessage`, from Settings → Analyzers),
  which is what would have rescued any HL7 stored before the parser landed.
  There are none to rescue: `analyzer_messages` is empty, because no analyzer
  has ever connected.

**Three things learned the hard way, worth keeping:**

1. **MSH is numbered differently from every other segment.** MSH-1 *is* the
   field separator, so after splitting, MSH-3 is index 2 while PID-5 is index 5.
   Reading MSH-3 as index 3 returns the receiver instead of the sender and looks
   like it works. There is a test for this.

2. **Haematology analyzers send histograms as OBX segments**, typed `NA` or
   `ED`. They are waveform payloads, not measurements. Treating them as results
   fills a patient's report with hundreds of numbers, and on a real H360 it
   would happen on the very first sample.

3. **MLLP framing is not optional.** Without it an HL7 stream falls through to
   the unframed path, where nothing marks where a message ends — so it is only
   released on the 15-second idle timeout, and two samples sent inside that
   window are **concatenated into one message**. Two patients' results in one
   envelope is the worst thing the link layer could do, and it is the reason
   that class exists. Fixed, with tests.

**On acknowledgements:** the H360's own *Communication Acknowledgement* setting
is normally turned **off**, because it cannot read a standard HL7 ACK. We send
`MSA|AA` regardless — an instrument that cannot read it ignores it, and an
instrument waiting for one that never comes stalls.

### Phase 2 — the serial machines

Four instruments are RS-232: Chem 5x, ECL 105, Laura Smart, and the electrolyte
analyzer. Two ways in, and they are not exclusive:

**(a) A serial-to-Ethernet device server.** One box, 4–8 serial ports in, one
network port out, each port opening a TCP connection to the connector. It makes
serial machines arrive through the door that already works, survives a knocked
cable, and does not care that Windows renumbers COM ports after a reboot.
≈ ₹3,000–15,000 per lab.

**(b) Ship the native serial module alongside the exe.** Removes the hardware
dependency for the hospital that will not buy a box. More packaging work and a
larger installer.

Do **(a)** for the first hospital because it is buyable this week, and **(b)**
when a second hospital refuses to buy hardware.

### Phase 3 — the device library

Each instrument needs its codes mapped to our analytes once, globally. The second
hospital with an H360 then configures nothing.

This does **not** require being on site. The connector stores raw messages before
parsing, so the sequence is:

1. Connect, let it collect for a week. Results sit in quarantine. The hospital
   keeps working on paper.
2. Build the mapping from that traffic, remotely.
3. Switch to live.

### Phase 4 — radiology

If the DR panel software speaks DICOM, this works today with no new code: point
it at the connector's DICOM port. Confirm first, because it may be the cheapest
win in the building.

**Proved 24 Oct 2026, not assumed.** The claim had been made twice before
anybody checked it. `connector/test/dicom-worklist.test.ts` stands up the real
server and queries it with a real DICOM client: C-ECHO answered, the full
worklist returned, a CT console correctly not shown the X-ray list, an empty
list returned as a success rather than a failure (a machine that gets an error
here often stops asking until somebody restarts it), and every field a console
writes into the image present — accession, hospital number, name, sex, date of
birth, and the modality and start time **inside the scheduled step sequence**,
which is where a console reads them. Putting those at the top level instead
shows an empty worklist on the machine while the query itself looks successful.

It also turned up that `associationReleaseRequested` was not implemented, so
the library logged an ERROR every time a machine hung up — which, for a
department polling the worklist every few seconds, is a log full of errors
produced by nothing going wrong. Fixed.

### Phase 5 — the PC-based and movable devices

Spirometry, TMT and ECG produce PDFs rather than results. Watched folder, filed
against the patient as a document. The ECG is movable and speaks its own
protocol, so it is last and may never be more than a PDF.

### Phase 6 — lab host query

Showing the patient's name and ordered tests on the analyzer. See §5 for why
this is later than it sounds: the barcode already solves the half that affects
patient safety, and this is the half that saves a technician reading a screen.

---

---

## 4b. How this is done elsewhere, and what it tells us

Researched 24 Oct 2026, because it is worth knowing whether we are solving a
solved problem badly.

**The standard shape is middleware on a PC in the lab.** A program sits between
the instruments and the information system, speaks ASTM or HL7 down to the
machines over RS-232 or TCP, and whatever the system wants upwards. That is
exactly what `connector/` is. Nothing about our architecture is unusual; the
disk-before-send rule is the part worth defending.

**Per-instrument support is a library, not a protocol.** ASTM and HL7 say how
bytes are arranged, not what `GRAN%` means or which field holds the barcode.
Every vendor deviates. So the work is one mapping per model, accumulated — which
is why `device_library` is global and keyed on the instrument's self-declared
identity, and why the second hospital with an H360 should configure nothing.

**Indian competitors advertise 330+ analyzers.** That is the bar for a mature
LIS here, and it is a bar made of years of captured traffic, not of cleverness.
It also tells us the sales claim to avoid: we have one verified instrument.

**Offline-first is a selling point here, not an edge case.** At least one Indian
LIS leads with the lab continuing to work with no internet and syncing later.
Our connector already behaves this way for results; the application does not.

**The barcode is how results find patients everywhere.** Nobody relies on the
analyzer's own running sample number. Confirmation that §5's conclusion is the
ordinary one.

### On the H360 specifically

A published open-source gateway built for this exact instrument reports:

- it sends **HL7 over MLLP/TCP**, so the framing is `<VT> message <FS><CR>`;
- the **sample barcode is in OBR-3**, which is what our parser prefers;
- in the analyzer's LIS menu you set **host IP and port**, confirm the protocol
  is HL7 (TCP/IP), and turn **Communication Acknowledgement off** — the H360
  cannot read a standard ACK;
- the gateway sends `MSA|AA` anyway, to stop the instrument stalling.

Every one of those matches what we have now built, which is the most reassuring
thing in this document. Source:
[lims-instrument-gateway](https://github.com/AdityaKalmekh/lims-instrument-gateway).

---

## 5. Patient details — getting them *to* the machine

Everything above is about results coming back. The other direction matters just
as much, and the two halves are at completely different stages.

### Radiology: already built

The connector answers a scanner's **DICOM Modality Worklist** query (C-FIND)
from `GET /api/device/radiology/worklist`, which serves pending radiology orders
with the patient's name, UHID, date of birth, sex and the accession number.

This is the single most valuable thing in radiology integration and it has
nothing to do with images. Today a technologist types the patient's name and
hospital number into the console by hand, and a typo files the study against the
wrong patient — the most dangerous routine error in a radiology department, and
one nobody catches until somebody reads the wrong chest. With a worklist the
names appear on the machine and they pick from the list, so every image is born
carrying the right identifiers.

**Confirm the DR software supports MWL** — on this hospital's X-ray PC that means
asking whether ECORAD or MediLite has worklist settings. If it does, this works
with no new code.

### Lab: not built, and only half needed

There is no equivalent lab endpoint. `/api/device/lab/` has `results` and
nothing else. But the lab problem decomposes into two separate things that are
usually confused:

**(a) Matching the result to the right patient.** Solved by the barcode alone.
Our tube labels already carry the accession number as Code 128. An analyzer with
a barcode reader reads it off the tube, puts it in the message, and the result
lands on the right order with no conversation at all. **This needs nothing new.**

For an analyzer without a reader, the technician types our accession number into
the machine as the sample id. Tedious but reliable, and far less error-prone
than typing the results themselves. Worth knowing which of this hospital's
instruments have a reader — the Laura Smart has a barcode port, and the Aspen BG
Plus lists a barcode scanner as an input device.

**(b) Showing the patient's name and the ordered tests on the machine.** This is
what needs host query, and it is a convenience rather than a correctness
requirement. The analyzer reads the tube, asks "what am I running for
2610240017?", and the LIS answers with the name and the test list.

If we build it, it mirrors radiology exactly:

```
GET /api/device/lab/worklist   →  connector caches it  →  answers the analyzer
```

**The cache is the point, not an optimisation.** An analyzer gives the host a
few seconds to answer a query before giving up; a round trip to our servers over
a hospital's broadband will sometimes miss that window. The connector must hold
the pending worklist locally and answer from memory, refreshing in the
background — the same shape as radiology, and for the same reason the result
path writes to disk first.

**Priority: after results flow.** Bidirectional ordering is worth nothing until
one-way delivery is reliable, and the barcode already solves the half that
affects patient safety.

---

## 6. Not losing anything, and backups

### What already protects a result

| Where | What it does |
|---|---|
| **Connector queue** | One file per unsent message, written to disk **before** any network attempt. Survives a power cut, a broadband outage, a crashed uploader. Deliberately one JSON file each rather than a database, so a bad night is recoverable with a text editor. |
| **Raw before parsed** | The server stores the message before anything tries to understand it. A parser bug loses a debugging trail, not a patient's result — and the message can be replayed once fixed. |
| **Idempotent by hash** | Analyzers retransmit freely — on a timeout, on a reconnect, when a technician presses send again. A duplicate is a no-op, never a second result. |
| **Delivery means acknowledged** | A message is only removed from the queue when the server says it has it. |
| **Database** | Supabase managed Postgres, `ap-south-1`. |

**Nothing has ever been stored.** `analyzer_messages` is empty — no analyzer has
yet connected to any tenant, so none of the above has been exercised against a
real instrument. The mechanism is built and tested; it has not been proved by
use. Say it that way to a hospital.

### The three gaps

**1. ~~Nothing tells anyone an analyzer went quiet.~~ Done 24 Oct 2026.** A bar
on the laboratory worklist names any `live` analyzer that has sent nothing for
four hours — on the worklist rather than in settings, because it is a message
for whoever is running the bench and nobody opens settings until something has
already gone wrong. It says what to do about it, too: anything measured while
the link was down is in the machine's own memory and must be sent again.

Silent outside 08:00–21:00 IST. A lab that closes at eight has every analyzer
quiet by midnight, and a warning that is always on is a warning nobody reads.

The rule lives in `src/lib/lab/silent.ts`, apart from the query, so it can be
tested without a hospital or a clock: `npm run verify:lab-alerts`.

**2. DICOM images never leave the lab PC.** The connector sends the study's
details to the server and tells the hospital *"the images are on this computer
and nothing is lost"*. That is true until that computer's disk fails. There is no
second copy anywhere. A hospital that loses that PC loses its images, and the
report that quotes them will outlive them.

**3. Database backup policy is unconfirmed.** Supabase takes managed backups, but
what retention and whether point-in-time recovery is enabled depends on the
project's plan. **Check it in the dashboard and write the answer here** — "we have
backups" is not a sentence anybody should say about a hospital's data without
knowing the retention.

### What a hospital should be told

Be specific rather than reassuring. A small hospital asking "is my data safe?"
is really asking three questions, and they have different answers:

- *If the internet drops?* Nothing is lost. The connector holds results on its
  own disk and sends them when the line returns.
- *If the lab PC dies?* Lab results already delivered are safe on our servers.
  **Radiology images on that PC are not** — until gap 2 is closed.
- *If your servers die?* Managed Postgres backups — with the retention confirmed
  in gap 3, not assumed.

## 7. Wiring, and the wireless question

The lab is small, some instruments live outside it, and the ECG moves. Cable runs
would be ugly and partly impossible.

**Wireless is viable, with one caveat that matters more than the convenience.**

- **Serial-to-Wi-Fi bridges** (Elfin-EW11, USR-W610 class, ≈ ₹1,500–3,000) turn
  any RS-232 machine into a Wi-Fi TCP client. Matchbox-sized, 5V power.
- **The iChroma II has a manufacturer Wi-Fi dongle**, which is a supported route
  rather than a third-party one.
- With bridges, **the connector PC need not be in the lab at all** — reception or
  the billing PC will do.

**The caveat.** Our disk-first guarantee begins only when the message *reaches*
the connector. If a Wi-Fi link is down at the moment an analyzer transmits, the
result is gone — recoverable from the instrument's own memory, but only if
somebody notices. We record `last_message_at` and show it on a settings page.
**We do not alert.**

> Over a cable that is a nice-to-have. Over Wi-Fi it is essential, and it should
> ship before the first wireless hospital goes live.

**Non-negotiable either way:** the connector PC needs a static or reserved IP.
Analyzers store that address in their keypads, and a DHCP change on a Sunday
stops everything silently.

---

## 8. What to collect on the next visit

1. **Photograph every back panel.** It answers more than any datasheet.
2. **Find the LIS menu** on each — *Setup → Communication / Host / LIS*. A machine
   can have a serial socket that is only for service. Note the baud rate.
3. **Capture an hour of traffic** with a laptop and a ₹500 USB-to-serial adapter:

   ```
   uyirly-connector --capture                          # network machines
   uyirly-connector --capture --serial COM3 --baud 9600
   ```

   Needs no account and uploads nothing. Every message is saved to its own file;
   bring the files home and run `npm run verify:hl7 <file>` to see what the
   machine actually said. That turns unknown instruments into library entries
   and the rest can be done remotely.
4. **Identify the electrolyte analyzer and the Aspen BG Plus** properly.
5. **Ask whether the DR software has DICOM settings.**
6. **Daily volume per machine**, which decides everything about order.

---

## 9. What not to promise

Analyzer connectivity should stay off the pricing page until several machines are
in the library and verified. One hospital fully connected is worth more as a
reference than five half-wired ones, and a hospital that bought on a promise will
be waiting while we do unpaid integration engineering.

What is sellable to a lab like this one today, with no cable at all: barcoded
samples, a worklist, verified results, PDF reports, portal delivery. The typing
stays; everything around it improves.
