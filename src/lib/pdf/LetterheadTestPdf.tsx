import { Text, View } from '@react-pdf/renderer'
import { A4, InfoGrid, PageChrome, SectionTitle, TextBlock, TitleBand, C, fmtDate } from './parts'
import type { Paper } from './letterhead'

/**
 * One A4 sheet for lining up the letterhead setting: the blank areas shaded and
 * labelled, a millimetre ruler down the side, and the start of a document where
 * real ones start. Printed on the hospital's own paper, the shading should cover
 * its printed header exactly.
 */
export function LetterheadTestPdf({ paper, hospital }: { paper: Paper; hospital: string }) {
  const PAGE_H = 841.89
  const band = (top: number, height: number, text: string) => (
    <View fixed style={{ position: 'absolute', top, left: 0, right: 0, height, backgroundColor: '#E6F4F1', borderStyle: 'dashed', borderColor: C.accent, borderTopWidth: top ? 1 : 0, borderBottomWidth: top ? 0 : 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontSize: 10, fontWeight: 700, color: C.accent }}>{text}</Text>
    </View>
  )
  const ticks = []
  for (let mm = 0; mm <= Math.max(paper.topMm + 20, 60); mm += 5) {
    const y = mm * 72 / 25.4
    ticks.push(
      <View key={mm} fixed style={{ position: 'absolute', top: y, left: 12, flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: mm % 10 === 0 ? 10 : 5, borderTopWidth: 0.6, borderTopColor: C.ink }} />
        {mm % 10 === 0 && mm > 0 ? <Text style={{ fontSize: 6, color: C.ink, marginLeft: 2, marginTop: -3 }}>{mm}</Text> : null}
      </View>,
    )
  }
  return (
    <A4 title="Letterhead test page" paper={paper}>
      {paper.top > 0 ? band(0, paper.top, `Your printed letterhead — top ${paper.topMm} mm`) : null}
      {paper.bottom > 0 ? band(PAGE_H - paper.bottom, paper.bottom, `Printed footer — bottom ${paper.bottomMm} mm`) : null}
      {ticks}
      <PageChrome paper={paper} hospital={hospital} identity="Test page" docRef="LETTERHEAD-TEST" />
      <TitleBand title="LETTERHEAD TEST PAGE" subtitle="Documents start where this band starts" numberLabel="Top" number={`${paper.topMm} mm`} date={fmtDate(new Date().toISOString())} />
      <InfoGrid items={[
        ['Patient', 'Sample Patient'], ['UHID', 'XXXX-UH-2026-00001'],
        ['Age / Sex', '46 Y / Male'], ['Doctor', 'Dr Sample'],
      ]} />
      <SectionTitle>How to check</SectionTitle>
      <TextBlock text={[
        `Print this page on your letterhead paper, or hold it against a sheet up to the light.`,
        `The shaded band at the top should cover your printed header, and this document should start just below it. The ruler on the left is in millimetres from the top edge of the paper.`,
        `If the band is shorter than your header, the document will print over it: increase the top space. If there is a wide gap, reduce it.`,
        paper.bottomMm ? `The shaded band at the bottom should cover your printed footer.` : `If your paper has a printed footer, set a bottom space too.`,
        `Printers vary by a millimetre or two: check on the printer you use most.`,
      ].join('\n\n')} />
    </A4>
  )
}
