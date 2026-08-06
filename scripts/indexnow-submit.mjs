// IndexNow submitter — instantly notifies Bing / Yandex / Seznam (and any
// IndexNow-participating engine) about our URLs. Google does NOT use IndexNow.
//
// Setup: the key file lives at public/<KEY>.txt and is served at
//   https://www.uyirly.com/<KEY>.txt
// The key file MUST be live (deployed) before submitting, or engines reject it.
//
// Usage:
//   node scripts/indexnow-submit.mjs            # submit every URL in the sitemap
//   node scripts/indexnow-submit.mjs <url> ...  # submit specific URLs

const KEY = '6ede9e2411445546ad84ace40fe6c671'
const HOST = 'www.uyirly.com'
const SITE = `https://${HOST}`
const KEY_LOCATION = `${SITE}/${KEY}.txt`

async function sitemapUrls() {
  const res = await fetch(`${SITE}/sitemap.xml`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  const xml = await res.text()
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim())
}

async function main() {
  const args = process.argv.slice(2)
  const urlList = args.length ? args : await sitemapUrls()
  if (!urlList.length) { console.error('No URLs to submit.'); process.exit(1) }

  console.log(`Submitting ${urlList.length} URLs to IndexNow…`)
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList }),
  })
  // 200 = accepted, 202 = accepted (validation pending). Anything else is an error.
  console.log(`IndexNow responded: ${res.status} ${res.statusText}`)
  if (res.status !== 200 && res.status !== 202) {
    console.error(await res.text())
    process.exit(1)
  }
  console.log('Done.')
}

main().catch((e) => { console.error(e); process.exit(1) })
