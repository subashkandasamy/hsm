import type { ToolSection } from './registry'

// ~1,700-word, human-written, simple-English articles rendered under each tool
// for SEO depth. Inline markup: [label](/href) links + **bold**.

export const TOOL_ARTICLES: Record<string, ToolSection[]> = {
  // ────────────────────────────────────────────────────────────────────────
  'hospital-bill-format-generator': [
    {
      h2: 'What a hospital bill actually needs to show',
      blocks: [
        { type: 'p', text: 'A hospital bill is a simple thing on the surface — a list of what the patient was charged for — but it quietly does a lot of jobs at once. It is a receipt for the patient, a record for your accounts, a document the patient may hand to an insurance company or employer, and, if GST applies, a tax invoice. When any one of those readers cannot find what they need, the bill comes back to you with questions. That is why a clear, consistent **hospital bill format** matters more than most people think.' },
        { type: 'p', text: 'At a minimum, a good bill shows five things: who is billing (your hospital or clinic, with address and, if registered, GSTIN), who is being billed (the patient, with a patient ID and the date), what the charges are (itemised, not lumped into one figure), the money summary (subtotal, any discount, any GST, and the final total), and how it was paid (cash, card, UPI, or “to be settled by insurance”). A bill that answers all five reads as professional and rarely gets disputed.' },
        { type: 'p', text: 'The tool above builds exactly this layout for you. You fill in your details once, add the charges as line items, and it produces a clean bill you can print or save as a PDF. There is no sign-up and nothing to install — it runs in your browser.' },
      ],
    },
    {
      h2: 'OPD and IPD bills are not the same',
      blocks: [
        { type: 'p', text: 'People search for an **OPD bill format** and an **IPD bill format** as if they were two different documents, and in practice they are. An OPD (outpatient) bill is short and immediate — the patient walked in, saw a doctor, maybe had a test or bought medicines, and paid at the counter. The charges are few and the bill is usually settled the same day.' },
        { type: 'p', text: 'An IPD (inpatient) bill is a different animal. The patient was admitted, so the bill accumulates over days: room or bed charges per day, doctor visit charges, nursing, investigations, pharmacy, consumables, procedures or surgery, and sometimes package deductions or advance payments already taken. By discharge it can run to dozens of lines. The format has to hold all of that without becoming a wall of numbers, and it usually shows the admission and discharge dates so anyone reading it can see the length of stay.' },
        { type: 'p', text: 'The generator lets you switch between the two at the top. Pick OPD for a quick counter receipt, or IPD when you need room-and-board style itemisation. The structure adjusts, but the discipline is the same: every charge is its own line.' },
      ],
    },
    {
      h2: 'How to itemise charges the right way',
      blocks: [
        { type: 'p', text: 'The single biggest difference between a bill that is trusted and one that is queried is **itemisation**. A patient who sees “Hospital charges — ₹18,400” has no idea what they paid for, and neither does an insurance assessor. Break it down. Each line should carry a description, a quantity, a rate, and the amount.' },
        { type: 'h3', text: 'Group similar charges' },
        { type: 'p', text: 'On a longer bill, it helps to group lines under headings a reader already understands:' },
        { type: 'ul', items: [
          '**Consultation** — doctor visit charges, specialist reviews.',
          '**Room & nursing** — bed or room rent per day, nursing charges, duty-doctor charges.',
          '**Investigations** — lab tests and radiology (X-ray, ultrasound, CT, MRI).',
          '**Pharmacy & consumables** — medicines, IV fluids, gloves, syringes, dressings.',
          '**Procedures** — surgery, minor procedures, OT charges, anaesthesia.',
        ] },
        { type: 'p', text: 'Grouping does not change the total; it just makes the total believable. It also makes an insurance claim far easier, because the assessor can map each group to what the policy covers.' },
      ],
    },
    {
      h2: 'GST on a hospital bill — the short version',
      blocks: [
        { type: 'p', text: 'This is where many bills go wrong. In India, most **core healthcare services are exempt from GST** — consultation, admission, treatment, diagnosis. So the majority of a hospital bill usually carries no GST at all. But there are exceptions. The best-known one is room rent: since it was clarified in 2022, **non-ICU room rent above ₹5,000 per day is taxable at 5%** (with no input tax credit). ICU stays remain exempt regardless of the room charge.' },
        { type: 'p', text: 'Retail pharmacy sales and some standalone services can also attract GST. The practical rule is simple: do not slap one GST rate across the whole bill, and do not ignore GST entirely. Apply it only to the lines that actually attract it. If you are unsure how a specific bill breaks down, our [GST on hospital bills calculator](/tools/gst-on-hospital-bill-calculator) works out the taxable and exempt portions for you in a few seconds.' },
        { type: 'p', text: 'When GST does apply, the bill should show the taxable value, the rate, and the split into CGST and SGST (each half of the total rate for a local supply). The generator handles this split automatically when you set a rate on a line.' },
      ],
    },
    {
      h2: 'Word, Excel, or a generator — which should you use?',
      blocks: [
        { type: 'p', text: 'Most small hospitals start with a **hospital bill format in Word** or a **hospital bill format in Excel**, and for a very low volume that is fine. Word gives you a fixed, good-looking template; Excel gives you formulas that add things up. But both have the same weakness: they are disconnected from your actual patient records, so every bill is typed from scratch and every total is only as correct as the person entering it.' },
        { type: 'p', text: 'That is why people also search for a **hospital bill format PDF** — they want something finished and printable, not another file to maintain. The tool above gives you that: a ready bill you can save as a PDF straight from the print dialog, without owning a template at all. Use it when you need a clean bill today, without setting anything up.' },
        { type: 'p', text: 'The honest limitation is that any generator, template, or spreadsheet still needs you to type the charges. That is fine for the occasional bill. It stops being fine when you are producing dozens a day.' },
      ],
    },
    {
      h2: 'Small mistakes that make a bill look unprofessional',
      blocks: [
        { type: 'p', text: 'A few avoidable errors show up again and again on hand-made bills, and each one chips away at trust:' },
        { type: 'ul', items: [
          'No patient ID or date — makes the bill impossible to match to a record later.',
          'One lump sum instead of itemised lines — the fastest way to get an insurance query.',
          'GST applied to the whole bill, including exempt treatment — over-charges the patient and is simply wrong.',
          'Handwritten corrections over printed figures — reads as careless and can look like tampering.',
          'No running total or an arithmetic slip — the one mistake patients always notice.',
          'Missing hospital address or GSTIN when GST is charged — an incomplete tax invoice.',
        ] },
        { type: 'p', text: 'None of these are hard to avoid; they just need a consistent format and a moment of care. A generated bill removes most of them because the layout and the maths are done for you.' },
      ],
    },
    {
      h2: 'Keep a copy — bills are records, not just receipts',
      blocks: [
        { type: 'p', text: 'It is easy to think of a bill as something you hand over and forget, but for the hospital it is a record you may need long after the patient has gone home. Accounts reconciliation, GST returns, insurance queries that surface weeks later, and internal audits all reach back to the original bill. A bill you cannot find, or cannot read because it was a scribble on a duplicate pad, is a problem waiting to happen.' },
        { type: 'p', text: 'Two simple habits save a lot of grief. First, keep a copy of every bill — a saved PDF is ideal because it never fades, tears, or gets misfiled. Second, make each bill uniquely identifiable with a running bill number and a date, so any later query can be traced back to the exact transaction. The generator above helps with the first by letting you save each bill as a PDF straight from your browser; a numbering habit is yours to keep.' },
        { type: 'p', text: 'If a patient later disputes a charge, or an insurer asks for a re-submission, a clean saved copy turns a stressful hunt into a thirty-second retrieval. That reliability is part of what makes a billing process feel professional rather than improvised.' },
      ],
    },
    {
      h2: 'What insurers and TPAs look for on a bill',
      blocks: [
        { type: 'p', text: 'A large share of hospital bills end up in front of an insurance company or a third-party administrator (TPA), and a bill that is not built for that reader gets delayed or short-paid. Cashless and reimbursement claims both hinge on the bill being clear enough for an assessor who has never met the patient to understand exactly what was done and why it cost what it cost.' },
        { type: 'p', text: 'A claims-ready bill almost always has the same features:' },
        { type: 'ul', items: [
          'A clear patient identity and, for inpatients, the admission and discharge dates so the length of stay is obvious.',
          'Fully itemised charges — never a single lump sum — so each line can be matched to what the policy covers.',
          'Separated room rent, because most policies cap the room category and a room charge above the cap can proportionately reduce the whole claim.',
          'Pharmacy and consumables listed rather than merged into “miscellaneous”.',
          'Any advance paid, package deduction, or discount shown explicitly, so the net payable is unambiguous.',
        ] },
        { type: 'p', text: 'The room-rent point is worth stressing because it quietly costs patients money. Many policies say the room rent must stay within a percentage of the sum insured; if the patient takes a dearer room, the insurer can scale down every associated charge in the same proportion. A bill that separates the room clearly lets everyone see this coming instead of discovering it at settlement. If you also charge GST on a room above ₹5,000 a day, showing that line correctly keeps the tax invoice valid too.' },
      ],
    },
    {
      h2: 'When making bills by hand stops working',
      blocks: [
        { type: 'p', text: 'A free generator is the right tool for a clinic that issues a handful of bills a day. But as a hospital grows, the manual approach quietly becomes a bottleneck. The charges live in three or four places — the pharmacy sold medicines, the lab ran tests, the ward recorded daily room charges, the doctor added a procedure — and someone at the billing counter has to gather all of that by hand for every discharge. That is slow, and every re-typed number is a chance to under-bill or over-bill.' },
        { type: 'p', text: 'This is the problem a hospital management system solves. With [Uyirly](/hospital-management-software), the bill is never typed — it **builds itself as care happens**. When the pharmacy dispenses a medicine, the lab reports a test, or the ward posts a day’s room charge, that line lands on the patient’s bill automatically. By the time the patient reaches the counter, the bill is already complete, itemised, GST-correct, and ready to print. Insurance and package deductions are applied in the same flow.' },
        { type: 'p', text: 'So think of it as two stages. Use this free **hospital bill format generator** while your volume is low and you just need a clean bill in the browser. When typing bills becomes the job that eats your evenings, that is the signal to let the software build them for you instead.' },
      ],
    },
  ],

  // ────────────────────────────────────────────────────────────────────────
  'nurse-patient-ratio-calculator': [
    {
      h2: 'Why the nurse-to-patient ratio matters',
      blocks: [
        { type: 'p', text: 'The **nurse-to-patient ratio** is one of the most direct levers you have on both patient safety and staff wellbeing. When each nurse is responsible for too many patients, medications get delayed, warning signs get missed, and small problems become emergencies. When the ratio is right, care is safer and your nurses are far less likely to burn out and leave. Getting the number right is not just a compliance box — it is the difference between a ward that runs calmly and one that runs on adrenaline.' },
        { type: 'p', text: 'The calculator above turns this into a quick, practical answer. Tell it how many beds you have in each type of ward and it works out how many nurses you need per shift and across the full 24-hour day. It uses the widely accepted NABH-aligned ratios as a starting point, so the output is grounded in real Indian hospital standards rather than a guess.' },
      ],
    },
    {
      h2: 'What the standard ratios actually are',
      blocks: [
        { type: 'p', text: 'The right ratio depends entirely on how sick the patients are. A patient recovering in a general ward needs far less nursing time than a ventilated patient in intensive care. NABH (the National Accreditation Board for Hospitals) and common Indian practice give ratios roughly like these, expressed as one nurse to a number of patients:' },
        { type: 'ul', items: [
          '**General ward** — about 1:6. Stable patients, routine care.',
          '**Private / semi-private rooms** — about 1:4.',
          '**High-dependency unit (HDU)** — about 1:3. Closer monitoring than a ward.',
          '**Post-operative** — about 1:3, tighter in the first hours after surgery.',
          '**Paediatrics** — about 1:4, because children need more frequent attention.',
          '**ICU** — about 1:1 to 1:2, depending on how critical the patient is.',
          '**NICU** — about 1:2 for newborn intensive care.',
          '**Labour room** — about 1:3, rising to one-to-one during active delivery.',
        ] },
        { type: 'p', text: 'These are minimums for safe care, not targets to stay under. A busy admission day, a run of unstable patients, or a cluster of post-op cases can all justify richer staffing than the baseline. Treat the ratio as a floor.' },
      ],
    },
    {
      h2: 'Why per-shift is only half the answer',
      blocks: [
        { type: 'p', text: 'A common mistake is to calculate the nurses needed for one shift and stop there. A ward with 24 general-ward beds at 1:6 needs 4 nurses on the floor at any moment — but a hospital runs around the clock, so you actually need enough nurses to cover **three shifts every single day**. That is 12 nurse-shifts a day for that one ward, before anyone takes a day off.' },
        { type: 'p', text: 'And nobody works every day. Nurses have weekly offs, earned leave, sick days and training. To keep 4 nurses on the floor three times a day, you have to employ more than 12 people. This is where a **relief factor** comes in — a multiplier that accounts for time off so the roster does not collapse the first time someone falls ill.' },
        { type: 'p', text: 'The calculator does all three steps for you: it finds the per-shift number from the ratio, multiplies by three shifts for full-day cover, and then applies a relief factor to give the realistic number of nurses you need to actually employ for that ward. That final number is the one that matters for hiring and budgeting.' },
      ],
    },
    {
      h2: 'How the relief factor works',
      blocks: [
        { type: 'p', text: 'The **relief factor** (sometimes called the leave-replacement factor) is simply an allowance for the fact that a nurse cannot be on duty 365 days a year. Add up weekly offs, national holidays, earned leave, casual and sick leave, and training days, and a full-time nurse is typically available for roughly 70% of the year’s shifts. To cover the gap, you employ more people than the raw shift maths suggests.' },
        { type: 'p', text: 'A relief factor of around **1.4** is a common, sensible starting point — meaning you employ about 40% more nurses than the bare three-shift count. If your leave policy is generous, or absenteeism is high, the factor should be larger. The tool applies a reasonable default so the total it shows is a number you can actually roster against, not a theoretical minimum that breaks the moment reality intervenes.' },
      ],
    },
    {
      h2: 'Reading the result and turning it into a roster',
      blocks: [
        { type: 'p', text: 'For each ward you enter, the calculator shows three figures: nurses **per shift**, nurses to cover **three shifts a day**, and the **total to employ** once relief is added. Add the totals across all your wards and you have a defensible, ward-by-ward staffing plan — the kind of number you can take to management or use in an NABH staffing document.' },
        { type: 'p', text: 'From there, turning it into a working roster means a few more practical decisions: how you split day and night shifts, how you handle the evening handover overlap, whether senior nurses count in the ratio or sit above it, and how you cover sudden sickness. The calculator gives you the sound baseline; your local policy shapes the rest.' },
        { type: 'p', text: 'It is worth re-running the numbers whenever your bed mix changes — a new ICU, more private rooms, a busier maternity unit — because each ward type pulls the total in a different direction. A hospital that adds eight ICU beds needs far more nurses than one that adds eight general-ward beds, even though the bed count is the same.' },
      ],
    },
    {
      h2: 'Ratios, accreditation and the law',
      blocks: [
        { type: 'p', text: 'Nurse-to-patient ratios are not only a safety idea — they are increasingly something you have to demonstrate. Accreditation bodies like NABH expect a hospital to show that it has planned its nursing strength against the type and number of beds it runs, and that the plan is actually followed. Inspectors do not just count heads; they look for a rationale, which is exactly what a ward-by-ward calculation gives you.' },
        { type: 'p', text: 'There is also a growing legal and reputational dimension. Understaffing is one of the first things examined when something goes wrong on a ward, and a hospital that cannot show it staffed to a reasonable standard is on weak ground. On the other side, patients and families increasingly ask about nurse availability when choosing where to be treated, and word travels fast about wards where the call bell goes unanswered.' },
        { type: 'p', text: 'Treating the ratio as a documented, defensible plan — rather than whatever the roster happened to allow that month — protects the hospital as much as the patient. The calculator gives you that documentation in a form you can save, revisit, and show.' },
      ],
    },
    {
      h2: 'A worked example',
      blocks: [
        { type: 'p', text: 'Numbers land better with an example, so take a small hospital with three units: a 30-bed general ward, an 8-bed ICU, and a 6-bed maternity ward. Work each one separately, because the ratios are so different.' },
        { type: 'p', text: 'The **general ward** at 1:6 needs 5 nurses on the floor per shift. Across three shifts that is 15 nurse-shifts a day. Apply a 1.4 relief factor and you need to employ about 21 nurses for that ward alone.' },
        { type: 'p', text: 'The **ICU** at 1:1 needs 8 nurses per shift — one per bed. Three shifts make 24 nurse-shifts a day, and with relief that is roughly 34 nurses. Notice how eight critical-care beds demand far more staff than thirty general beds: the ratio, not the bed count, drives the number.' },
        { type: 'p', text: 'The **maternity ward** at 1:3 needs 2 nurses per shift, 6 a day, about 9 nurses with relief. Add the three together and this modest 44-bed hospital needs on the order of 64 nurses just for these units — a figure most people badly underestimate when they only picture “one shift”. That gap between intuition and the real number is exactly why the calculator is worth running before you budget or hire.' },
      ],
    },
    {
      h2: 'Skill mix and the night shift',
      blocks: [
        { type: 'p', text: 'A ratio counts nurses, but not all nurses are interchangeable, and the calculator gives you a baseline that your local judgement then shapes. Two factors matter most: **skill mix** and the **shift pattern**.' },
        { type: 'p', text: 'Skill mix is the balance of senior and junior staff. A ward of six patients covered by one very experienced nurse is safer than the same ward covered by one nurse in her first month. Good rosters make sure every shift has enough senior presence, and they often keep a charge nurse or supervisor slightly outside the counted ratio so there is someone to lead, escalate, and cover breaks. When you plan from the calculator’s number, decide whether your senior-in-charge sits inside or above the ratio.' },
        { type: 'p', text: 'The night shift deserves special thought. Patient numbers do not fall at night — the same admitted patients still need turning, medicines, and monitoring — but staffing is often quietly thinned because the ward “feels” calmer. That is when a single deterioration is most likely to be missed, because there are fewer eyes and slower escalation. A safe roster keeps nights close to the daytime ratio, not stripped back to a skeleton, and plans in advance how a lone night nurse gets help when two patients need her at once.' },
        { type: 'p', text: 'Finally, remember handovers. The overlap between shifts, where the outgoing and incoming nurses hand over each patient, is where errors and omissions creep in. Building a short, structured overlap into the roster — rather than a hard cut-off at shift change — is one of the cheapest safety improvements a ward can make.' },
      ],
    },
    {
      h2: 'From a staffing number to a working ward',
      blocks: [
        { type: 'p', text: 'Knowing how many nurses you need is the first step. Making sure the right number are actually on the floor, shift after shift, is the harder ongoing job — and that is where good software earns its keep. A staffing plan on paper does not stop a ward from being short-staffed on a Tuesday night; a live view of who is on duty against who should be does.' },
        { type: 'p', text: 'A hospital management system helps in two ways. First, it keeps an accurate, live count of admitted patients per ward, so you always know the real denominator in your ratio instead of guessing. Second, it ties nursing tasks — medication rounds, vitals, and nursing notes — to each patient, so a heavy ward is visible before it becomes unsafe. [Uyirly](/hospital-management-software) manages wards, beds and admissions in one place, giving you the real-time patient count that makes a ratio meaningful.' },
        { type: 'p', text: 'Use this calculator to set your baseline nurse strength for each ward. Then use your day-to-day systems to make sure that baseline actually holds — because the safest ratio in the world only helps if the nurse is really at the bedside.' },
      ],
    },
  ],

  // ────────────────────────────────────────────────────────────────────────
  'gst-on-hospital-bill-calculator': [
    {
      h2: 'Is there GST on hospital bills in India?',
      blocks: [
        { type: 'p', text: 'The short answer that surprises most patients: **most of a hospital bill has no GST at all**. Under India’s GST law, healthcare services provided by a clinical establishment — diagnosis, treatment, and care for illness or injury — are **exempt**. So your consultation, your admission, your surgery, and your nursing care generally carry zero GST. This is a deliberate policy choice to keep essential healthcare affordable.' },
        { type: 'p', text: 'But “most” is not “all”, and that is exactly where confusion — and billing errors — creep in. A few specific charges are taxable, and applying GST to the wrong lines (or to the whole bill) either over-charges the patient or lands the hospital in a compliance problem. The calculator above sorts the exempt part from the taxable part for you, so you can see the correct figure instead of guessing.' },
        { type: 'p', text: 'It helps to remember why the exemption exists in the first place. Healthcare is treated as an essential service, so taxing the core of it — the doctor’s time, the treatment, the recovery — would simply make being ill more expensive. The taxable exceptions are deliberately narrow and tend to sit at the “comfort” or “retail” edges of a hospital’s activity, such as a premium room or a walk-in medicine sale, rather than the treatment itself. Keeping that principle in mind makes the individual rules far easier to remember: if a charge is part of treating the patient’s illness, it is almost certainly exempt.' },
      ],
    },
    {
      h2: 'The room rent rule everyone asks about',
      blocks: [
        { type: 'p', text: 'The most important exception, and the one that generates the most questions, is **room rent**. Since 18 July 2022, GST applies to hospital room rent (other than ICU) where the charge is **more than ₹5,000 per day**. The rate is **5%, with no input tax credit** for the hospital. Rooms at ₹5,000 a day or below stay exempt.' },
        { type: 'h3', text: 'Two things people get wrong' },
        { type: 'ul', items: [
          '**ICU is always exempt.** Intensive care, critical care and similar units do not attract this GST, no matter how high the daily charge is.',
          '**Only the room rent is taxed — not the whole stay.** The 5% applies to the room charge itself, not to the treatment, medicines or investigations billed alongside it. Those follow their own rules.',
        ] },
        { type: 'p', text: 'So a patient in a ₹8,000-a-day deluxe room pays 5% GST on the ₹8,000 room charge for each day, while the surgery and the care in that same room remain exempt. The calculator applies this test automatically once you enter the room type and the daily charge.' },
      ],
    },
    {
      h2: 'What else on the bill can attract GST',
      blocks: [
        { type: 'p', text: 'Beyond room rent, a handful of items may carry GST depending on how they are supplied:' },
        { type: 'ul', items: [
          '**Pharmacy sales to outpatients or walk-ins** — medicines sold over the counter are goods and generally attract GST at the applicable rate (commonly 5% or 12%), unlike medicines administered as part of inpatient treatment, which are usually part of the exempt composite care.',
          '**Non-clinical services** — a cafeteria, a paid attendant bed, cosmetic procedures that are not medically necessary, and similar services can be taxable.',
          '**Consumables or devices sold separately** rather than as part of a treatment package may follow the goods rate.',
        ] },
        { type: 'p', text: 'The guiding idea is the concept of a **composite supply**: when medicines, room, and consumables are bundled into the treatment of an admitted patient, they usually take on the exempt status of the main healthcare service. When something is sold on its own, separate from treatment, it is judged on its own. This is a nuanced area, and a qualified tax advisor should confirm anything unusual.' },
      ],
    },
    {
      h2: 'How CGST and SGST split works',
      blocks: [
        { type: 'p', text: 'When GST does apply, it is not one line. For a supply within the same state — which almost all hospital billing is — the total rate splits equally into **CGST (central)** and **SGST (state)**. So 5% GST on room rent shows as 2.5% CGST plus 2.5% SGST. For the rare inter-state supply, it would be a single **IGST** line at the full rate instead.' },
        { type: 'p', text: 'A correct tax invoice shows the taxable value, the CGST and SGST amounts separately, and the total. The calculator gives you these figures directly, and our [hospital bill format generator](/tools/hospital-bill-format-generator) lays them out on a printable bill in the right places.' },
      ],
    },
    {
      h2: 'Why getting this right protects everyone',
      blocks: [
        { type: 'p', text: 'Mis-applying GST is not a harmless rounding issue. Charge GST on exempt treatment and you have overcharged a patient who is often already stressed about money — and if they notice, you have a dispute and a refund to process. Fail to charge GST on a taxable ₹9,000-a-day room across a ten-day stay and you have a shortfall the hospital may have to make good later, with interest.' },
        { type: 'p', text: 'The safest habit is to treat GST line by line, not bill by bill. Ask of each charge: is this exempt core healthcare, or is it one of the specific taxable items? A ₹4,900 room is exempt; a ₹5,100 room is taxable. An ICU bed is exempt at any price. A strip of tablets sold to a walk-in is taxable; the same drug given to an admitted patient during treatment usually is not. The calculator encodes these tests so you do not have to hold them all in your head.' },
      ],
    },
    {
      h2: 'Keeping your GST records straight',
      blocks: [
        { type: 'p', text: 'Charging GST correctly on the bill is only half the job; the other half is being able to account for it. Every rupee of GST you collect on taxable room rent or pharmacy sales has to be reported and paid in your GST returns, and the figures on your bills are the source of truth for those returns. If your bills are inconsistent — GST on a room one day, forgotten the next — reconciling the return becomes a monthly headache.' },
        { type: 'p', text: 'Good record-keeping here means a few things: a valid tax invoice for every taxable supply, with your GSTIN, the taxable value, and the CGST/SGST split shown; a clean separation between exempt and taxable turnover, because you report both; and a saved copy of each bill so the numbers can be traced during filing or an audit. Mixing exempt healthcare and taxable supplies without separating them is one of the most common ways hospitals end up with returns that do not tie out.' },
        { type: 'p', text: 'The more of your billing that follows a consistent rule, the less painful this becomes. When every bill decides GST the same correct way, the monthly return is a summary rather than an investigation.' },
      ],
    },
    {
      h2: 'A worked example: a five-day admission',
      blocks: [
        { type: 'p', text: 'Imagine a patient admitted for five days in a deluxe room charged at ₹6,000 per day, with ₹80,000 of surgery and treatment and ₹12,000 of medicines and consumables given during the stay. How much GST is there?' },
        { type: 'p', text: 'The room is non-ICU and above ₹5,000 a day, so it is taxable at 5%. Five days at ₹6,000 is ₹30,000 of room rent, and 5% of that is **₹1,500 of GST** (₹750 CGST + ₹750 SGST). The ₹80,000 of surgery and treatment is exempt core healthcare — no GST. The ₹12,000 of medicines and consumables, supplied as part of this inpatient’s treatment, is part of the exempt composite supply — no GST. So on a bill of over ₹1.2 lakh, the total GST is just ₹1,500, all of it on the room.' },
        { type: 'p', text: 'Now change one thing: put the same patient in the ICU at ₹6,000 a day. The room is now exempt, and the GST on the whole bill drops to **zero**. That single switch — non-ICU versus ICU — is the most common reason two similar-looking bills carry different tax, and it is exactly the test the calculator applies for you.' },
      ],
    },
    {
      h2: 'Why hospitals cannot claim the tax back',
      blocks: [
        { type: 'p', text: 'There is a detail in the room-rent rule that catches finance teams out: the 5% GST on room rent comes **with no input tax credit (ITC)**. Normally, a business that charges GST on its sales can offset the GST it paid on its own purchases. Here, that offset is switched off.' },
        { type: 'p', text: 'The practical effect is that the 5% is a genuine extra cost passed to the patient, and the hospital cannot recover the GST buried in its own bills — the equipment, supplies, and services it buys — against this particular output. Because most of a hospital’s output is exempt in the first place, its ability to use input credit is already limited; the no-ITC room-rent rule tightens that further. It is worth having your accountant confirm how this interacts with your overall input credit position, because it changes the true cost of offering premium rooms.' },
      ],
    },
    {
      h2: 'Cases that come up again and again',
      blocks: [
        { type: 'p', text: 'A few situations generate the same questions at billing counters everywhere:' },
        { type: 'ul', items: [
          '**A ₹5,000 room** — exempt. The rule is “more than ₹5,000”, so exactly ₹5,000 a day is not taxed. A ₹5,001 room is.',
          '**A package or bundled surgery rate** — the treatment portion is exempt; if a taxable room is billed separately within the package, only that room portion is taxed.',
          '**Medicines taken home at discharge** — sold as goods across the pharmacy counter, these generally attract GST, unlike the medicines given during the admission.',
          '**An outpatient (OPD) consultation** — exempt healthcare; no GST, no matter the fee.',
          '**Ambulance services** — generally exempt.',
          '**A cosmetic or aesthetic procedure that is not medically necessary** — typically taxable, because it falls outside “treatment of illness or injury”.',
        ] },
        { type: 'p', text: 'When a case genuinely does not fit these patterns, do not guess on the bill — confirm it with a qualified tax advisor. GST on healthcare has real nuance, and this article and calculator are a practical guide, not formal tax advice.' },
      ],
    },
    {
      h2: 'Doing this automatically on every bill',
      blocks: [
        { type: 'p', text: 'Working out GST by hand for one bill is easy enough with a calculator. Doing it correctly on every bill, every day, across dozens of room types and hundreds of pharmacy lines, is where hospitals slip — usually by defaulting to a single rate because it is faster, or by leaving GST off because it is confusing.' },
        { type: 'p', text: 'A hospital management system removes that risk by deciding it per item, automatically. In [Uyirly](/hospital-management-software), each service and product carries its own tax treatment, so an ICU bed bills as exempt, a ₹6,000 deluxe room bills 5% GST on the room charge, and a retail pharmacy sale bills at its own rate — all on the same patient’s bill, with the CGST/SGST split calculated for you. The billing staff never has to remember the rule; the system already knows it.' },
        { type: 'p', text: 'Use this calculator to check a specific bill or to settle an argument about whether a room is taxable. When you want that judgement made correctly on every bill without anyone thinking about it, that is what the software is for.' },
      ],
    },
  ],

  // ────────────────────────────────────────────────────────────────────────
  'schedule-h-h1-x-drug-lookup': [
    {
      h2: 'What Schedule H, H1 and X actually mean',
      blocks: [
        { type: 'p', text: 'India’s Drugs and Cosmetics Rules sort medicines into schedules, and three of them decide how a pharmacy is allowed to sell a drug: **Schedule H, Schedule H1, and Schedule X**. Knowing which schedule a medicine belongs to is not academic — it decides whether you can sell it at all without a prescription, what you must write down, and how long you must keep the record. Get it wrong and you risk your licence.' },
        { type: 'p', text: 'The lookup above lets you search any medicine by brand or generic name and see its schedule, along with the practical rule for dispensing it. Below is the plain-English version of what each schedule means, so the result actually makes sense when you see it.' },
        { type: 'h3', text: 'Schedule H' },
        { type: 'p', text: 'The largest group. **Schedule H drugs need a valid doctor’s prescription** to be sold, and the sale is recorded in the pharmacy’s prescription register. Most antibiotics, blood-pressure and diabetes medicines, and prescription painkillers sit here. The label carries the “Rx” symbol and the warning that it is to be sold on the prescription of a registered medical practitioner only.' },
        { type: 'h3', text: 'Schedule H1' },
        { type: 'p', text: '**Schedule H1 is a stricter sub-group** created to fight antimicrobial resistance and misuse. It covers certain third- and fourth-line antibiotics, several anti-TB drugs, and some habit-forming medicines. On top of needing a prescription, every H1 sale must be entered in a **separate, dedicated H1 register** — the drug, the quantity, the patient, and the prescriber — and that register must be kept for **three years**.' },
        { type: 'h3', text: 'Schedule X' },
        { type: 'p', text: '**Schedule X is the most tightly controlled** — narcotic and psychotropic drugs with a high potential for abuse. Selling them needs a special licence, the prescription must be in duplicate and is not repeatable, one copy is retained by the pharmacy, and the stock and records are subject to strict storage and inspection rules.' },
      ],
    },
    {
      h2: 'The difference between Schedule H and H1',
      blocks: [
        { type: 'p', text: 'This is the question pharmacists ask most, because the two look similar on the shelf. Both need a prescription. The difference is the **record-keeping duty**. A Schedule H drug is recorded in the ordinary prescription register. A Schedule H1 drug must additionally be logged in a **special H1 register** set aside only for these medicines.' },
        { type: 'p', text: 'H1 exists for a reason. The drugs on the list — certain broad-spectrum antibiotics, anti-TB medicines, and habit-forming sedatives — are the ones where casual over-the-counter selling does real public harm, whether by breeding resistant infections or by feeding dependence. The extra register makes each sale traceable, which discourages the walk-in “give me a strong antibiotic” sale that a busy counter might otherwise wave through.' },
        { type: 'p', text: 'In day-to-day terms: if the lookup shows a drug as **H1**, do not sell it without a prescription, and make sure it goes into the H1 register, not just the normal one. If it shows **H**, a prescription and the usual register entry are enough.' },
      ],
    },
    {
      h2: 'What a Schedule H1 register must contain',
      blocks: [
        { type: 'p', text: 'The H1 register is not a formality; it is the thing a drug inspector will ask to see. For each supply of a Schedule H1 drug, it should record:' },
        { type: 'ul', items: [
          'The date of supply.',
          'The name and address of the patient.',
          'The name and address of the prescriber.',
          'The name of the drug and the quantity supplied.',
        ] },
        { type: 'p', text: 'The register — bound and serially numbered, or a compliant digital equivalent — must be **retained for three years** and be available for inspection. The common failures are simple: selling an H1 drug on a verbal request with no prescription, or dispensing it and forgetting the register entry in the rush of a busy day. Both are the kind of lapse that turns a routine inspection into a problem.' },
        { type: 'p', text: 'A pharmacy that dispenses these drugs regularly is far safer capturing the register fields at the point of sale, every time, rather than trying to reconstruct them later from memory.' },
      ],
    },
    {
      h2: 'Why brand names make this harder',
      blocks: [
        { type: 'p', text: 'India is the world capital of branded generics. A single molecule can be sold under dozens of brand names, and the person at the counter almost always asks for the **brand** — “Augmentin”, “Azithral”, “Alprax” — not the generic. But the schedule attaches to the molecule, not the brand. So to apply the rule correctly, you have to know that Alprax is alprazolam, that alprazolam is Schedule H1, and therefore that this sale needs a prescription and an H1 register entry.' },
        { type: 'p', text: 'That mental translation, done hundreds of times a day, is exactly where mistakes happen. This is why the lookup above lets you search by **brand name directly**: type the brand the customer actually said, and it maps back to the molecule and shows the schedule. It is built from a large catalogue of Indian medicines, so common brands resolve to the right generic and the right rule without you having to remember the mapping.' },
        { type: 'p', text: 'A word of caution: this tool is a **quick reference, not the legal source**. The Schedule H1 list in particular is updated from time to time as drugs are added. Always confirm a drug’s current schedule against the official Drugs and Cosmetics Rules before you dispense — treat the lookup as a fast first check, not the final word.' },
      ],
    },
    {
      h2: 'Common mistakes pharmacies make with scheduled drugs',
      blocks: [
        { type: 'p', text: 'Most schedule-related trouble comes from a small set of avoidable errors:' },
        { type: 'ul', items: [
          '**Selling an antibiotic without a prescription** because the customer insists — many are Schedule H, and some are H1, and neither may be sold over the counter.',
          '**Missing the H1 register entry** after correctly asking for the prescription — the sale is legal but the record is not.',
          '**Treating an H1 drug as ordinary H** and logging it only in the general register.',
          '**Dispensing a Schedule X drug on a repeat or a single-copy prescription** when it must be in duplicate and cannot be repeated.',
          '**Assuming a familiar brand is harmless** without checking the molecule’s schedule.',
        ] },
        { type: 'p', text: 'Each of these is easy to prevent with a habit: check the schedule before you sell, and capture the record at the moment of sale. The cost of the habit is seconds; the cost of skipping it can be your licence.' },
      ],
    },
    {
      h2: 'The real cost of getting it wrong',
      blocks: [
        { type: 'p', text: 'It is tempting to treat schedule rules as red tape, but the consequences of ignoring them are concrete. On the regulatory side, dispensing a Schedule H or H1 drug without a valid prescription, or failing to keep the required records, can lead to a warning, a suspension, or cancellation of the pharmacy licence — the licence the whole business depends on. Schedule X breaches are treated even more seriously.' },
        { type: 'p', text: 'The harm is not only legal. Handing out antibiotics on demand is a direct driver of antimicrobial resistance, which is why the H1 category exists at all — every casual sale makes the next infection a little harder to treat. Selling habit-forming or psychotropic drugs loosely feeds dependence and diversion. These are the public-health reasons the schedules were written, and a pharmacy that respects them is protecting its community as well as its licence.' },
        { type: 'p', text: 'Set against all that, the effort of checking a schedule and making a register entry is tiny. The lookup makes the check instant; the discipline of doing it every time is what keeps you safe.' },
      ],
    },
    {
      h2: 'Schedule G, OTC and the rest',
      blocks: [
        { type: 'p', text: 'H, H1 and X get the attention, but two other labels turn up often in the lookup and are worth understanding. **Schedule G** covers a set of drugs — including many corticosteroids, some hormones, and insulins — that must carry the caution: “It is dangerous to take this preparation except under medical supervision.” They are not narcotics, but they are not casual over-the-counter buys either; they are meant to be used under a doctor’s guidance.' },
        { type: 'p', text: 'Then there is **OTC** — over-the-counter. Strictly, India does not have a formal “OTC schedule”; the term is used for medicines that do not fall under any prescription schedule and can be sold without a prescription. Common painkillers like paracetamol, most antacids, oral rehydration salts, many antihistamines and simple topical creams sit here. When the lookup marks a drug OTC, it means no prescription is required — though you still sell it per the label and use good judgement.' },
        { type: 'p', text: 'You may also see results marked **“Unlisted”**. That simply means the catalogue does not yet carry a confirmed schedule for that specific molecule — it is not a statement that the drug is unscheduled. For anything unlisted, check the official schedule directly before you dispense.' },
      ],
    },
    {
      h2: 'A simple workflow for the counter',
      blocks: [
        { type: 'p', text: 'All of this becomes manageable if you turn it into a fixed habit rather than a decision you make afresh each time. A reliable counter workflow looks like this:' },
        { type: 'ul', items: [
          'When a customer names a brand, check the molecule and its schedule — search the brand directly rather than trying to recall the mapping.',
          'If it is **H or H1**, ask for and verify the prescription before you dispense. No prescription, no sale.',
          'If it is **H1**, make the H1 register entry then and there — patient, prescriber, drug, quantity, date.',
          'If it is **X**, confirm the duplicate, non-repeatable prescription and your special-licence records before supplying.',
          'If it is **G**, ensure the caution label is present and treat it as a supervised medicine.',
          'If it is **OTC**, sell per the label.',
        ] },
        { type: 'p', text: 'Done consistently, this takes only a few seconds per sale and keeps you on the right side of both the law and good practice. The failures that get pharmacies into trouble are almost never a lack of knowledge — they are a busy moment where the check or the register entry got skipped. A fixed workflow is what stops that.' },
      ],
    },
    {
      h2: 'Building compliance into the counter',
      blocks: [
        { type: 'p', text: 'A lookup tool tells you the rule. The harder part is following it every single time, at a busy counter, without slowing the queue to a crawl. That is where a pharmacy system that knows each drug’s schedule changes the game.' },
        { type: 'p', text: 'In [Uyirly](/hospital-management-software), every medicine in the catalogue carries its schedule, so the software knows when a sale is Schedule H1 or X. When a pharmacist dispenses an H1 drug, the system prompts for the register fields — patient, prescriber, drug, quantity — and stores them automatically, building your H1 register as a by-product of normal dispensing rather than a separate chore. Nothing gets forgotten in the rush, and the three-year record is always there if an inspector asks.' },
        { type: 'p', text: 'For a deeper walk-through of the rules and how to stay compliant, read our guide on [Schedule H, H1 and X compliance](/guides/drug-schedule-h-h1-x-pharmacy-compliance). Use the lookup above whenever you need a quick answer on a specific drug — and let your pharmacy system make sure the rule is actually followed every time you sell.' },
      ],
    },
  ],
}
