// Shared drug catalogue — the single source of truth for the public
// Schedule-lookup tool AND the app's drug_master table (synced by
// scripts/sync-drug-master). Each drug carries its generic (scientific) name,
// common Indian brand names (people usually search by brand), and its schedule.
//
// Schedules follow the published Drugs and Cosmetics Rules:
//   H1 = the specific H1 list (certain cephalosporins, fluoroquinolones,
//        carbapenems, anti-TB drugs, and habit-forming drugs)
//   X  = narcotic / psychotropic requiring a special licence
//   G  = "to be taken under medical supervision" (corticosteroids, insulins, etc.)
//   H  = other prescription-only drugs
//   OTC = no prescription required
// This is a curated reference, not the full official list — always verify.

export type Schedule = 'H' | 'H1' | 'X' | 'G' | 'OTC'

export interface CatalogueDrug {
  generic: string
  brands: string[]
  schedule: Schedule
}

export const RULES: Record<Schedule, { label: string; color: string; bg: string; rule: string }> = {
  H1:  { label: 'Schedule H1', color: '#DC2626', bg: '#FEF2F2', rule: 'Prescription required + separate register. Record every supply in a dedicated H1 register (date, patient, prescriber, drug, quantity) and keep it three years.' },
  X:   { label: 'Schedule X',  color: '#7C3AED', bg: '#F3E8FF', rule: 'Special licence required. Prescription in duplicate, not repeatable; strict storage and records. Narcotic / psychotropic.' },
  G:   { label: 'Schedule G',  color: '#2563EB', bg: '#DBEAFE', rule: 'Carries the caution “to be taken under medical supervision.” Supplied under medical supervision.' },
  H:   { label: 'Schedule H',  color: '#B45309', bg: '#FEF9C3', rule: 'Prescription required. Sold only against a registered practitioner’s prescription; record in the prescription register.' },
  OTC: { label: 'OTC',         color: '#16A34A', bg: '#DCFCE7', rule: 'Over-the-counter — no prescription required. Sell per label directions.' },
}

// Compact rows: [generic, brands, schedule]
type Row = [string, string[], Schedule]

