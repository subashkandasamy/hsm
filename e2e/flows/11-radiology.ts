// Radiology: perform, report with an image, release, view, print.
import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import { withRole, go, wait, text, savePrint, shot } from '../lib/browser'
import { buttonIn } from '../lib/ui'
import type { Flow, Run, Patient } from '../lib/run'

/** A small grey "scan" PNG to upload. */
function scanPng(file: string) {
  const w = 320, h = 240; const rows: Buffer[] = []
  for (let y = 0; y < h; y++) { const row = Buffer.alloc(w + 1); for (let x = 0; x < w; x++) row[x + 1] = Math.max(0, Math.min(255, 200 - Math.hypot(x - 160, y - 120) * 1.2 + (Math.abs(x - 160) < 8 ? 30 : 0))); rows.push(row) }
  const crc = (b: Buffer) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)) } return (~c) >>> 0 }
  const chunk = (t: string, d: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]))
}

export default {
  name: 'radiology', title: '11 Radiology',
  async run(r: Run) {
    const m = r.patient('murugan'), l = r.patient('lakshmi'); const LT = 'lab_tech'
    const img = path.join(r.dir, 'scan.png'); scanPng(img)
    await withRole('lab_tech', async ({ page }) => {
      for (const p of [l, m]) {
        await go(page, '/radiology')
        const b = await buttonIn(page, 'Mark Performed', [p.full_name]).catch(() => null)
        if (b) { await b.click(); await wait(page, 3000) }
      }
      await go(page, '/radiology'); await page.getByRole('button', { name: /^Performed/ }).click(); await wait(page, 1500)
      const perf = await text(page)
      r.check({ id: 'RD-01', role: LT, screen: '/radiology', title: 'Mark both scans performed', ok: perf.includes(l.full_name) && perf.includes(m.full_name) })
      const report = async (p: Patient, findings: string, withImage: boolean) => {
        await go(page, '/radiology'); await page.getByRole('button', { name: /^Performed/ }).click(); await wait(page, 1500)
        await (await buttonIn(page, 'Add Report', [p.full_name])).click(); await wait(page, 1500)
        if (withImage) {
          await page.getByRole('button', { name: 'Save Report' }).click(); await wait(page, 1200)
          r.check({ id: 'RD-02', role: LT, screen: '/radiology', title: 'An empty report is refused', ok: await page.getByRole('button', { name: 'Save Report' }).isVisible() })
          await page.locator('input[type=file]').last().setInputFiles(img); await wait(page, 2500)
        }
        await page.locator('textarea:visible').last().fill(findings)
        await page.getByRole('button', { name: 'Save Report' }).click(); await wait(page, 3500)
        await (await buttonIn(page, 'Release Report', [p.full_name])).click(); await wait(page, 3500)
      }
      await report(l, `USG abdomen: dilated non-compressible appendix 9 mm with periappendiceal fat stranding. Impression: acute appendicitis. ${r.tag}`, true)
      await report(m, `CXR PA: lung fields clear, no consolidation or effusion. Impression: normal chest radiograph. ${r.tag}`, false)
      await go(page, '/radiology'); await page.getByRole('button', { name: /^Reported/ }).click(); await wait(page, 2500)
      const rep = await text(page)
      r.check({ id: 'RD-03', role: LT, screen: '/radiology', title: 'Both reports released and listed under Reported', ok: /acute appendicitis/.test(rep) && /normal chest radiograph/.test(rep) })
      // "View Image" opens the report popup, which signs the private image (BUG-026 fix).
      let imgOk = false; let detail = 'no View Image'
      const vi = page.locator('main').getByRole('button', { name: /^View Image/ }).first()
      if (await vi.count()) {
        await vi.click(); await wait(page, 3500)
        const w = await page.getByRole('dialog').locator('img').first().evaluate((i: HTMLImageElement) => i.naturalWidth).catch(() => 0)
        imgOk = w > 0; detail = `image ${w}px wide`
        await page.keyboard.press('Escape').catch(() => {}); await page.getByRole('dialog').getByRole('button', { name: /close/i }).first().click().catch(() => {}); await wait(page, 800)
      }
      r.check({ id: 'RD-04', role: LT, screen: '/radiology', title: '"View Image" on the Reported tab opens the uploaded scan', ok: imgOk, bug: 'BUG-026', detail })
      const card = rep.slice(rep.indexOf(l.full_name), rep.indexOf(l.full_name) + 600)
      r.check({ id: 'RD-05', role: LT, screen: '/radiology', title: 'A reported scan has Print and names who reported it', ok: /Print/.test(card) && /Reported by|E2E Arul/.test(card), bug: 'BUG-027' })
      await shot(r, page, 'radiology_reported')
    })
    await withRole('doctor', async ({ page }) => {
      await go(page, l.visit)
      const v = page.getByRole('button', { name: 'View Report' }).first()
      await v.scrollIntoViewIfNeeded().catch(() => {}); await v.click(); await wait(page, 5000)
      const dlg = page.locator('div').filter({ has: page.getByText(/^Radiology Report — /) }).filter({ has: page.getByText('Print Report') }).last()
      const dt = (await dlg.innerText().catch(() => '')).replace(/\s+/g, ' ')
      const size = await dlg.locator('img').first().evaluate((i: HTMLImageElement) => i.naturalWidth).catch(() => 0)
      r.check({ id: 'RD-10', role: 'doctor', screen: '/opd/[visit] → View Report', title: 'Doctor\'s report popup shows the findings and the image', ok: /appendicitis/.test(dt) && size > 0 })
      const p = await dlg.locator('a[href*="print/radiology"]').first().getAttribute('href').catch(() => null)
      if (p) { const pr = await savePrint(r, page, p, 'radiology_usg'); r.check({ id: 'RD-11', role: 'doctor', screen: '/print/radiology', title: 'Print the radiology report with the scan image', ok: pr.status === 200 && /pdf/.test(pr.type), detail: `${pr.bytes} B` }) }
      await go(page, l.ipd); await page.getByRole('button', { name: 'Day sheet', exact: true }).first().click().catch(() => {}); await wait(page, 3000)
      r.check({ id: 'RD-12', role: 'doctor', screen: '/ipd/[id] Day sheet', title: 'The USG report shows on Lakshmi\'s Day sheet (Scans)', ok: /Ultrasound Abdomen[^.]{0,40}reported/i.test(await text(page)) })
    })
  },
} satisfies Flow
