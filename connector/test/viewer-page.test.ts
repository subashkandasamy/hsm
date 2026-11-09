import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { renderPage } from '../src/viewer/page.js'

/**
 * The full-size viewer must start closed, open on a tap and close on ×.
 *
 * Seen at Karur, 9 Nov 2026, on the first X-ray: the overlay's display:flex
 * outranked the hidden attribute, so it covered the page from the start,
 * empty, and × did nothing.
 */
const files = [0, 1].map((i) => ({ file: `/nowhere/${i}.dcm`, seriesUid: `s${i}` }))
const html = await renderPage('1.2.3', files as never, 'e=1&s=x')

// Uses an installed Chrome (CHROME_PATH, or the usual macOS place); this test
// is run by hand, not in npm test, because the connector ships no browser.
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
})
let failures = 0
try {
  const page = await browser.newPage()
  await page.setContent(html)
  const step = async (name: string, fn: () => Promise<void>) => {
    try { await fn(); console.log(`  ok    ${name}`) } catch (e) { failures++; console.log(`  FAIL  ${name}\n        ${(e as Error).message}`) }
  }
  await step('opens closed', async () => assert.equal(await page.locator('#big').isVisible(), false))
  await step('a thumbnail opens it on that image', async () => {
    await page.locator('.tile').nth(1).click()
    assert.equal(await page.locator('#big').isVisible(), true)
    assert.match((await page.locator('#bigimg').getAttribute('src')) ?? '', /\/image\/1\?/)
    assert.equal(await page.locator('#pos').textContent(), '2 of 2')
  })
  await step('× closes it', async () => {
    await page.locator('#close').click()
    assert.equal(await page.locator('#big').isVisible(), false)
  })
  await step('Escape closes it too', async () => {
    await page.locator('.tile').first().click()
    await page.keyboard.press('Escape')
    assert.equal(await page.locator('#big').isVisible(), false)
  })
} finally { await browser.close() }
console.log(failures ? `\n${failures} FAILED\n` : '\nAll passed\n')
process.exit(failures ? 1 : 0)
