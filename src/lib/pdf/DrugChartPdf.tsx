import { Document, Page, Text, View } from '@react-pdf/renderer'
import type { Admission, TenantProfile } from '@/lib/types'
import { type DrugChart, dayMonth, istTime } from '@/lib/drugChart'
import { labelOf, DIETS, DVT_OPTIONS, bmi } from '@/lib/round'
import { registerPdfFonts, ageSex, C, s } from './parts'

const t7 = { fontSize: 7, color: C.text, lineHeight: 1.3 }
const dm = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' })
/** Date columns per grid block on an A4 landscape page. */
const DAYS_PER_BLOCK = 10

function Grid({ widths, head, rows }: { widths: number[]; head: string[]; rows: Array<Array<string | null | undefined>> }) {
  const cell = (w: number, last: boolean) => ({ width: w, paddingVertical: 2, paddingHorizontal: 3, borderRightWidth: last ? 0 : 0.4, borderRightColor: C.rule })
  return (
    <View style={{ borderWidth: 0.6, borderColor: C.muted }}>
      <View style={{ flexDirection: 'row', backgroundColor: C.fill, borderBottomWidth: 0.6, borderBottomColor: C.muted }}>
        {head.map((h, i) => <Text key={i} style={[t7, cell(widths[i], i === head.length - 1), { fontWeight: 700, color: C.ink }]}>{h}</Text>)}
      </View>
      {rows.map((r, j) => (
        <View key={j} wrap={false} style={{ flexDirection: 'row', borderBottomWidth: j === rows.length - 1 ? 0 : 0.4, borderBottomColor: C.rule }}>
          {r.map((v, i) => <Text key={i} style={[t7, cell(widths[i], i === r.length - 1)]}>{v ?? '—'}</Text>)}
        </View>
      ))}
    </View>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={{ fontSize: 9, fontWeight: 700, color: C.accent, marginBottom: 3 }}>{title}</Text>
      {children}
    </View>
  )
}

/**
 * KMCH's Drug & Fluid Chart, printed from what Uyirly recorded: the header
 * (weight, BMI, diet, admission date, diagnosis, allergy, DVT prophylaxis),
 * STAT / SOS doses, regular prescriptions with the date × time grid, IV
 * infusion therapy and drug infusions. A4 landscape.
 */
