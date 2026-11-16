/*
 * Step 9 — suppliers.
 *
 * KMCH's pharma distributors from SwiftEHR's supplier master, with GSTIN,
 * drug licence number, address, phone, email and contact person (columns
 * from migration 0306). Purchases are NOT imported: the stock was loaded
 * separately, and a purchase entry is what moves stock.
 *
 * Left out: "OPENING STOCK" (SwiftEHR's placeholder for the starting stock)
 * and the hospital itself (marked internal in SwiftEHR). A supplier the
 * hospital already has under the same name is left as it is.
 *
 * Demo: real businesses' names, phones and tax numbers stay off demo — each
 * becomes "<city> Pharma Distributors (SUP-n)" with a fake phone.
 */
import { db, all, loadItems, fakePhone, logThenInsert, undoStep, type Tenant, type Planned } from '../lib'

const STEP = 'suppliers'
const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : v != null ? String(v) : '') || null
const key = (s: unknown) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

export async function plan(t: Tenant) {
  const [m] = loadItems<any>('masters')
  const have = await all<{ name: string }>((f, to) => db().from('suppliers').select('name').eq('tenant_id', t.id).order('id').range(f, to))
  const existing = new Set(have.map((h) => key(h.name)))
  const rows: Planned[] = []
  const c = { inMaster: 0, placeholder: 0, internal: 0, alreadyThere: 0, withGstin: 0, badGstin: 0 }
  for (const s of m.suppliers ?? []) {
    c.inMaster++
    if (/OPENING STOCK/i.test(s.name)) { c.placeholder++; continue }
    if (s.internal) { c.internal++; continue }
    const name = t.scramble ? `${clean(s.city) ?? 'Karur'} Pharma Distributors (${clean(s.code)})` : clean(s.name)!
    if (existing.has(key(name))) { c.alreadyThere++; continue }
    const gst = clean(s.gst)?.toUpperCase().replace(/\s+/g, '') ?? null
    const gstin = gst && /^[0-9]{2}[A-Z0-9]{13}$/.test(gst) ? gst : null
    if (gstin) c.withGstin++; else if (gst) c.badGstin++
    const address = [clean(s.address), clean(s.location), clean(s.city), clean(s.state), clean(s.zipCode)].filter(Boolean).join(', ') || null
    rows.push({
      key: `supplier:${s.supplierId}`,
      row: t.scramble
        ? { name, contact_person: null, phone: clean(s.phoneNumber) ? fakePhone(clean(s.phoneNumber)!) : null, email: null, gstin: null, drug_licence_no: null, address: clean(s.city) }
        : { name, contact_person: clean(s.contactPerson) ?? clean(s.pointOfContactName), phone: clean(s.phoneNumber) ?? clean(s.pointOfContactNumber),
            email: clean(s.email), gstin, drug_licence_no: clean(s.drugLiscense), address },
    })
  }
  return { rows, c }
}

export async function run(t: Tenant, write: boolean): Promise<void> {
  const { rows, c } = await plan(t)
  console.log(`suppliers to add: ${rows.length}`, c)
  for (const r of rows.slice(0, 3)) console.log('  e.g.', JSON.stringify(t.scramble ? r.row : { ...r.row, phone: '(real)' }))
  if (!write) { console.log('dry run — nothing written. Add --write to write.'); return }
  const res = await logThenInsert(t, STEP, 'suppliers', rows)
  console.log(`suppliers written: ${res.inserted} new, ${res.existing} already there`)
}

export async function undo(t: Tenant): Promise<void> {
  await undoStep(t, STEP, ['suppliers'])
}