const ROWS: Row[] = [
  // ── Schedule H1 — cephalosporins ──
  ['Cefixime', ['Taxim-O', 'Zifi', 'Mahacef'], 'H1'],
  ['Cefpodoxime', ['Cepodem', 'Doxcef', 'Podocef'], 'H1'],
  ['Cefotaxime', ['Taxim', 'Omnatax'], 'H1'],
  ['Ceftriaxone', ['Monocef', 'Oframax', 'Rocephin'], 'H1'],
  ['Cefepime', ['Kefage', 'Cepime'], 'H1'],
  ['Ceftazidime', ['Fortum', 'Ceftaz'], 'H1'],
  ['Cefoperazone + Sulbactam', ['Magnex', 'Sulbacin'], 'H1'],
  ['Cefdinir', ['Adcef', 'Kefnir'], 'H1'],
  ['Cefditoren', ['Meiact'], 'H1'],
  // ── Schedule H1 — fluoroquinolones ──
  ['Levofloxacin', ['Levoflox', 'Glevo', 'Levotas'], 'H1'],
  ['Moxifloxacin', ['Moxikind', 'MFX', 'Vigamox'], 'H1'],
  ['Sparfloxacin', ['Spardac'], 'H1'],
  ['Gemifloxacin', ['Gemfast'], 'H1'],
  ['Prulifloxacin', ['Prufloxsafe'], 'H1'],
  // ── Schedule H1 — carbapenems / others ──
  ['Meropenem', ['Meronem', 'Merocrit'], 'H1'],
  ['Imipenem + Cilastatin', ['Cilanem', 'Zienam'], 'H1'],
  ['Ertapenem', ['Invanz'], 'H1'],
  ['Faropenem', ['Farobact', 'Orpen'], 'H1'],
  ['Amikacin', ['Mikacin', 'Amicin'], 'H1'],
  // ── Schedule H1 — anti-TB ──
  ['Isoniazid', ['Isokin'], 'H1'],
  ['Rifampicin', ['Rcin', 'Rifagen'], 'H1'],
  ['Ethambutol', ['Combutol'], 'H1'],
  ['Pyrazinamide', ['Pyzina'], 'H1'],
  ['Rifabutin', ['Mycobutin'], 'H1'],
  ['Cycloserine', ['Coxerin'], 'H1'],
  // ── Schedule H1 — habit-forming ──
  ['Alprazolam', ['Alprax', 'Restyl', 'Trika'], 'H1'],
  ['Diazepam', ['Valium', 'Calmpose'], 'H1'],
  ['Nitrazepam', ['Nitravet'], 'H1'],
  ['Chlordiazepoxide', ['Librium'], 'H1'],
  ['Zolpidem', ['Zolfresh', 'Nitrest'], 'H1'],
  ['Tramadol', ['Ultracet', 'Tramazac', 'Domadol'], 'H1'],
  ['Codeine', ['Codistar', 'Grilinctus-CD'], 'H1'],
  ['Buprenorphine', ['Tidigesic', 'Norphin'], 'H1'],
  ['Pentazocine', ['Fortwin'], 'H1'],
  ['Diphenoxylate + Atropine', ['Lomotil'], 'H1'],

  // ── Schedule X — narcotic / psychotropic ──
  ['Methylphenidate', ['Inspiral', 'Addwize'], 'X'],
  ['Amphetamine', [], 'X'],
  ['Dexamphetamine', [], 'X'],
  ['Methamphetamine', [], 'X'],
  ['Amobarbital', [], 'X'],
  ['Pentobarbital', [], 'X'],
  ['Secobarbital', [], 'X'],
  ['Phenobarbital', ['Gardenal'], 'X'],
  ['Glutethimide', [], 'X'],
  ['Ketamine', ['Ketamax', 'Aneket'], 'X'],

  // ── Schedule G — under medical supervision ──
  ['Prednisolone', ['Wysolone', 'Omnacortil'], 'G'],
  ['Methylprednisolone', ['Medrol', 'Solu-Medrol'], 'G'],
  ['Dexamethasone', ['Decdan', 'Dexona'], 'G'],
  ['Betamethasone', ['Betnesol', 'Betnelan'], 'G'],
  ['Hydrocortisone', ['Efcorlin', 'Lycortin'], 'G'],
  ['Deflazacort', ['Defcort', 'Zenflam'], 'G'],
  ['Insulin Regular (Human)', ['Actrapid', 'Huminsulin R'], 'G'],
  ['Insulin Isophane (NPH)', ['Insulatard', 'Huminsulin N'], 'G'],
  ['Insulin Glargine', ['Lantus', 'Basalog'], 'G'],
  ['Insulin Aspart', ['NovoRapid'], 'G'],
  ['Estradiol', ['Progynova'], 'G'],
  ['Testosterone', ['Sustanon', 'Cernos'], 'G'],

  // ── Schedule H — antibiotics ──
  ['Amoxicillin', ['Mox', 'Novamox'], 'H'],
  ['Amoxicillin + Clavulanic Acid', ['Augmentin', 'Clavam', 'Moxikind-CV'], 'H'],
  ['Ampicillin', ['Roscillin'], 'H'],
  ['Azithromycin', ['Azithral', 'Zithromax', 'Azee'], 'H'],
  ['Clarithromycin', ['Claribid', 'Synclar'], 'H'],
  ['Erythromycin', ['Erythrocin', 'Althrocin'], 'H'],
  ['Ciprofloxacin', ['Ciplox', 'Cifran'], 'H'],
  ['Ofloxacin', ['Oflox', 'Zanocin'], 'H'],
  ['Norfloxacin', ['Norflox'], 'H'],
  ['Doxycycline', ['Doxt', 'Doxy-1'], 'H'],
  ['Metronidazole', ['Flagyl', 'Metrogyl'], 'H'],
  ['Tinidazole', ['Tiniba', 'Fasigyn'], 'H'],
  ['Ornidazole', ['Ornof', 'Dazolic'], 'H'],
  ['Cefuroxime', ['Ceftum', 'Supacef'], 'H'],
  ['Cephalexin', ['Sporidex', 'Phexin'], 'H'],
  ['Cefadroxil', ['Cefadur', 'Droxyl'], 'H'],
  ['Clindamycin', ['Dalacin-C', 'Clincin'], 'H'],
  ['Cotrimoxazole', ['Septran', 'Bactrim'], 'H'],
  ['Nitrofurantoin', ['Niftran', 'Martifur'], 'H'],
  ['Gentamicin', ['Genticyn'], 'H'],
  ['Fluconazole', ['Forcan', 'Zocon'], 'H'],
  ['Itraconazole', ['Itaspor', 'Canditral'], 'H'],
  ['Acyclovir', ['Acivir', 'Zovirax'], 'H'],
  ['Valacyclovir', ['Valcivir'], 'H'],
  ['Albendazole', ['Zentel', 'Bandy'], 'OTC'],
  ['Ivermectin', ['Ivermectol'], 'H'],
  ['Artemether + Lumefantrine', ['Lumether', 'Coartem'], 'H'],
  ['Hydroxychloroquine', ['HCQS', 'Zy-Q'], 'H'],

  // ── Schedule H — cardiovascular ──
  ['Amlodipine', ['Amlong', 'Amlopres', 'Stamlo'], 'H'],
  ['Cilnidipine', ['Cilacar', 'Nexovas'], 'H'],
  ['Telmisartan', ['Telma', 'Telsartan'], 'H'],
  ['Losartan', ['Losar', 'Repace'], 'H'],
  ['Olmesartan', ['Olmesar', 'Olmy'], 'H'],
  ['Ramipril', ['Cardace', 'Ramistar'], 'H'],
  ['Enalapril', ['Envas', 'Enam'], 'H'],
  ['Atenolol', ['Aten', 'Tenormin'], 'H'],
  ['Metoprolol', ['Metolar', 'Betaloc'], 'H'],
  ['Bisoprolol', ['Concor', 'Bisoheart'], 'H'],
  ['Nebivolol', ['Nebicard', 'Nebilong'], 'H'],
  ['Atorvastatin', ['Atorva', 'Storvas', 'Lipitor'], 'H'],
  ['Rosuvastatin', ['Rosuvas', 'Crestor'], 'H'],
  ['Clopidogrel', ['Clopilet', 'Deplatt', 'Plavix'], 'H'],
  ['Aspirin (75 mg)', ['Ecosprin'], 'H'],
  ['Warfarin', ['Warf', 'Uniwarfin'], 'H'],
  ['Rivaroxaban', ['Xarelto'], 'H'],
  ['Apixaban', ['Eliquis'], 'H'],
  ['Enoxaparin', ['Clexane'], 'H'],
  ['Digoxin', ['Digoxin', 'Lanoxin'], 'H'],
  ['Amiodarone', ['Cordarone', 'Tachyra'], 'H'],
  ['Isosorbide Mononitrate', ['Monotrate', 'Ismo'], 'H'],
  ['Nitroglycerin', ['Nitrocontin', 'Angispan'], 'H'],
  ['Furosemide', ['Lasix'], 'H'],
  ['Torsemide', ['Dytor'], 'H'],
  ['Spironolactone', ['Aldactone'], 'H'],
  ['Hydrochlorothiazide', ['Aquazide'], 'H'],

  // ── Schedule H — diabetes ──
  ['Metformin', ['Glycomet', 'Glyciphage'], 'H'],
  ['Glimepiride', ['Amaryl', 'Zoryl'], 'H'],
  ['Gliclazide', ['Diamicron', 'Reclide'], 'H'],
  ['Sitagliptin', ['Januvia', 'Istavel'], 'H'],
  ['Vildagliptin', ['Galvus', 'Zomelis'], 'H'],
  ['Teneligliptin', ['Tenepure', 'Zita'], 'H'],
  ['Dapagliflozin', ['Forxiga', 'Dapa'], 'H'],
  ['Empagliflozin', ['Jardiance', 'Gibtulio'], 'H'],
  ['Pioglitazone', ['Pioz', 'Piozone'], 'H'],

  // ── Schedule H — gastro / others ──
  ['Pantoprazole', ['Pan', 'Pantocid'], 'H'],
  ['Omeprazole', ['Omez', 'Ocid'], 'H'],
  ['Rabeprazole', ['Rablet', 'Razo'], 'H'],
  ['Esomeprazole', ['Nexpro', 'Sompraz'], 'H'],
  ['Ondansetron', ['Emeset', 'Vomikind'], 'H'],
  ['Domperidone', ['Domstal', 'Vomistop'], 'H'],
  ['Levothyroxine', ['Thyronorm', 'Eltroxin'], 'H'],
  ['Montelukast', ['Montair', 'Montek'], 'H'],
  ['Sertraline', ['Serta', 'Zosert'], 'H'],
  ['Escitalopram', ['Nexito', 'Cipralex'], 'H'],
  ['Fluoxetine', ['Fludac', 'Prodep'], 'H'],
  ['Amitriptyline', ['Tryptomer'], 'H'],
  ['Gabapentin', ['Gabapin'], 'H'],
  ['Pregabalin', ['Pregabid', 'Lyrica'], 'H'],
  ['Levetiracetam', ['Levipil', 'Keppra'], 'H'],
  ['Phenytoin', ['Eptoin'], 'H'],
  ['Sodium Valproate', ['Valparin', 'Encorate'], 'H'],
  ['Carbamazepine', ['Tegretol', 'Zeptol'], 'H'],
  ['Clonazepam', ['Clonotril', 'Rivotril'], 'H1'],
  ['Haloperidol', ['Serenace'], 'H'],
  ['Olanzapine', ['Oleanz', 'Oliza'], 'H'],
  ['Risperidone', ['Risperdal', 'Sizodon'], 'H'],
  ['Quetiapine', ['Qutipin', 'Seroquel'], 'H'],
  ['Tamsulosin', ['Urimax', 'Veltam'], 'H'],
  ['Finasteride', ['Finast', 'Fincar'], 'H'],
  ['Allopurinol', ['Zyloric', 'Ciploric'], 'H'],
  ['Febuxostat', ['Febustat', 'Zurig'], 'H'],
  ['Methotrexate', ['Folitrax', 'Imutrex'], 'H'],
  ['Salbutamol', ['Asthalin', 'Ventorlin'], 'H'],
  ['Budesonide', ['Budecort', 'Foracort'], 'H'],
  ['Theophylline', ['Deriphyllin'], 'H'],

  // ── OTC — no prescription ──
  ['Paracetamol', ['Dolo', 'Crocin', 'Calpol'], 'OTC'],
  ['Ibuprofen', ['Brufen', 'Combiflam'], 'OTC'],
  ['Aspirin', ['Disprin'], 'OTC'],
  ['Diclofenac (topical)', ['Volini', 'Moov'], 'OTC'],
  ['Cetirizine', ['Cetzine', 'Alerid'], 'OTC'],
  ['Levocetirizine', ['Levocet', 'Xyzal'], 'OTC'],
  ['Loratadine', ['Lorfast'], 'OTC'],
  ['Fexofenadine', ['Allegra', 'Fexova'], 'OTC'],
  ['Chlorpheniramine', ['Piriton', 'CPM'], 'OTC'],
  ['Famotidine', ['Famocid'], 'OTC'],
  ['Antacid (Al/Mg hydroxide)', ['Gelusil', 'Digene'], 'OTC'],
  ['Loperamide', ['Eldoper', 'Roko'], 'OTC'],
  ['ORS (Oral Rehydration Salts)', ['Electral', 'ORSL'], 'OTC'],
  ['Ranitidine', ['Aciloc', 'Rantac'], 'OTC'],
  ['Bromhexine', ['Bromhexine'], 'OTC'],
  ['Ambroxol', ['Ambrolite', 'Mucolite'], 'OTC'],
  ['Xylometazoline (nasal)', ['Otrivin', 'Nasivion'], 'OTC'],
  ['Clotrimazole (topical)', ['Candid', 'Canesten'], 'OTC'],
  ['Povidone-Iodine', ['Betadine'], 'OTC'],
  ['Calamine Lotion', ['Caladryl'], 'OTC'],
  ['ORS Zinc', ['Zincovit'], 'OTC'],
  ['Multivitamin', ['Zincovit', 'Supradyn'], 'OTC'],
  ['Vitamin C', ['Limcee', 'Celin'], 'OTC'],
  ['Calcium + Vitamin D3', ['Shelcal', 'Gemcal'], 'OTC'],
  ['Iron + Folic Acid', ['Livogen', 'Autrin'], 'OTC'],
  ['Folic Acid', ['Folvite'], 'OTC'],
]

export const CATALOGUE: CatalogueDrug[] = ROWS
  .map(([generic, brands, schedule]) => ({ generic, brands, schedule }))
  .sort((a, b) => a.generic.localeCompare(b.generic))
