/**
 * The HL7 parser, checked against the messages a real analyzer sends.
 *
 *   npm run verify:hl7
 *
 * Written as a script rather than a unit test for the same reason the barcode
 * check is: the thing being verified is a claim about the physical world — that
 * we can read what an Erba H360 puts on the wire — and the value is in being
 * able to run it against a captured message from a new hospital's machine
 * without setting up a test framework first.
 *
 * To check a real capture: save it to a file and
 *
 *   npx tsx scripts/verify-hl7.ts path/to/capture.hl7
 */

import { readFileSync } from 'node:fs'
import { parseHl7 } from '../src/lib/lab/hl7'
import { parseAstm, detectProtocol } from '../src/lib/lab/astm'

let failed = 0
function check(ok: boolean, label: string, detail?: unknown) {
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? `  — got ${JSON.stringify(detail)}` : ''}`)
}

// A 3-part differential result, shaped the way an Erba H360 sends one: results
// and histograms in the same message, the laboratory's barcode in OBR-3.
const H360 = [
  'MSH|^~\\&|H360|ERBA|UYIRLY|KMC|20261024120000||ORU^R01|9|P|2.3.1',
  'PID|1||DEMO-UH-2026-00007||KUMAR^RAVI||19900101|M',
  'OBR|1|P-77|2610240017|CBC^Complete Blood Count|||20261024115500',
  'OBX|1|NM|WBC^White Blood Cells||11.96|10*3/uL|4.0-11.0|H|||F',
  'OBX|2|NM|LYM%^Lymphocyte percent||19.5|%|20-40|L|||F',
  'OBX|3|NM|GRAN%^Granulocyte percent||76.7|%|50-70|H|||F',
  'OBX|4|NM|RBC^Red Blood Cells||5.08|10*6/uL|4.5-5.5|N|||F',
  'OBX|5|NM|HGB^Haemoglobin||15.0|g/dL|13-17|N|||F',
  'OBX|6|NM|PLT^Platelets||288|10*3/uL|150-450|N|||F',
  // The histograms. Not measurements.
  'OBX|7|NA|WBC_HISTO^WBC histogram||0^1^4^19^57^93^61^22^5^1||||||F',
  'OBX|8|ED|RBC_SCATTER^Scattergram||^image^PNG^Base64^iVBORw0KGgo=||||||F',
].join('\r')

console.log('\nAn Erba H360 result message')
{
  check(detectProtocol(H360) === 'hl7', 'recognised as HL7', detectProtocol(H360))
  const m = parseHl7(H360)
  check(m.fingerprint === 'H360^ERBA', 'instrument identified from MSH-3 and MSH-4', m.fingerprint)
  check(m.model === 'H360', 'model', m.model)
  check(m.manufacturer === 'ERBA', 'manufacturer', m.manufacturer)
  check(m.sampleId === '2610240017', "sample id is the laboratory's number (OBR-3), not the placer's", m.sampleId)
  check(m.patientName === 'RAVI KUMAR', 'patient name, given name first', m.patientName)
  check(m.results.length === 6, 'six results — the histograms are not results', m.results.length)
  check(!m.results.some((r) => /HISTO|SCATTER/.test(r.code)), 'no histogram leaked into the results',
    m.results.map((r) => r.code))
  const wbc = m.results.find((r) => r.code === 'WBC')
  check(wbc?.value === '11.96' && wbc?.unit === '10*3/uL' && wbc?.abnormalFlag === 'H',
    'WBC carries value, unit and the high flag', wbc)
  check(!m.warnings.some((w) => /histogram/i.test(w)), 'histograms are skipped silently', m.warnings)
}

// Verbatim from the first real analyzer ever connected: an Erba H360 in a
// hospital in Karur, 24 October 2026. Everything before this was invented.
const H360_REAL = [
  'MSH|^~\\&|H360|Erba|||20261024145102||ORU^R01|20261024_145013_946|P|2.3.1||||||UNICODE',
  'PID|1||||^9999999999',
  'PV1|1',
  'OBR|1||1115|01001^Automated CBC',
  'OBX|17|NM|787-2^MCV^LN||79.7|fL|82.0-100.0|L~A|||F',
  'OBX|18|NM|785-6^MCH^LN||29.0|pg|27.0-34.0|~N|||F',
  'OBX|19|NM|786-4^MCHC^LN||36.4|g/dL|32.0-36.0|H|||F',
].join('\r')

console.log('\nThe real H360, as it actually transmits')
{
  const m = parseHl7(H360_REAL)
  check(m.fingerprint === 'H360^Erba', 'identified as H360^Erba', m.fingerprint)
  check(m.sampleId === '1115', 'sample id from OBR-3', m.sampleId)

  // The whole point. 787-2 means nothing to a technician; MCV does.
  check(m.results.map((r) => r.code).join(',') === 'MCV,MCH,MCHC',
    'LOINC-coded results are named, not numbered', m.results.map((r) => r.code))
  check(m.results[0]?.standardCode === '787-2',
    'and the LOINC number is kept beside it', m.results[0]?.standardCode)

  const mcv = m.results.find((r) => r.code === 'MCV')
  check(mcv?.value === '79.7' && mcv?.unit === 'fL', 'value and unit', mcv)
  check(mcv?.abnormalFlag === 'L',
    'a repeated flag L~A gives L, not the whole string', mcv?.abnormalFlag)

  const mch = m.results.find((r) => r.code === 'MCH')
  check(mch?.abnormalFlag === null || mch?.abnormalFlag === '',
    'an empty leading flag ~N does not become a stray value', mch?.abnormalFlag)
}

console.log('\nThe H360 also reports how it was set up')
{
  // Verbatim again. These are configuration, not measurements, and every one
  // of them would otherwise reach a technician as "what does this measure?"
  const m = parseHl7([
    'MSH|^~\\&|H360|Erba|||20261024145102||ORU^R01|1|P|2.3.1',
    'OBR|1||1115|01001^Automated CBC',
    'OBX|1|IS|02001^Take Mode^99MRC||O||||||F',
    'OBX|2|IS|02002^Blood Mode^99MRC||W||||||F',
    'OBX|3|IS|02003^Test Mode^99MRC||CBC+3DIFF||||||F',
    'OBX|6|IS|03001^Ref Group^99MRC||General||||||F',
    'OBX|7|NM|6690-2^WBC^LN||18.77|10*3/uL|3.50-9.50|H~A|||F',
    'OBX|25|NM|11003^PCT^99MRC||0.435|%|0.108-0.282|H~A|||F',
  ].join('\r'))

  const codes = m.results.map((r) => r.code)
  check(!codes.some((c) => /Mode|Group|^0\d{4}$/.test(c)),
    'take mode, blood mode, test mode and ref group are not measurements', codes)
  check(codes.includes('WBC'), 'the actual result is kept', codes)
  check(codes.includes('PCT'),
    "a vendor's own channel number is named too — 11003 is PCT", codes)
  check(m.results.find((r) => r.code === 'PCT')?.standardCode == null,
    'and a private channel number is not recorded as a standard code',
    m.results.find((r) => r.code === 'PCT')?.standardCode)
  check(m.results.find((r) => r.code === 'WBC')?.standardCode === '6690-2',
    'while a real LOINC number is', m.results.find((r) => r.code === 'WBC')?.standardCode)
  check(m.results.length === 2, 'two measurements out of six observations', codes)
}

console.log('\nA machine that sends its own vocabulary is untouched')
{
  const m = parseHl7('MSH|^~\\&|BC|X|A|B|2026||ORU^R01|1|P|2.3\rOBX|1|NM|WBC^White Blood Cells^L||8.4|10*3/uL||N|||F')
  check(m.results[0]?.code === 'WBC', 'a plain mnemonic stays the code', m.results[0]?.code)
  check(!m.results[0]?.standardCode, 'and carries no standard code', m.results[0]?.standardCode)
}

// The trap that looks like it works: MSH is numbered differently from every
// other segment, so reading MSH-3 as index 3 silently returns the receiver.
console.log('\nThe MSH off-by-one')
{
  const m = parseHl7('MSH|^~\\&|SENDER|SENDFAC|RECEIVER|RECFAC|20261024||ORU^R01|1|P|2.3\rOBX|1|NM|X||1||||||F')
  check(m.model === 'SENDER', 'MSH-3 is the sender, not the receiver', m.model)
  check(m.manufacturer === 'SENDFAC', 'MSH-4 is the sending facility', m.manufacturer)
}

console.log('\nAn instrument that chose different delimiters')
{
  // MSH-1 declares the field separator. An instrument is entitled to pick any
  // character, and the standard says to read it rather than assume a pipe.
  const m = parseHl7('MSH!@~\\&!CHEM5X!ERBA!LIS!H!2026!!ORU@R01!1!P!2.3\rOBX!1!NM!GLU@Glucose!!98!mg/dL!70-110!N!!!F')
  check(m.fingerprint === 'CHEM5X^ERBA', 'identified despite a non-standard field separator', m.fingerprint)
  check(m.results[0]?.code === 'GLU' && m.results[0]?.value === '98', 'result read with the declared delimiters', m.results[0])
}

console.log('\nEscaped delimiters inside values')
{
  const m = parseHl7('MSH|^~\\&|A|B|C|D|2026||ORU^R01|1|P|2.3\rOBX|1|NM|WBC||8.4|10\\S\\9/L||N|||F')
  check(m.results[0]?.unit === '10^9/L', 'an escaped component separator is restored', m.results[0]?.unit)
}

console.log('\nThings a real machine does on a bad day')
{
  const m = parseHl7([
    'MSH|^~\\&|A|B|C|D|2026||ORU^R01|1|P|2.3',
    'OBX|1|NM|HGB||||||||F',              // no value — a short draw
    'OBX|2|NM|||5.5|||||F',               // no code
    'OBX|3|NM|K^Potassium||4.1~4.2|mmol/L||N|||F',  // a repeated value
  ].join('\r'))
  check(m.results.length === 1, 'only the usable result is kept', m.results.map((r) => r.code))
  check(m.results[0]?.value === '4.1', 'the first of a repeated value is the reportable one', m.results[0]?.value)
  check(m.warnings.some((w) => /HGB/.test(w)), 'a missing value is warned about, not hidden', m.warnings)
  check(m.warnings.some((w) => /no test code/i.test(w)), 'a result with no code is warned about', m.warnings)
}

console.log('\nSpecimen id in SPM, as HL7 2.5 puts it')
{
  const m = parseHl7([
    'MSH|^~\\&|A|B|C|D|2026||ORU^R01|1|P|2.5',
    'OBR|1|||CBC',
    'SPM|1|2610240099||BLD',
    'OBX|1|NM|WBC||8.4|10*3/uL||N|||F',
  ].join('\r'))
  check(m.sampleId === '2610240099', 'falls back to SPM when OBR carried no id', m.sampleId)
}

console.log('\nA message that is not a result')
{
  const m = parseHl7('MSH|^~\\&|A|B|C|D|2026||ACK^R01|1|P|2.3\rMSA|AA|1')
  check(m.warnings.some((w) => /not a result message/i.test(w)), 'an acknowledgement is called out', m.warnings)
}

console.log('\nASTM still parses (nothing was broken on the way past)')
{
  const astm = 'H|\\^&|||BC-5130^Mindray|||||||P|1\rP|1||||PATIENT\rO|1|2609230004||^^^CBC\rR|1|^^^WBC|8.4|10*9/L||N\rL|1|N'
  check(detectProtocol(astm) === 'astm', 'still recognised as ASTM', detectProtocol(astm))
  const m = parseAstm(astm)
  check(m.fingerprint === 'BC-5130^Mindray', 'ASTM fingerprint unchanged', m.fingerprint)
  check(m.results[0]?.value === '8.4', 'ASTM result unchanged', m.results[0])
}

// A captured message from a real machine, when one is passed in.
const file = process.argv[2]
if (file) {
  console.log(`\nCapture: ${file}`)
  const raw = readFileSync(file, 'utf8')
  const proto = detectProtocol(raw)
  console.log(`  protocol: ${proto ?? 'unrecognised'}`)
  const m = proto === 'hl7' ? parseHl7(raw) : parseAstm(raw)
  console.log(`  instrument: ${m.fingerprint ?? '(did not identify itself)'}`)
  console.log(`  sample: ${m.sampleId ?? '(none)'}`)
  console.log(`  results: ${m.results.length}`)
  for (const r of m.results) {
    console.log(`     ${r.code.padEnd(12)} ${String(r.value).padEnd(10)} ${r.unit ?? ''} ${r.abnormalFlag ?? ''}`)
  }
  if (m.warnings.length) console.log(`  warnings:\n${m.warnings.map((w) => '     ' + w).join('\n')}`)
}

console.log('\nBoditech iChroma II (OUL^R24, sample id in PID-2) — shape captured at Karur 9 Nov 2026, values made up')
{
  const ICHROMA = [
    'MSH|^~\\&|1|ichroma2|RL630||2026-11-09 12:36:46||OUL^R24^OUL_R24|1|T|2.6',
    'PID||26110900|||||45|Female',
    'OBR||Tn-I|0|1|||2026-11-09 12:36:46|||F',
    'ORC|OK|||||||||||||||||RL630|1',
    'SPM|1|KTVXC10EX|||||||||||||||||20270510',
    'OBX|1|TX|Tn-I||3.33|ng/mL||0|||R',
    'OBX|2|TX|||3.33|ug/L||0|||R',
  ].join('\r')
  const m = parseHl7(ICHROMA)
  check(m.fingerprint === '1^ichroma2', 'identified as the iChroma', m.fingerprint)
  check(m.sampleId === '26110900', 'sample id is the operator\'s id from PID-2 (not "0", not the test name, not the lot)', m.sampleId)
  check(m.results.length === 1 && m.results[0].code === 'Tn-I' && m.results[0].value === '3.33' && m.results[0].unit === 'ng/mL',
    'one result: Tn-I 3.33 ng/mL (the unit-converted copy with no code is skipped)', m.results)
  check(!m.warnings.some((w) => /not a result message/.test(w)), 'OUL is accepted as a result message', m.warnings)

  const noId = parseHl7(ICHROMA.replace('PID||26110900|', 'PID|||'))
  check(noId.sampleId === null, 'no id typed → no sample id (never the lot or test name)', noId.sampleId)
  check(noId.warnings.some((w) => /No sample id was entered/.test(w)), '…and it says so', noId.warnings)
}

console.log('\nA placeholder "0" is not a sample id (any instrument)')
{
  const m = parseHl7('MSH|^~\\&|X1|ACME|||20261109||ORU^R01|1|P|2.5\rOBR|1||0|CBC\rSPM|1|S123\rOBX|1|NM|WBC||7.1|10*3/uL')
  check(m.sampleId === 'S123', 'OBR-3 "0" skipped, SPM id used', m.sampleId)
}

console.log('\nThe instrument\'s own normal range (OBX-7) is kept')
{
  const m = parseHl7([
    'MSH|^~\\&|H360|ERBA|UYIRLY|KMC|20261024120000||ORU^R01|9|P|2.3.1',
    'OBR|1||2610240017|CBC',
    'OBX|1|NM|6690-2^WBC^LN||18.77|10*3/uL|3.50-9.50|H~A|||F',
    'OBX|2|NM|11003^PCT^99MRC||0.435|%|0.108-0.282|H~A|||F',
    'OBX|3|NM|11092^*Mentzr^LN||26.37||||||F',
  ].join('\r'))
  const by = Object.fromEntries(m.results.map((r) => [r.code, r]))
  check(by.WBC?.refLow === 3.5 && by.WBC?.refHigh === 9.5, 'WBC range 3.50-9.50 read', by.WBC)
  check(by.PCT?.refLow === 0.108 && by.PCT?.refHigh === 0.282, 'PCT range 0.108-0.282 read', by.PCT)
  check(by['*Mentzr']?.refLow == null && by['*Mentzr']?.refHigh == null, 'no range sent → none invented', by['*Mentzr'])
}

console.log('\nErba ECL 105 (ASTM, name in H-10, three results all coded APTT) — shape captured at Karur 9 Nov 2026, name made up')
{
  const ECL = [
    'H|\\^&|||||||ECL 105',
    'P|1||TESTNAM',
    'O|1|TEST.01||^^^|||||',
    'R|1|^^^APTT|36.9|Sec||||||||20261016100710||',
    'R|2|^^^APTT|0.0|Ratio||||||||20261016100710||',
    'R|3|^^^APTT|0.0|No Unit||||||||20261016100710||',
    'L|1',
  ].join('\r')
  const m = parseAstm(ECL)
  check(m.fingerprint === 'ECL 105', 'machine named ECL 105, not "?"', m.fingerprint)
  check(!m.warnings.some((w) => /did not identify/.test(w)), 'no "did not identify" warning', m.warnings)
  check(m.sampleId === 'TEST.01', 'sample id from the order record', m.sampleId)
  const codes = m.results.map((r) => r.code)
  check(JSON.stringify(codes) === JSON.stringify(['APTT', 'APTT (Ratio)', 'APTT (No Unit)']),
    'three distinct codes, the seconds keeping the plain one', codes)
  check(m.results[0].value === '36.9' && m.results[0].unit === 'Sec', 'APTT is the 36.9 seconds, never overwritten', m.results[0])
}

console.log('\nEDAN i15 blood gas (group in OBX-3, name in OBX-4, UTF-8 arrows) — shape captured at Karur 9 Nov 2026')
{
  // The connector hands over bytes read one per character, so UTF-8 arrives split.
  const latin = (t: string) => String.fromCharCode(...new TextEncoder().encode(t))
  const m = parseHl7(latin([
    'MSH|^~\\&|EDAN|i15^M25500920010|LIS||20261109164316||ORU^R01||P|2.4||||0||UNICODE UTF-8||||',
    'PID|||TESTPATIENT',
    'OBR|||20261017001|EDAN^i15|||20261017064529',
    'OBX|0|ST|0|pH|7.420||7.320^7.430||||||Pass',
    'OBX|1|ST|0|pO2|45|mmHg|0^0|↓|||||Pass',
    'OBX|3|ST|0|Na+|130|mmol/L|136^145|↓|||||Pass',
    'OBX|5|ST|0|Ca++|0.95|mmol/L|1.15^1.33|↓|||||Pass',
    'OBX|11|ST|1|cH+|38.0|nmol/L|10.0^316.2|||||||',
    'OBX|19|ST|1|pO2(A-a)|......|mmHg|0^733|||||||',
    'OBX|34|ST|2|Temperature|37.0|℃||||||||',
    'OBX|35|ST|2|FIO2|21|%||||||||',
  ].join('\r')))
  const codes = m.results.map((r) => r.code)
  check(JSON.stringify(codes) === JSON.stringify(['pH', 'pO2', 'Na+', 'Ca++', 'cH+', 'Temperature', 'FIO2']),
    'names from OBX-4, never "0"/"1"/"2"', codes)
  const by = Object.fromEntries(m.results.map((r) => [r.code, r]))
  check(m.sampleId === '20261017001', 'sample id from OBR-3', m.sampleId)
  check(by.pH?.refLow === 7.32 && by.pH?.refHigh === 7.43, 'pH range 7.32–7.43 kept (measured group)', by.pH)
  check(by.pO2?.refLow == null && by.pO2?.refHigh == null, '"0^0" is no range', by.pO2)
  check(by['cH+']?.refLow == null, 'calculated group: display limits are not a normal range', by['cH+'])
  check(by['Na+']?.abnormalFlag === 'L', '↓ read as L', by['Na+']?.abnormalFlag)
  check(by.Temperature?.unit === '°C', '℃ read as °C', by.Temperature?.unit)
  check(!by['pO2(A-a)'] && m.warnings.some((w) => /pO2\(A-a\) had no value/.test(w)), '"......" is not a value', m.warnings)
}

console.log('\nNo repeats → codes untouched (H360 unchanged)')
{
  const m = parseHl7('MSH|^~\\&|H360|ERBA|||2026||ORU^R01|9|P|2.3.1\rOBR|1||S1|CBC\rOBX|1|NM|6690-2^WBC^LN||7|x\rOBX|2|NM|718-7^HGB^LN||12|g/dL')
  check(JSON.stringify(m.results.map((r) => r.code)) === JSON.stringify(['WBC', 'HGB']), 'WBC, HGB as before', m.results.map((r) => r.code))
}

console.log(failed === 0 ? '\nAll checks passed.\n' : `\n${failed} FAILED\n`)
process.exit(failed ? 1 : 0)
