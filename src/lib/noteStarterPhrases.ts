import type { NoteFieldKey } from '@/lib/noteFields'

/**
 * A floor for a new hospital's phrase library.
 *
 * An empty library never fills: a doctor with a patient waiting will type the
 * sentence rather than stop and invent a template, and six months later the
 * picker still has nothing in it. So a hospital starts with something.
 *
 * Three rules this set is written to.
 *
 * It is short. The first draft of this plan said twenty phrases a field; that
 * is wrong. A list you scroll is slower than typing, so each box gets four to
 * seven — the ones a general OPD writes most — and the rest of the library
 * comes from the hospital's own words.
 *
 * It is normal findings and common presentations, nothing that asserts
 * anything unusual. A phrase that is almost right is more dangerous than no
 * phrase, because it gets tapped and left.
 *
 * And `___` is left where a number or a name belongs, so a half-true sentence
 * cannot be saved by accident — the doctor has to fill the gap or delete it.
 *
 * Nothing here is inserted automatically. A doctor adds the set deliberately
 * from Settings -> Note Phrases, and every phrase can be edited or removed
 * afterwards. This is clinical text that ends up in a signed record, so it is
 * the hospital's to accept, not ours to install.
 */
export const STARTER_PHRASES: Partial<Record<NoteFieldKey, { label: string; body: string }[]>> = {
  'consult.complaint': [
    { label: 'Fever',            body: 'Fever for ___ days.' },
    { label: 'Cough and cold',   body: 'Cough and cold for ___ days.' },
    { label: 'Pain abdomen',     body: 'Pain abdomen for ___ days.' },
    { label: 'Loose stools',     body: 'Loose stools for ___ days.' },
    { label: 'Routine follow-up', body: 'Follow-up for diabetes and hypertension.' },
    { label: 'Review with reports', body: 'Review with investigation reports.' },
  ],
  'consult.diagnosis': [
    { label: 'Acute febrile illness', body: 'Acute febrile illness.' },
    { label: 'URTI',             body: 'Upper respiratory tract infection.' },
    { label: 'Acute gastroenteritis', body: 'Acute gastroenteritis.' },
    { label: 'Acute gastritis',  body: 'Acute gastritis.' },
    { label: 'Type 2 diabetes',  body: 'Type 2 diabetes mellitus.' },
    { label: 'Hypertension',     body: 'Essential hypertension.' },
    { label: 'Diabetes with HTN', body: 'Type 2 diabetes mellitus with essential hypertension.' },
  ],
  'consult.notes': [
    { label: 'Continue same',    body: 'Continue current medication. Review after ___ weeks.' },
    { label: 'Rest and fluids',  body: 'Advised rest and plenty of oral fluids.' },
    { label: 'Reports pending',  body: 'Investigations sent. Review with reports.' },
    { label: 'Diet advice',      body: 'Diet and lifestyle advice explained to the patient.' },
    { label: 'Red flags',        body: 'Advised to return earlier if symptoms worsen.' },
  ],

  'exam.general': [
    { label: 'Stable',           body: 'Conscious, oriented, afebrile. No pallor, icterus, cyanosis, clubbing or oedema.' },
    { label: 'Well built',       body: 'Moderately built and nourished. Vitals stable.' },
    { label: 'Pallor present',   body: 'Pallor present. No icterus or cyanosis.' },
    { label: 'Febrile',          body: 'Febrile and ill-looking. Hydration adequate.' },
    { label: 'Dehydrated',       body: 'Mild dehydration — dry tongue, reduced skin turgor.' },
  ],
  'exam.cvs': [
    { label: 'Normal CVS',       body: 'S1 S2 heard, no murmur.' },
    { label: 'Tachycardia',      body: 'Tachycardia present. S1 S2 heard, no murmur.' },
    { label: 'Murmur',           body: 'Systolic murmur heard at the apex.' },
    { label: 'Raised JVP',       body: 'JVP raised. S1 S2 heard.' },
  ],
  'exam.rs': [
    { label: 'Normal chest',     body: 'B/L air entry equal, no added sounds.' },
    { label: 'Crepitations',     body: 'Bilateral basal crepitations present.' },
    { label: 'Rhonchi',          body: 'Bilateral rhonchi present. Air entry equal.' },
    { label: 'Reduced air entry', body: 'Reduced air entry on the ___ side.' },
  ],
  'exam.pa': [
    { label: 'Normal abdomen',   body: 'Soft, non-tender. No organomegaly. Bowel sounds present.' },
    { label: 'RIF tenderness',   body: 'Tenderness in the right iliac fossa. No guarding or rigidity.' },
    { label: 'Epigastric tenderness', body: 'Epigastric tenderness present. No guarding.' },
    { label: 'Distended',        body: 'Distended and tympanic. Bowel sounds sluggish.' },
    { label: 'Hepatomegaly',     body: 'Liver palpable ___ cm below the costal margin. Spleen not palpable.' },
  ],
  'exam.cns': [
    { label: 'Normal CNS',       body: 'Conscious, oriented. No focal neurological deficit.' },
    { label: 'GCS 15',           body: 'GCS 15/15. Pupils equal and reacting to light.' },
    { label: 'Reflexes normal',  body: 'Deep tendon reflexes normal. Plantars flexor.' },
    { label: 'Weakness',         body: 'Power ___/5 in the ___ upper and lower limbs.' },
  ],

  'hx.past_medical': [
    { label: 'Nil significant',  body: 'No significant past medical history.' },
    { label: 'Diabetic',         body: 'Known diabetic, on oral hypoglycaemic agents.' },
    { label: 'Hypertensive',     body: 'Known hypertensive, on regular treatment.' },
    { label: 'Diabetic + HTN',   body: 'Known diabetic and hypertensive, on regular treatment.' },
    { label: 'Asthma',           body: 'Bronchial asthma, on inhalers.' },
    { label: 'Hypothyroid',      body: 'Known hypothyroid, on thyroxine.' },
  ],
  'hx.past_surgical': [
    { label: 'No surgery',       body: 'No previous surgery.' },
    { label: 'Appendicectomy',   body: 'Appendicectomy in ___.' },
    { label: 'LSCS',             body: 'Lower segment caesarean section in ___.' },
    { label: 'Cataract surgery', body: 'Cataract surgery, ___ eye.' },
  ],
  'hx.drug_history': [
    { label: 'No regular drugs', body: 'Not on any regular medication.' },
    { label: 'Antihypertensives', body: 'On regular antihypertensive medication.' },
    { label: 'OHA',              body: 'On oral hypoglycaemic agents.' },
    { label: 'Insulin',          body: 'On insulin, ___ units ___.' },
    { label: 'Thyroxine',        body: 'On thyroxine ___ mcg daily.' },
  ],
  'hx.family_history': [
    { label: 'Nil significant',  body: 'No significant family history.' },
    { label: 'Diabetes',         body: 'Diabetes in the family.' },
    { label: 'Hypertension',     body: 'Hypertension in the family.' },
    { label: 'Diabetes + HTN',   body: 'Diabetes and hypertension in the family.' },
    { label: 'Cardiac',          body: 'Ischaemic heart disease in a first-degree relative.' },
  ],
  'hx.social_history': [
    { label: 'No addictions',    body: 'Non-smoker, non-alcoholic.' },
    { label: 'Smoker',           body: 'Smoker — ___ per day. Non-alcoholic.' },
    { label: 'Alcohol',          body: 'Occasional alcohol intake. Non-smoker.' },
    { label: 'Tobacco chewing',  body: 'Tobacco chewing. No other addictions.' },
    { label: 'Homemaker',        body: 'Homemaker. No addictions.' },
    { label: 'Manual work',      body: 'Daily wage labourer. No addictions.' },
  ],

  'nursing.situation': [
    { label: 'Stable handover',  body: 'Shift handed over. Patient stable, no fresh complaints.' },
    { label: 'Post-op',          body: 'Post-operative day ___. Pain under control.' },
    { label: 'New complaint',    body: 'Patient complained of ___ during this shift. Doctor informed.' },
  ],
  'nursing.background': [
    { label: 'Admission reason', body: 'Admitted on ___ with ___.' },
    { label: 'Known comorbidity', body: 'Known diabetic and hypertensive, on regular treatment.' },
    { label: 'Allergy noted',    body: 'Known allergy to ___ — documented and flagged.' },
  ],
  'nursing.assessment': [
    { label: 'Vitals stable',    body: 'Vitals stable. Afebrile. Intake and output adequate.' },
    { label: 'Febrile',          body: 'Febrile this shift — highest ___ °F. Tepid sponging given.' },
    { label: 'IV line',          body: 'IV line patent, site healthy. No infiltration.' },
  ],
  'nursing.recommendation': [
    { label: 'Continue',         body: 'Continue current treatment. Monitor vitals 4th hourly.' },
    { label: 'Watch',            body: 'Watch for ___ and inform the doctor if it occurs.' },
    { label: 'Due investigation', body: '___ is due in the next shift.' },
  ],
}

/** How many phrases the starter set would add in total. */
export const STARTER_COUNT = Object.values(STARTER_PHRASES)
  .reduce((n, list) => n + (list?.length ?? 0), 0)
