# Less typing

Written 26 Oct 2026, after the question "can AI help with the forms, and can
we store regular consultations as templates".

The short version: **it is three different problems wearing the same
complaint, and only one of them wants AI.**

| Where the typing is | What actually fixes it |
|---|---|
| Statutory forms — MLC, Form F, police intimation | Prefill (mostly done) + a phrase library for the handful of free-text boxes |
| Routine consultation notes | **Templates — the idea in the question. The best-supported of the three.** |
| The unusual consultation | Dictation, which is why the mic is there and why it disappoints |

---

## 1. The forms: most of the typing is already gone

`startMlc` pulls `full_name, uhid, dob, gender, phone, address, district,
state, pincode` from the patient and `arrival_mode, complaint, arrived_at`
from the emergency case. Those boxes are filled before anybody sees the form.

Several more are already pick-lists, from `mlc_options`: smell of alcohol,
disposal, how the patient arrived.

**What is genuinely left to type is short, and there are only four of them:**

- *Alleged cause, in the informant's own words*
- *Identification mark 1 / 2*
- *Describe each injury — site, size, shape, and how old it looks*
- *First aid and treatment given*

That is not an AI problem. Three of the four are **formulaic sentences a
casualty officer writes a hundred times a year**:

```
Contusion 5 × 3 cm over the left forearm, reddish-blue, about 12 hours old
Lacerated wound 2 cm over the right eyebrow, edges irregular, bleeding
Mole on the right cheek · Scar 2 cm over the left knee
```

A pick-and-edit phrase list fills those in two taps. It works with no
internet, costs nothing per use, and — unlike a model — cannot invent an
injury that was not there. On a form that is **evidence in a criminal case**,
that last property is worth more than cleverness.

*Alleged cause, in the informant's own words* should stay typed. The law wants
the informant's words, not a tidied version of them, and a template there
would be actively wrong.

---

## 2. Consultation notes: the template idea is the right one

The question proposed storing regular consultations as templates, letting the
doctor pick one, and growing the library per tenant. That is the strongest of
the three ideas and it is what the evidence supports.

### What the evidence says

- Templates, macros and autotext are used by **60–90% of clinicians**. This is
  not a novel idea; it is the normal way notes get written.
- A survey found **71% of physicians agreed copy/paste promotes
  inconsistencies** within progress notes — the known failure mode.
- Reviews are blunt that these tools "add redundant detail that can obscure
  important information" — *note bloat*.
- But the criticism is not one-sided: ECRI notes that **forcing clinicians to
  retype information may itself cause more errors**, and that longer notes can
  mean more timely documentation.
- Documentation time figures for templates versus free text circulate widely
  (8–12 minutes free text, 2–4 with optimised phrases) but **cite no studies**.
  Treat them as sales material.

**There is no rigorous head-to-head trial** of structured templates versus
free text for time *and* accuracy. That gap is worth saying out loud before
promising a number to a hospital.

### The design that avoids the known failure

Note bloat is not caused by templates. It is caused by templates that are
**long and never edited**. So:

- **Lean, not complete.** A template is a skeleton with the common findings,
  not a full note with everything negative pre-ticked. The doctor adds; they
  should not have to delete.
- **Reasoning stays free text.** Vitals, diagnosis codes and drugs belong in
  structured fields — they already are. The assessment is the doctor's
  thinking and a dropdown cannot hold it.
- **The template must be touched.** A note saved byte-identical to its
  template is the thing to design against; that is where the 71% comes from.
- **Nothing carries forward silently.** Today's note starts from the template,
  never from yesterday's note.

### Per tenant, and learning — as the question proposed

Both halves of that instinct are right:

**Per tenant.** A template written by a Karur casualty officer is not a
template for a Chennai dermatologist. There is already a shape for this:
`departments.clinical_template` holds `general | dental | ophthalmology |
paediatrics | obgyn`, so the product already accepts that a note's skeleton
depends on the department. Phrases should hang off the same idea, owned by the
tenant and scoped to a department, with the hospital free to edit every one.

**Improving over time.** The honest version is not a model retraining itself.
It is a count: when a doctor writes the same assessment the fifth time, offer
to save it as a phrase. A library a hospital built by accepting its own
suggestions is one it trusts; one shipped from outside is one it ignores.

**And a starter set matters more than it sounds.** An empty library is never
filled — the first week is exactly when a doctor has no time to build one.
Ship perhaps twenty phrases per department, obviously editable.

---

## 3. The microphone, and why it disappoints

`SpeechTextarea` uses the browser's own `SpeechRecognition`. That is a
general-purpose, mostly-English engine running on a device, and it is being
asked to transcribe Indian-accented English mixed with Tamil, full of drug
names and abbreviations it has never been trained on. It was always going to
struggle, and no amount of tuning the component will fix it.

What the literature says about the serious version of this — ambient AI
scribes — is worth knowing before spending money on it:

- A 2026 arXiv paper states plainly that **there are no public large-scale
  real-world benchmarks for ambient scribes deployed in India**; existing ones
  are synthetic and cover few languages, specialties and regions.
- The US evidence is genuinely good: a JAMA study across five academic centres
  found **16 minutes saved per encounter**, and a JMIR time-motion study found
  less documentation time with unchanged consultation length and more eye
  contact. But that study was **81% English** and did **not** assess whether
  note accuracy held.
- The error profile is the problem: word-level errors "can affect medication
  names, units, or quantities", and errors fall **disproportionately on
  non-native accents**.

So: good evidence, from a setting that is not this one, for a failure mode
that is exactly a drug name or a dose.

