# Video consultation — what the law requires and what it would cost

Written 29 Oct 2026. **Analysis only — nothing here is built.** There is no
video, WebRTC or telemedicine code in the repository.

The regulatory sections were extracted from the primary source — the Board of
Governors' *Telemedicine Practice Guidelines*, 25 March 2020, hosted by the NMC
(51 pages, appended to the IMC Ethics Regulations 2002). Page numbers below refer
to that PDF. Published summaries of these guidelines are unreliable; one widely
cited explanation of the drug lists is a student revision page and gets them
wrong. Read the PDF.

Vendor prices were taken from LiveKit's own pricing page on 29 Oct 2026; the
others are third-party comparisons and should be confirmed before budgeting.

---

## 1. The regulation decides the product, so start there

### The drug matrix (p.22) — this is the whole business case for video

| List | Mode allowed | Consult type | What's in it |
|---|---|---|---|
| **O** | any | any | OTC — paracetamol, ORS, antacids |
| **A** | **video only** | first consult, or follow-up refill | Conditions diagnosable only by seeing — antifungals for tinea cruris, cipro eye drops for conjunctivitis — plus chronic-disease refills (diabetes, hypertension, asthma) |
| **B** | any | **follow-up only** | 'Add-on' medicines optimising an existing condition — e.g. adding enalapril when atenolol alone is not controlling BP |
| **Prohibited** | — | — | Schedule X of the Drugs & Cosmetics Rules, and NDPS narcotics/psychotropics |

**On a first teleconsultation without video, a doctor may prescribe List O
only** — paracetamol and ORS. Add video and List A opens. Audio-only
teleconsultation is close to useless for new patients, and that is a regulatory
fact, not a quality judgement. It is also why audio is perfectly adequate for
follow-ups, where List B permits any mode.

The actual drug list is Annexure 1 of the guidelines; the sample prescription
format is Annexure 2.

### First consult vs follow-up (p.19) — computable from data we already hold

**First consult** means any of: the patient is consulting this RMP for the first
time; *or* more than 6 months have lapsed since the previous consultation; *or*
it is for a different health condition.

**Follow-up** means the same RMP within 6 months of the patient's previous
**in-person** consultation, for continuation of the same condition. It is *not* a
follow-up if there are new symptoms outside the spectrum of that condition, or if
the RMP does not recall the context of the previous treatment.

We hold visit dates, doctor ids and diagnoses. **The system can tell the doctor
which list they may prescribe from, before they prescribe.** That is a
differentiator, not merely compliance.

### Everything else the guidelines require

- **Consent** — implied when the patient initiates; **explicit and recorded in the
  patient record** when the RMP, a caregiver or a health worker initiates. Any
  form will do, e.g. "Yes, I consent to avail consultation via telemedicine".
- **Identification** — the RMP must begin the consultation by stating their name
  and qualifications.
- **Registration number (3.2.5)** — "Every RMP shall display the registration
  number... **on prescriptions**, website, electronic communication and receipts".
- **Prescription** — issued per the IMC Regulations; a signed photo, scan, digital
  copy or e-prescription must be sent to the patient and retained. If transmitted
  straight to a pharmacy, explicit consent is needed that the patient may fill it
  at a pharmacy of their choice.
- **Fee** — treated the same as in-person; **a receipt/invoice must be issued**.
- **Records (3.7.2)** — see §3 below.
- **Misconduct** — prescribing without an appropriate diagnosis; prescribing from
  the restricted list; misusing patient images; and **soliciting patients for
  telemedicine through advertisements or inducements**. Penalties under the IMC
  Act.
- **AI may not prescribe or counsel (5.4)** — "Technology Platforms based on
  Artificial Intelligence/Machine Learning are **not allowed to counsel the
  patients or prescribe** any medicines... the final prescription or counseling
  has to be **directly delivered by the RMP**." AI may assist evaluation and
  decision support.
- **Technology platform obligations (section 5)** apply to platforms working
  "across a network of Registered medical practitioners" enabling patients to
  consult through the platform: verify NMC/state-council registration, publish
  each RMP's name, qualification, registration number and contact, run a
  grievance mechanism, and report non-compliance. **Whether Uyirly falls under
  this is a lawyer's question** — we are hospital software serving a hospital's
  own doctors and patients, not a consumer marketplace, but the patient portal
  does let patients book.

---

## 2. A compliance gap in the current code

There is **no medical council registration number on `profiles`**. Checked
against the live schema on 29 Oct 2026: `profiles` has twelve columns and not one
of them is a registration number, a qualification or a specialty. The only
`reg_no` columns anywhere belong to PC&PNDT and Form F, typed per form. The
prescription PDF route prints no doctor registration number at all.

Under 3.2.5 that is arguably already non-compliant for existing paper
prescriptions, and it is a hard blocker for teleconsultation. The fix is small:
one column, one field on the staff form, one line on the Rx template. Qualifications
are not stored either, and the RMP must state them.

---

## 3. What to store

The regulation (p.24, 3.7.2.1) requires:

> Log **or record** of Telemedicine interaction (e.g. Phone **logs**, email
> records, chat/text record, video interaction **logs** etc.)

