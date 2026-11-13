/*
 * Uyirly — SwiftEHR screen recorder (read-only). Step 1 of the migration.
 *
 * Paste this into the browser console of a SwiftEHR tab you are ALREADY
 * signed in to (F12 → Console → paste → Enter). Then click through the
 * screens listed in migration/swiftehr/README.md. When done, type
 *     uyirlySave()
 * and press Enter (or click Save on the green Uyirly badge, bottom-left).
 * A file named swiftehr-map-<date>.json downloads — give it to Uyirly.
 *
 * SwiftEHR switches the console's messages off, so a small green badge in the
 * bottom-left corner shows that it is recording and how much it has seen.
 *
 * What it records, for each data request the screens make:
 *   - the request address (no host) and method
 *   - the NAMES of query parameters and request-body fields
 *   - the VALUES only of paging / date / location settings (page, size,
 *     fromDate, locationId …) and only when they are numbers, dates or a short
 *     word — so the extractor knows how to page through the whole history
 *   - the NAMES and TYPES of fields in the reply (e.g. "mobileNo: string(10)")
 *   - how many records came back, and any total/count numbers
 * What it NEVER records:
 *   - your password, login token or any request header
 *   - patient names, phone numbers, addresses, ids or any other values
 * It sends nothing anywhere; the file only goes where you save it.
 * Closing or reloading the tab switches it off.
 */