**Dictation is the third tool, not the first.** It earns its place on the
unusual consultation — the one no template fits — where the alternative is a
long paragraph typed with one finger. Not on the routine follow-up, where a
template is faster, free, and offline.

If the mic is to be improved rather than replaced, the cheap step is to set
the recognition language to Indian English and add a domain hint list of the
hospital's own drug names from `drug_master`. That will not fix it, but it is
a day's work against a problem that otherwise needs a different engine.

---

## 3a. Dictate, then clean — the shape to actually build

The proposal: **do not listen to the consultation.** The doctor dictates, as
now. The rough transcript is passed through a model to be tidied, and the
doctor sees the result before it lands in the field.

That is a materially better design than ambient scribing, and the research
supports it more specifically than it supports the ambient version.

**Why it is safer by construction:**

- **No patient audio.** No recording of a consultation, no consent question,
  no third party in the room. The only voice is the doctor's, saying what they
  were going to type anyway.
- **Dictation is an easier problem than conversation.** One speaker, speaking
  deliberately, saying clinical sentences. Not two people interrupting each
  other in two languages.
- **The model's job is narrow.** Tidy a sentence that already exists. Not
  decide what was clinically important in twelve minutes of talk.
- **A person reads it before it is saved** — which is the single intervention
  with the strongest evidence behind it.

**What the evidence says:**

- Post-processing an accented clinical transcript with a model **recovered
  much of the accuracy lost for non-native speakers**. That is precisely the
  Indian-accent problem the current microphone has.
- A JAMA Network Open study found speech-recognition clinical notes carried a
  **7.4% error rate — falling to 0.4% after human review**. The review step is
  what makes dictation safe, and this design keeps it.
- A bilingual code-switched study (the Tamil-and-English case) found model
  post-processing still left word error around **0.37**. So: expect real help,
  not a solved problem.

**The danger, named:** a scoping review calls it **cascading errors** — a
small transcription mistake amplified by the model into a *fluent but wrong*
clinical narrative. Garbled input becomes confident, well-written, incorrect
text. That is worse than the garble, because the garble was obviously wrong.

### The rules that make it safe

1. **Numbers are never changed.** Doses, frequencies, durations, vitals,
   blood pressures — these pass through untouched. If the transcript says
   `5 mg`, the output says `5 mg`, even if 50 would read better. Most of the
   harm in a clinical note lives in its numbers.
2. **Drug names are corrected only against this hospital's own list.**
   `drug_master` is the dictionary. `paracetmol` → `Paracetamol` because that
   is in the catalogue; a name that matches nothing stays exactly as dictated
   and is flagged, not guessed.
3. **Tidy, do not restructure.** Fix the words, fix the punctuation, keep the
   doctor's order and the doctor's meaning. Do not sort it into
   subjective/objective — deciding which is which is interpretation, and
   interpretation is where invention starts.
4. **Nothing is added.** No normal findings the doctor did not say, no
   inferred diagnosis, no helpful completions.
5. **Show both.** The raw transcript and the cleaned version side by side,
   with the changes marked, so a wrong "correction" is visible rather than
   buried in fluent prose.
6. **The doctor accepts it.** It is a suggestion until a person says so.
7. **It must degrade, never block.** No internet, slow model, failed request:
   the raw transcript goes into the box and the doctor edits it as they do
   today. Dictation must never stop working because an API did.

### How it fits with templates

They are for different consultations, and both are wanted:

- **Template** — the routine follow-up seen forty times a week. Two taps, no
  internet, no cost.
- **Dictate and clean** — the unusual case no template fits, where the
  alternative today is a long paragraph typed with one finger.

Building templates first is still right: they cover the larger share of visits
and cost nothing to run.

---

## 4. What to build, in order

1. **A phrase library for the four MLC free-text boxes.** Small, offline,
   cannot invent. Reuses `mlc_options`' existing shape.
2. **Consultation templates, per tenant, per department**, lean, with a
   starter set, and an offer to save a phrase once it has been written a few
   times.
3. **Dictate-then-clean** on the mic that already exists (§3a) — the doctor's
   own voice only, numbers untouched, drug names checked against the
   hospital's catalogue, both versions shown, nothing saved unaccepted, and a
   raw transcript when the model is unreachable.
4. **Not ambient scribing.** Revisit when there is an Indian benchmark to
   judge it by, or when a hospital will pay to be the trial.

**AI's place in this is small and specific** — not writing the note, but
noticing that the doctor has typed the same thing five times and offering to
remember it.

**Sources:** [Accent-related errors and an LLM remedy](https://pubmed.ncbi.nlm.nih.gov/41772044/) ·
[Speech-recognition errors in clinical documents, JAMA Netw Open](https://jamanetwork.com/journals/jamanetworkopen/fullarticle/2687052) ·
[Bilingual code-switched medical ASR with LLM postprocessing](https://pmc.ncbi.nlm.nih.gov/articles/PMC13344086/) ·
[ASR in healthcare post-LLM, scoping review](https://www.mdpi.com/2227-9032/14/10/1333) ·
[Note bloat review, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11852943/) ·
[ECRI copy/paste literature review](https://www.ecri.org/Resources/HIT/CP_Toolkit/CopyPaste_Literature_final.pdf) ·
[Ambient scribes in India — the benchmark gap](https://arxiv.org/html/2609.17355v1) ·
[JMIR time-motion study of an ambient scribe](https://medinform.jmir.org/2026/1/e85580) ·
[Ambient scribes in the ED — scoping review](https://pubmed.ncbi.nlm.nih.gov/42585863/)