Every example is a **log** — metadata. "Video interaction logs" is not "video
recordings". We must prove *that* a consultation happened, with whom, when, for
how long, in what mode. We are **not** required to keep the media.

| Tier | What | When |
|---|---|---|
| 1 | Interaction log — visit, patient, doctor, mode, start/end, duration, join/leave events, consent type and exact wording, prescription issued, network-quality summary (~1 KB) | always |
| 2 | Clinical note and prescription — **this is the medical record** | always |
| 3 | Chat transcript, if in-call text exists | always, if offered |
| 4 | Audio — explicit consent, short stated retention, auto-delete | opt-in per consultation |
| — | **Video** | **no** |

### Why not video

- **Cost.** 20 minutes ≈ 300 MB. Ten consults a day is 1.1 TB/year per clinic.

  | | Per year | Year-3 storage |
  |---|---|---|
  | Audio only | ~22 GB | ~₹77/mo |
  | Video | ~1.1 TB | ~₹3,800/mo |

  Fifty times the cost, for data nobody will watch.
- **Liability.** A recording is evidence. In a medico-legal case it becomes the
  centre of the case — the exact words, a hesitation, a misheard sentence. Under
  DPDP it is about the most sensitive data we could choose to hold, with breach
  notification and erasure rights attached.
- **It may lose us doctors.** Indian doctors are acutely litigation-aware.
  "We record your consultations" is a feature some will refuse outright.
- **Consent cuts both ways.** Recording needs explicit consent and the right to
  refuse, so a non-recorded path is required regardless. Build that first.

If a hospital insists on recording, it belongs in **their** bucket under the
bring-your-own-cloud model — their data, their retention, their liability. See
[imaging-cloud-storage.md](./imaging-cloud-storage.md).

**If recording is ever built:** a recording that fails silently is worse than
none, because the doctor believes they have a defence and stops being careful. If
it is on, it must be verifiably on, visibly, to both parties.

### The transcription question

The real prize is not evidence, it is **note writing**. Transcribe, draft the
note, doctor edits and signs. Drafting a note the RMP then signs is not
counselling or prescribing, so §5.4 reads as permitting it — but that is our
reading of a sentence a regulator could read differently, and it should go in
front of a lawyer before anything is built on it.

**`SpeechTextarea` already does dictation**, and the note-phrase picker sits in
the same boxes. So the doctor can speak their note during or after the call and
have it transcribed into the record **with no media stored at all**. Exhaust that
before building audio capture.

---

## 4. Technology

Four layers; only one is a real decision.

1. **Signalling** — exchange SDP and ICE candidates. Supabase Realtime is already
   in the stack and sufficient.
2. **Media** — P2P for 1:1, or an SFU for 3+.
3. **TURN relay** — non-negotiable. Roughly 10–20% of connections cannot go direct
   through NAT or clinic firewalls.
4. **Client** — browser plus the Capacitor WebView.

### Vendors, with a warning

**Twilio Programmable Video is the cautionary tale** — sunset announced 2023,
extended, then reportedly reversed in Oct 2024. Guides still recommend it.
Whatever is chosen needs an escape hatch.

| Option | Cost | Note |
|---|---|---|
| **LiveKit Cloud** | see below | server is Apache-2.0 — self-host the identical thing |
| Daily | ~$0.004/participant-min after 10,000 free | 8× LiveKit |
| Agora | ~$0.004/min HD, ~$0.001 audio | prepaid bundles |
| 100ms | ~$0.004/min, Bengaluru-based | reportedly acquired by JioHotstar 2023; ownership unclear — the Twilio risk |
| Self-hosted Jitsi | server + bandwidth | free, highest ops burden |

### LiveKit Cloud, video only (AI-agent pricing ignored)

| | Build | Ship | Scale |
|---|---|---|---|
| Base | $0 | **$50/mo** | $500/mo |
| WebRTC minutes | 5,000 | 150,000 | 1.5M |
| Overage | not listed | $0.0005/min | $0.0004/min |
| Concurrent connections | 100 | 1,000 | 5,000 |
| Downstream data | 50 GB | 250 GB | 3 TB |
| Data overage | not listed | $0.12/GB | $0.10/GB |
| Uptime | 99.99% | 99.99% | 99.99% |
| **Region pinning** | ✗ | **✗** | **✓** |

### The cost arithmetic

Two meters, billed independently. LiveKit charges **per person per minute**.

```
Time:  20-min consult × 2 people   = 40 participant-minutes
       40 × $0.0005                = $0.02   ≈ ₹1.80

Data:  20 min × 1 Mbit/s           = 150 MB per receiving person
       × 2 people                  = 300 MB = 0.3 GB
       0.3 × $0.12                 = $0.036  ≈ ₹3.20
                                     total  ≈ ₹5 / consultation
```

But those rates apply only **after** the plan allowance, and the allowance pools
across every tenant. What $50/month buys:

| Allowance | Consults covered |
|---|---|
| 150,000 participant-minutes | 3,750 |
| **250 GB data** | **833** ← binds first |