(() => {
  if (window.__uyirlyRec) { console.log('Uyirly recorder is already running. Type uyirlySave() when done.'); return }
  const log = []
  const seen = new Map()
  window.__uyirlyRec = log

  // The badge: proof it is on, a running count, and a Save button. SwiftEHR
  // silences console.log, so this is the only feedback a person can see.
  const badge = document.createElement('div')
  badge.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:2147483647;display:flex;align-items:center;gap:10px;' +
    'padding:10px 14px;border-radius:12px;background:#0D9488;color:#fff;font:600 13px/1.3 system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25)'
  const label = document.createElement('span')
  label.textContent = 'Uyirly recorder ON · 0 kinds of data seen'
  const saveBtn = document.createElement('button')
  saveBtn.textContent = 'Save'
  saveBtn.style.cssText = 'border:0;border-radius:8px;padding:6px 12px;background:#fff;color:#0D9488;font:700 13px system-ui,sans-serif;cursor:pointer'
  badge.append(label, saveBtn)
  document.body.appendChild(badge)
  const updateBadge = () => { label.textContent = `Uyirly recorder ON · ${log.length} kinds of data seen` }

  // Settings whose values are safe to keep: paging, dates, location, sort.
  const SAFE_NAME = /^(page|pageno|pagenumber|pageindex|size|pagesize|limit|offset|start|length|rows|locationid|orgid|organisationid|organizationid|branchid|fromdate|todate|startdate|enddate|from|to|datefrom|dateto|status|type|sort|sortby|order|orderby|direction|isactive|active)$/i
  const safeValue = (v) => {
    if (typeof v === 'number' || typeof v === 'boolean') return v
    if (typeof v !== 'string') return undefined
    if (/^-?\d{1,6}$/.test(v)) return v                          // a page number, a size, a location id
    if (/^\d{2,4}[-/]\d{2}[-/]\d{2,4}([T ][\d:.Z+-]*)?$/.test(v)) return v   // a date
    if (/^[A-Za-z_]{1,16}$/.test(v)) return v                     // "asc", "ACTIVE", "OPD"
    return undefined
  }
  const settings = (pairs) => {
    const out = {}
    for (const [k, v] of pairs) {
      if (!SAFE_NAME.test(k)) continue
      const s = safeValue(v)
      if (s !== undefined) out[k] = s
    }
    return Object.keys(out).length ? out : undefined
  }

  // Shape of a value: field names and types only, never the values.
  const shape = (v, depth = 0) => {
    if (v === null) return 'null'
    if (Array.isArray(v)) return depth > 4 ? `array(${v.length})` : { array: v.length, item: v.length ? shape(v[0], depth + 1) : 'empty' }
    if (typeof v === 'object') {
      if (depth > 4) return 'object'
      const o = {}
      for (const k of Object.keys(v).slice(0, 150)) o[k] = shape(v[k], depth + 1)
      return o
    }
    if (typeof v === 'string') {
      if (/^\d{4}-\d{2}-\d{2}/.test(v)) return 'date'
      return `string(${v.length})`
    }
    if (typeof v === 'number') return 'number'
    return typeof v
  }
  // Record counts are safe to keep (they say how much data exists). Only keys
  // that name a count — "encounterId" contains "count" and "totalAmount" is a
  // bill's money, so ids and amounts are refused by name.
  const COUNT_KEY = /^(count|total|totalcount|totalrecords|totalelements|totalpages|recordstotal|recordsfiltered|numberofelements|[a-z]*count)$/i
  const NOT_COUNT = /id$|amount|price|percent|rate|value|no$|number$|code$/i
  const isCount = (k, x) => typeof x === 'number' && COUNT_KEY.test(k) && !NOT_COUNT.test(k)
  const totals = (v) => {
    const out = {}
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k, x] of Object.entries(v)) {
        if (isCount(k, x)) out[k] = x
        if (x && typeof x === 'object' && !Array.isArray(x)) for (const [k2, y] of Object.entries(x)) {
          if (isCount(k2, y)) out[`${k}.${k2}`] = y
        }
      }
    }
    return out
  }
  const parseUrl = (url) => {
    try { return new URL(url, location.href) } catch { return null }
  }
  const clean = (u, raw) => {
    if (!u) return String(raw).split('?')[0]
    const params = [...u.searchParams.keys()].join('&')
    // Ids inside the path become {id} — a path like /patient/12345 names a patient.
    const path = u.pathname.replace(/\/\d{2,}(?=\/|$)/g, '/{id}').replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}(?=\/|$)/gi, '/{uuid}')
    return path + (params ? `?${params}` : '')
  }
  const body = (b) => {
    try {
      const j = typeof b === 'string' ? JSON.parse(b) : null
      if (!j || typeof j !== 'object' || Array.isArray(j)) return {}
      return { fields: Object.keys(j), settings: settings(Object.entries(j)) }
    } catch { return {} }
  }
  const record = (method, url, status, text, reqBody) => {
    const u = parseUrl(url)
    const path = clean(u, url)
    const first = (text || '').trimStart().charAt(0)
    if (first !== '{' && first !== '[') return          // only JSON data replies
    let json = null
    try { json = JSON.parse(text) } catch { return }
    const key = `${method} ${path}`
    const b = body(reqBody)
    const entry = {
      screen: location.hash || location.pathname,
      method, path, status,
      querySettings: u ? settings([...u.searchParams.entries()]) : undefined,
      requestFields: b.fields || null,
      bodySettings: b.settings,
      records: Array.isArray(json) ? json.length
        : (Array.isArray(json?.data) ? json.data.length
          : Array.isArray(json?.content) ? json.content.length
            : Array.isArray(json?.data?.content) ? json.data.content.length : null),
      totals: { ...totals(json), ...(json?.data && typeof json.data === 'object' ? totals(json.data) : {}) },
      shape: shape(json),
      at: new Date().toISOString(),
    }
    if (seen.has(key)) {
      const e = seen.get(key); e.times++; e.screens.add(entry.screen)
      // Keep every distinct paging/date setting seen — they show how it pages.
      const s = JSON.stringify({ q: entry.querySettings, b: entry.bodySettings })
      if (!e.settingsSeen.has(s) && e.settingsSeen.size < 8) e.settingsSeen.add(s)
      return
    }
    entry.times = 1; entry.screens = new Set([entry.screen])
    entry.settingsSeen = new Set([JSON.stringify({ q: entry.querySettings, b: entry.bodySettings })])
    seen.set(key, entry); log.push(entry)
    updateBadge()
    console.log(`%cUyirly recorded: ${key}`, 'color:#0D9488')
  }

  // XMLHttpRequest (Angular HttpClient uses this)
  const open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.open = function (m, u) { this.__u = { m, u }; return open.apply(this, arguments) }
  XMLHttpRequest.prototype.send = function (b) {
    this.addEventListener('load', () => {
      try { if (!this.responseType || this.responseType === 'text' || this.responseType === 'json') record(this.__u.m, this.__u.u, this.status, this.responseType === 'json' ? JSON.stringify(this.response) : this.responseText, b) } catch { /* never break the app */ }
    })
    return send.apply(this, arguments)
  }
  // fetch
  const f = window.fetch
  window.fetch = async function (input, init) {
    const res = await f.apply(this, arguments)
    try {
      const url = typeof input === 'string' ? input : input.url
      res.clone().text().then((t) => record((init?.method || 'GET').toUpperCase(), url, res.status, t, init?.body)).catch(() => {})
    } catch { /* never break the app */ }
    return res
  }

  window.uyirlySave = () => {
    const out = log.map((e) => ({ ...e, screens: [...e.screens], settingsSeen: [...e.settingsSeen].map((s) => JSON.parse(s)) }))
    const blob = new Blob([JSON.stringify({ recordedAt: new Date().toISOString(), app: location.host, requests: out }, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `swiftehr-map-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a); a.click(); a.remove()
    console.log(`%cUyirly: saved ${out.length} kinds of data request. Give the downloaded file to Uyirly.`, 'color:#0D9488;font-weight:bold')
    label.textContent = `Saved ${out.length} kinds ✓ — keep clicking, or close this tab when done`
  }
  saveBtn.addEventListener('click', () => window.uyirlySave())
  console.log('%cUyirly recorder is ON. Now click through SwiftEHR. When finished, type  uyirlySave()  and press Enter.', 'color:#0D9488;font-weight:bold')
})()
