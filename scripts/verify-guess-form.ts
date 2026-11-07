/**
 * The form word read off a line that the catalogue does not hold.
 *
 *   npm run verify:guess-form
 *
 * Every case is real, from a hospital's 1,123-row opening stock. The traps are
 * the point: an invoice writes "IV SET IV & INFUSION" and "DISPOSABLE CAP",
 * and a naive dosage-form list reads those as an injection and a capsule. The
 * device patterns therefore run BEFORE the dosage forms — the same ordering
 * mistake was made once already while classifying this file by hand.
 */
import { guessForm } from '../src/lib/pharmacy/invoiceFile'

let failed = 0
const is = (raw: string, want: string | null) => {
  const got = guessForm(raw)
  const ok = got === want
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${raw.padEnd(34)} → ${String(got)}${ok ? '' : `   want ${String(want)}`}`)
}

console.log('\nThe traps — a device whose name contains a dosage word')
is('IV SET IV & INFUSION', 'IV administration')
is('DISPOSABLE CAP (MEDI)', 'Protective wear / linen')
is('OMNIVAN 3ML SYRINGE', 'Syringe / needle')
is('AERO NEB MASK ADULT', 'Airway / respiratory')
is('AIRWAY GUDEL -1 (WHITE)', 'Airway / respiratory')
is('ULTRA SOUND JELLY 250ML', 'Diagnostic device')
is('STERILLIUM 500ML', 'Antiseptic / disinfectant')

console.log('\nEquipment')
is('DISPOVAN 26G*1/2G NEEDLE', 'Syringe / needle')
is('FOLEY CATHETER 16FR', 'Catheter / drain')
is('SHEATH INTRODUCER 5F', 'Catheter / drain')
is('DISSECTING TOOTH FORC', 'Surgical instrument')
is('S.S TRAY 8" 3"', 'Hospital ware')
is('PELVIC BINDER XL', 'Orthopaedic / support')
is('OMRON BP MONITOR', 'Diagnostic device')
is('NITRILE GLOVES LARGE', 'Gloves')
is('UNDER PAD (DYNA)', 'Dressing / adhesive')

console.log('\nMedicines')
is('DULCOFLEX SUPPOSIT', 'Suppository')
is('ASTHALIN-RESPULES 2.5ML', 'Respules')
is('DERIPHYLLIN-AMP 2ML', 'Injection')
is('ZINCOVIT SF 200ML SYP', 'Syrup')
is('CIPLADINEIN 250GM OINT', 'Ointment / cream')
is('D-RISE 1g SACHET', 'Sachet / powder')
is('NASIVION ADULT SPRAY', 'Inhaler / spray')
is('RL 500ML', 'IV fluid')

console.log('\nDevice words a first pass over the real file showed were missing')
is('AMBU BAG-ADULT(RESQ BAG)', 'Airway / respiratory')
is('ACCU-CHEK ACTIVE STRIP', 'Diagnostic device')
is('B.P. APPARATUS', 'Diagnostic device')
is('B.P DIAMOND STAND CLOCK', 'Diagnostic device')
is('AIR BED', 'Hospital ware')
is('ARM/LEG RESTRAINER ADHSIVE', 'Orthopaedic / support')
// Bare "BP" must stay out of it — a medicine is likelier than a monitor.
is('BPL 40MG', null)

console.log('\nNo guess is better than a wrong one')
is('', null)
is('STAMSEAL 0.25ML', null)
is('PROTI MEDIC - 10G TROPICAL', null)
is('GLYCOPRL RESP', 'Respules')

console.log(failed === 0 ? '\nThe form word is read, not guessed.\n' : `\n${failed} check(s) FAILED.\n`)
process.exit(failed === 0 ? 0 : 1)