| Volume/month | Cost |
|---|---|
| First 833 | ₹0 extra — covered by the $50 (₹4,450) |
| 834–3,750 | ₹3.20 each (data only) |
| Beyond 3,750 | ₹5 each |

Ten hospitals at 3 consults/day each (~2,700/month) ≈ **₹1,040 per hospital per
month** against a ₹7,999 plan.

**The 1 Mbps assumption is the whole bandwidth bill and the one thing we
control:**

- cap at 480p / ~600 kbps → ~40% less, ~₹2/consult
- let it adapt upward → 2 Mbps, double
- **audio-only at ~40 kbps → 6 MB for 20 min ≈ ₹0.06**

Capping resolution is one config line and the biggest lever here. The audio
fallback built for bad clinic networks is also a **50× cost saving** — and List B
follow-ups permit audio.

---

## 5. Should we build our own?

Technically yes, and more easily than expected — the browser supplies codecs,
echo cancellation, jitter buffers and congestion control. For 1:1 we would supply
only signalling (~200 lines over Supabase Realtime), STUN, and TURN. A working
call is two to three weeks.

That demo is the easy 10%. The other 90%:

- **Reconnection, not connection** — WiFi↔4G handoff mid-consult, ICE restarts,
  renegotiation, a peer that dies silently. This is where DIY WebRTC actually
  fails, and it is invisible until a doctor is mid-sentence.
- **TURN becomes a server we operate** — public IP, peering, bandwidth headroom,
  monitoring, failover, and a single point of failure for 10–20% of calls.
- **Mobile is where the pain lives** — WKWebView `getUserMedia`, Android
  permissions, earpiece vs speaker routing, and what happens when a real phone
  call interrupts the consult. Vendors with native SDKs have solved all of it.
- **Three participants ends P2P.** Mesh falls apart past three.
- **Observability.** When a doctor says "the call was bad", we need `getStats()`
  collected and viewable.

**And self-hosting is not cheaper at our scale.** $50/month covers ~833 consults;
a decent TURN VM in Mumbai is ₹1,500–3,000/month plus egress. Same money, plus a
pager. Break-even is in the thousands of consults a month.

**The reason to own it is already solved**: LiveKit's media server is Apache-2.0.
If pricing changes or they disappear, self-host the identical software — same
protocol, same client code. The escape hatch without paying for it up front.

Building a *1:1 calling feature* is reasonable. Building a *video SDK* — native
SDKs for five platforms, global TURN, simulcast, observability — is what LiveKit
and Agora do full-time with funded teams.

---

## 6. The residency tension

**Region pinning is Scale-only ($500/mo).** On Ship there is no control over
where the media path goes, and LiveKit's pricing page never names its regions or
confirms Mumbai exists.

We decided patient scans should stay in India. A consultation is the same
patient, more intimate. Whether media *transit* is a cross-border *transfer*
under DPDP s.16 is genuinely unsettled — nothing is stored, but personal data
leaves India. Legal today either way, since no destination is restricted. But a
hospital's IT auditor will ask, and on the cheap tier there is no answer.

Three ways out:

- **Scale at $500/mo** — region pinning; overkill at our volume.
- **Self-host LiveKit in Mumbai** — the escape hatch, used early.
- **P2P for 1:1** — media never touches a server. The strongest residency answer
  available, and it is the DIY path rejected above on cost and reliability
  grounds. **On residency alone, P2P beats every managed option.** If India
  residency becomes a hard sales requirement, that changes the ranking.

---

## 7. Recommendation

**LiveKit Cloud on Ship, wrapped in our own thin `lib/video` module** — `join`,
`leave`, `muteAudio`, `attachTrack`, nothing vendor-shaped leaking past it. The
wrapper is load-bearing for two separate reasons: a pricing change, and a
residency demand. Write it properly from day one.

Three weeks is better spent on the drug-list enforcement and the first-consult
classifier. No vendor sells those, and they are what makes the feature safe for a
doctor to use. The video itself is a commodity.

---

## 8. What plugs into what already exists

More than expected: `appointments`, `getDoctorAvailability`,
`bookPatientAppointment` and `getQueueStatus` exist; the patient portal has its
own session so a patient can join authenticated; `ConsultationWorkspace` is the
doctor's screen a video panel sits beside; prescription PDF and billing (for the
mandatory receipt) are done. `SpeechTextarea` covers dictation.

The schema needs `'teleconsult'` added to the `visit_type` CHECK.

---

## 9. Open questions

1. **Does the free Build tier permit production use?** 5,000 minutes is ~125
   consults/month — enough for a first design partner — but that is in the terms
   of service, not the pricing page. Confirm before leaning on it.
2. **What does "starting at $50" mean?** Base fixed with overages on top is the
   likely reading; the page does not say.
3. **Does section 5 of the guidelines apply to us?** Lawyer question. If yes, we
   must verify registration numbers, publish doctor credentials and run a
   grievance mechanism.
4. **Is AI note-drafting permitted under §5.4?** Our reading is yes. Get it
   confirmed before building on it.
5. **WebRTC in the Capacitor WebView.** Works on Android and iOS 14.3+, but
   camera and mic permissions need declaring in both native projects. Test on a
   real phone before promising the mobile app.