export function DrugChartPdf({ chart, admission: adm, patient, allergies, diagnosis, profile }: {
  chart: DrugChart; admission: Admission; profile: TenantProfile | null; allergies: string[]; diagnosis: string[]
  patient: { full_name: string; uhid: string; dob: string | null; gender: string | null }
}) {
  registerPdfFonts()
  const b = bmi(adm.weight_kg, adm.height_cm)
  const blocks: string[][] = []
  for (let i = 0; i < Math.max(chart.days.length, 1); i += DAYS_PER_BLOCK) blocks.push(chart.days.slice(i, i + DAYS_PER_BLOCK))
  const diet = [labelOf(DIETS, adm.diet), adm.diet_kcal ? `${adm.diet_kcal} kcal` : null, adm.diet_protein_g ? `${adm.diet_protein_g} g protein` : null].filter(Boolean).join(', ')

  return (
    <Document title={`Drug chart ${patient.full_name}`} author="Uyirly" creator="Uyirly">
      <Page size="A4" orientation="landscape" style={[s.page, { paddingTop: 22, paddingBottom: 30, paddingHorizontal: 26 }]}>
        <View fixed style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottomWidth: 1, borderBottomColor: C.accent, paddingBottom: 3, marginBottom: 5 }}>
          <View>
            <Text style={{ fontSize: 8, color: C.muted }}>{profile?.name ?? 'Hospital'}</Text>
            <Text style={{ fontSize: 13, fontWeight: 700, color: C.accent, letterSpacing: 1 }}>DRUG &amp; FLUID CHART</Text>
          </View>
          <Text style={{ fontSize: 8, color: C.ink }}>{patient.full_name} · {patient.uhid}{adm.ip_no ? ` · ${adm.ip_no}` : ''}</Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {([
            ['Patient', patient.full_name], ['MRN', patient.uhid], ['Age / Sex', ageSex(patient.dob, patient.gender)],
            ['Consultant', adm.doctor?.full_name ?? null], ['Weight', adm.weight_kg ? `${adm.weight_kg} kg` : null],
            ['Height / BMI', adm.height_cm ? `${adm.height_cm} cm${b ? ` · BMI ${b}` : ''}` : null], ['Special diet', diet || null],
            ['Date of admission', adm.admitted_at ? dm(adm.admitted_at) : null], ['DVT prophylaxis', labelOf(DVT_OPTIONS, adm.dvt_prophylaxis)],
          ] as Array<[string, string | null]>).map(([k, v]) => (
            <Text key={k} style={{ fontSize: 8, marginRight: 14, marginBottom: 2 }}><Text style={{ color: C.muted }}>{k}: </Text><Text style={{ fontWeight: 700, color: C.ink }}>{v ?? '—'}</Text></Text>
          ))}
        </View>
        <Text style={{ fontSize: 8, marginBottom: 1 }}><Text style={{ color: C.muted }}>Diagnosis / procedure: </Text><Text style={{ fontWeight: 700, color: C.ink }}>{diagnosis.join('; ') || '—'}</Text></Text>
        <Text style={{ fontSize: 8, fontWeight: 700, color: allergies.length ? C.danger : C.muted }}>Drug hypersensitivity / allergy: {allergies.length ? allergies.join(', ') : 'not recorded'}</Text>

        <Section title="STAT (PRN / SOS) order — one only and premedication drugs">
          {chart.sos.length === 0 ? <Text style={t7}>None.</Text> : (
            <Grid widths={[48, 32, 170, 90, 40, 32, 100, 100, 100, 77]}
              head={['Date', 'Time', 'Drug', 'Dose', 'Route', 'Order', "Doctor", 'Given by', 'Checked by', 'Reason not given']}
              rows={chart.sos.map((r) => [dm(r.at), istTime(r.at), r.drug, r.status === 'given' ? r.dose : '—', r.route, r.kind, r.doctor,
                r.status === 'given' ? r.givenBy : '—', r.checkedBy, r.status !== 'given' ? `${r.status}${r.note ? ` — ${r.note}` : ''}` : ''])} />
          )}
        </Section>

        <Section title="Regular prescriptions">
          {chart.regular.length === 0 ? <Text style={t7}>None.</Text> : blocks.map((days, bi) => (
            <View key={bi} style={{ marginBottom: 5 }}>
              <Grid widths={[230, ...days.map(() => Math.floor(559 / Math.max(days.length, 1)))]}
                head={['Drug · dose · route · frequency · start · duration · doctor', ...days.map(dayMonth)]}
                rows={chart.regular.map((r, i) => [
                  `${i + 1}. ${r.drug}${r.stopped ? ' (stopped)' : ''}\n${[r.dose, r.route, r.frequency, `from ${dm(r.start)}`, `${r.duration} d`].filter(Boolean).join(' · ')}${r.instructions ? `\n${r.instructions}` : ''}${r.doctor ? `\nDr: ${r.doctor}` : ''}`,
                  ...days.map((d) => (r.cells[d] ?? []).map((x) => `${x.time} ${x.mark}`).join('\n') || ''),
                ])} />
            </View>
          ))}
          <Text style={{ fontSize: 6.5, color: C.muted }}>G given · X missed · H held · • due. Times are when given (or due, if not yet).</Text>
        </Section>

        <Section title="Intravenous infusion therapy">
          {chart.iv.length === 0 ? <Text style={t7}>None.</Text> : (
            <Grid widths={[48, 110, 50, 120, 46, 100, 40, 40, 90, 90, 55]}
              head={['Date', 'I.V. fluid', 'Volume', 'Drug(s) added', 'Rate ml/h', "Doctor", 'Start', 'Finish', 'Given by', 'Checked by', 'Bag no.']}
              rows={chart.iv.map((r) => [dm(r.at), r.fluid, r.volume != null ? `${r.volume} ml` : null, r.added, r.rate != null ? String(r.rate) : null, r.doctor,
                r.start ? istTime(r.start) : r.status, r.finish ? istTime(r.finish) : null, r.givenBy, r.checkedBy, r.bagNo])} />
          )}
        </Section>

        <Section title="Drug infusion">
          {chart.infusions.length === 0 ? <Text style={t7}>None.</Text> : (
            <Grid widths={[48, 190, 150, 50, 60, 140, 151]}
              head={['Date', 'Drug', 'Concentration', 'Route', 'Rate ml/h', "Doctor", 'Nurse']}
              rows={chart.infusions.map((r) => [dm(r.at), `${r.drug}${r.stopped ? ' (stopped)' : ''}`, r.concentration, r.route, r.rate != null ? String(r.rate) : null, r.doctor, r.nurse])} />
          )}
        </Section>

        <Text fixed style={{ position: 'absolute', bottom: 12, left: 26, right: 26, fontSize: 6.5, color: C.faint }}
          render={({ pageNumber, totalPages }) => `Printed from Uyirly — doses as charted by the nurses. Page ${pageNumber} of ${totalPages}`} />
      </Page>
    </Document>
  )
}
