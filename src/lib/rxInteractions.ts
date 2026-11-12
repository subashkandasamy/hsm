// Well-established dangerous drug pairs, checked alongside the
// drug_interactions table (which held 38 rows — BUG-012: ciprofloxacin +
// tizanidine, a contraindicated pair, gave no warning). Generic names, lower
// case, matched the same way as the table's rows. A safety aid, not a
// replacement for the doctor's judgement or a full interaction database.
import type { RxInteractionRow } from '@/lib/rxMatch'

type Sev = 'major' | 'moderate'
const rows: RxInteractionRow[] = []
function pairs(as: string[], bs: string[], severity: Sev, description: string) {
  for (const a of as) for (const b of bs) rows.push({ drug_a: a, drug_b: b, severity, description })
}

const SSRIS = ['sertraline', 'fluoxetine', 'escitalopram', 'citalopram', 'paroxetine', 'fluvoxamine']
const OPIOIDS = ['morphine', 'fentanyl', 'tramadol', 'codeine', 'tapentadol', 'pethidine', 'buprenorphine']
const BENZOS = ['midazolam', 'diazepam', 'lorazepam', 'alprazolam', 'clonazepam']
const QT = ['amiodarone', 'haloperidol', 'domperidone', 'hydroxychloroquine', 'levofloxacin', 'moxifloxacin', 'azithromycin', 'clarithromycin', 'erythromycin', 'ondansetron', 'sotalol']
const ACEI = ['enalapril', 'ramipril', 'lisinopril', 'perindopril', 'captopril']
const ARB = ['losartan', 'telmisartan', 'olmesartan', 'valsartan', 'irbesartan']
const BB = ['metoprolol', 'atenolol', 'propranolol', 'bisoprolol', 'carvedilol']
const NITRATES = ['isosorbide', 'nitroglycerin', 'glyceryl trinitrate', 'nicorandil']
const PDE5 = ['sildenafil', 'tadalafil']
const AZOLES = ['ketoconazole', 'itraconazole', 'voriconazole', 'posaconazole']
const STATINS_3A4 = ['simvastatin', 'lovastatin', 'atorvastatin']

pairs(['ciprofloxacin', 'fluvoxamine'], ['tizanidine'], 'major', 'Contraindicated: raises tizanidine levels many-fold (CYP1A2) — severe hypotension and sedation.')
pairs(['clarithromycin', 'erythromycin', ...AZOLES], ['colchicine'], 'major', 'Colchicine toxicity, can be fatal — avoid or cut the colchicine dose.')
pairs(['clarithromycin', 'erythromycin', ...AZOLES], STATINS_3A4, 'major', 'Statin levels rise sharply — risk of myopathy and rhabdomyolysis.')
pairs(PDE5, NITRATES, 'major', 'Contraindicated: profound hypotension.')
pairs(['linezolid'], [...SSRIS, 'tramadol', 'pethidine'], 'major', 'Serotonin syndrome.')
pairs(['tramadol', 'pethidine', 'sumatriptan'], SSRIS, 'major', 'Serotonin syndrome (and seizures with tramadol).')
pairs(OPIOIDS, BENZOS, 'major', 'Additive respiratory depression and sedation — monitor closely, use the lowest doses.')
for (let i = 0; i < QT.length; i++) for (let j = i + 1; j < QT.length; j++) rows.push({ drug_a: QT[i], drug_b: QT[j], severity: 'major', description: 'Both prolong the QT interval — risk of torsades de pointes. ECG and electrolytes.' })
pairs(['lithium'], [...ACEI, ...ARB, 'hydrochlorothiazide', 'chlorthalidone', 'diclofenac', 'naproxen', 'aceclofenac'], 'major', 'Lithium levels rise — toxicity. Check levels.')
pairs(['warfarin'], ['cotrimoxazole', 'sulfamethoxazole', 'amiodarone', 'fluconazole', 'voriconazole', 'naproxen', 'aceclofenac'], 'major', 'Raises INR — bleeding risk. Check INR.')
pairs(['warfarin'], ['rifampicin', 'carbamazepine', 'phenytoin'], 'major', 'Lowers the warfarin effect — clot risk. Check INR.')
pairs(['verapamil', 'diltiazem'], BB, 'major', 'Bradycardia, heart block, hypotension.')
pairs(['digoxin'], ['verapamil', 'diltiazem', 'erythromycin', 'azithromycin'], 'major', 'Digoxin levels rise — toxicity.')
pairs(ACEI, ARB, 'moderate', 'Dual RAAS blockade — hyperkalaemia and kidney injury.')
pairs(['spironolactone', 'eplerenone', 'amiloride'], [...ARB, 'potassium chloride', 'potassium'], 'major', 'Hyperkalaemia.')
pairs(['allopurinol', 'febuxostat'], ['mercaptopurine'], 'major', 'Marrow toxicity — mercaptopurine dose must be cut.')
pairs(['methotrexate'], ['trimethoprim', 'naproxen', 'aceclofenac'], 'major', 'Methotrexate toxicity (marrow, kidney).')
pairs(['carbamazepine'], ['clarithromycin', 'erythromycin', 'fluconazole'], 'major', 'Carbamazepine toxicity.')
pairs(['phenytoin'], ['fluconazole', 'isoniazid'], 'moderate', 'Phenytoin levels rise — toxicity.')
pairs(['rifampicin'], ['ethinylestradiol', 'levonorgestrel', 'norethisterone'], 'moderate', 'Contraceptive failure — use another method.')
pairs(['clopidogrel'], ['esomeprazole'], 'moderate', 'Weaker antiplatelet effect.')
pairs(['ceftriaxone'], ['calcium gluconate', 'calcium chloride'], 'major', 'Ceftriaxone–calcium precipitate (never mix; contraindicated in neonates).')
pairs(['gentamicin', 'amikacin'], ['vancomycin', 'furosemide'], 'major', 'Additive kidney and ear toxicity — monitor levels and creatinine.')

/** Built-in pairs not already in the table (the table's own row wins). */
export function withBuiltInInteractions(table: RxInteractionRow[]): RxInteractionRow[] {
  const key = (a: string, b: string) => [a.toLowerCase(), b.toLowerCase()].sort().join('|')
  const seen = new Set(table.map((r) => key(r.drug_a, r.drug_b)))
  return [...table, ...rows.filter((r) => !seen.has(key(r.drug_a, r.drug_b)))]
}

export const BUILT_IN_INTERACTION_COUNT = rows.length
