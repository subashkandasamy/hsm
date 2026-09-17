import { Image, Text, View } from '@react-pdf/renderer'
import type { Admission, IpdDeclaration, TenantProfile } from '@/lib/types'
import {
  A4, InfoGrid, Letterhead, PageChrome, TextBlock, TitleBand,
  fmtDate, fmtDateTime, shortRef, s, C, type LogoImage,
} from './parts'

export function DeclarationPdf({ admission: adm, declaration, text, profile, logo }: {
  admission: Admission; declaration: IpdDeclaration | null; text: string; profile: TenantProfile | null; logo: LogoImage
}) {
  const hospital = profile?.name || 'Hospital'
  const p = adm.patient
  const ref = adm.ip_no ?? shortRef('IP', adm.id)
  const signed = declaration?.status === 'signed'
  // Drawn signatures are stored as PNG/JPEG data URLs from the signing pad.
  const sigImage = signed && declaration?.signature_data && /^data:image\/(png|jpe?g);base64,/.test(declaration.signature_data)
    ? declaration.signature_data : null

  return (
    <A4 title={`Consent ${p?.full_name ?? ''}`}>
      <PageChrome hospital={hospital} identity={`${p?.full_name ?? ''} · UHID ${p?.uhid ?? ''}`} docRef={ref} />
      <Letterhead profile={profile} fallbackName={hospital} logo={logo} />
      <TitleBand
        title="DECLARATION & CONSENT"
        subtitle="Admission, treatment and financial responsibility"
        numberLabel="IP Ref" number={ref} date={`Admitted ${fmtDate(adm.admitted_at)}`}
      />
      <InfoGrid items={[
        ['Patient', p?.full_name],
        ['UHID', p?.uhid],
        ['Admitted', fmtDateTime(adm.admitted_at)],
        ['Consultant', adm.doctor?.full_name],
      ]} />

      <View style={{ marginTop: 8 }}>
        <TextBlock text={text} size={9.5} />
      </View>

      {signed ? (
        <View wrap={false} style={{ marginTop: 16, borderTopWidth: 0.75, borderTopColor: C.rule, paddingTop: 8 }}>
          <Text style={{ fontSize: 9, fontWeight: 700, color: C.ok, marginBottom: 6 }}>
            Signed digitally{declaration?.signed_at ? ` on ${fmtDateTime(declaration.signed_at)}` : ''}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Signed by</Text>
              <Text style={{ fontSize: 10, fontWeight: 700, color: C.ink }}>{declaration?.signer_name ?? '—'}</Text>
              {declaration?.signer_relationship ? (
                <Text style={[s.small, { textTransform: 'capitalize' }]}>{declaration.signer_relationship}</Text>
              ) : null}
            </View>
            {sigImage ? <Image src={sigImage} style={{ width: 150, height: 55, objectFit: 'contain' }} /> : null}
          </View>
        </View>
      ) : (
        <View wrap={false} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 44 }}>
          {['Signature of patient / relative', 'Witness (hospital staff)'].map((label, i) => (
            <View key={label} style={{ width: 210, borderTopWidth: 0.75, borderTopColor: C.muted, paddingTop: 3 }}>
              <Text style={s.small}>{label}</Text>
              <Text style={[s.small, { color: C.rule }]}>{i === 0 ? 'Name, relationship & date' : 'Name & designation'}</Text>
            </View>
          ))}
        </View>
      )}
    </A4>
  )
}
