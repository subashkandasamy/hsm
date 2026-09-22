const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await ctx.addCookies(jar.map(c => ({ name: c.name, value: c.value, domain: 'demo.localhost', path: '/', httpOnly: false, secure: false, sameSite: 'Lax' })))
const page = await ctx.newPage()
await page.goto(`http://demo.localhost:3000${process.env.PATH_}`, { waitUntil: 'networkidle', timeout: 120000 })
await page.waitForTimeout(4000)
const cards = await page.evaluate(() => {
  const out = []
  document.querySelectorAll('main div, main section').forEach(el => {
    const r = el.getBoundingClientRect()
    if (r.height < 150 || r.width < 500) return
    const head = el.querySelector('h1,h2,h3,p.font-semibold,p.text-sm.font-semibold')
    const t = (head?.textContent || '').trim().slice(0, 44)
    if (!t) return
    out.push({ tag: el.tagName.toLowerCase(), cls: (el.className||'').toString().slice(0,52), h: Math.round(r.height), text: t })
  })
  return out.slice(0, 26)
})
cards.forEach(c => console.log(`${c.h.toString().padStart(5)}px  ${c.tag}.${c.cls.padEnd(52)} "${c.text}"`))
await browser.close()
