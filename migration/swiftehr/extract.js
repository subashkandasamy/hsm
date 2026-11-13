/*
 * Uyirly — SwiftEHR extractor (READ-ONLY). Step 2 of the migration.
 *
 * Paste into the console of a SwiftEHR tab you are signed in to as admin
 * (F12 → Console → paste → Enter). A green panel (bottom-left) shows progress.
 * It saves files named swiftehr-<part>-<NNN>.json into Downloads as it goes —
 * Chrome asks once to "allow multiple downloads": click Allow.
 *
 * The first time, it offers a TRIAL — the latest 25 patients and last month's
 * bills, a few minutes — so the files can be checked before the full copy.
 * Safe to stop at any time: close the tab, or press Pause. Paste it again
 * later (in a signed-in tab) and the full copy carries on from the last file.
 *
 * What it does:
 *   - asks SwiftEHR's own data server for records, the same way SwiftEHR's
 *     screens do, using the sign-in already in this tab
 *   - ONLY addresses on the READS list below. Anything else is refused before
 *     it is sent — it cannot save, edit, cancel or discharge anything.
 *   - 3 requests at a time with a short gap, so the hospital's screens stay fast
 * The files hold patient data. Keep them on this computer and move them into
 * hms/migration/swiftehr/raw/ (git-ignored). Never email or upload them.
 */
(async () => {
  if (window.__uyirlyX) { window.__uyirlyX.show(); return }

  const API = 'https://app.swiftehr.com:9090/swiftehr-v2/'
  const STATE_KEY = 'uyirly-extract-v1'
  const VERSION = 2
  const PARALLEL = 3
  const GAP_MS = 120
  const PART_BYTES = 20e6
  const START_MONTH = '2022-01'
  const PAGE = 50

  const user = (() => { try { return JSON.parse(localStorage.getItem('userInfo') || 'null') } catch { return null } })()
  const LOC = user?.location?.[0]?.id ?? 18
  const FAC = user?.userInfo?.body?.orgId ?? 18

  // ── The only addresses this script may call. Reads only. ─────────────────
  const READS = {
    GET: [
      'getPatient', 'getPatientViewHistory', 'fileUpload/getuploadedFiles', 'overview/getOverviewByPatientId',
      'answers/v2-caseSheet/{id}', 'getMedication', 'op-lab-test-request', 'selected-lab-test',
      'scan/op-prescriptions-list', 'getPatientDetailsByAdmissionId', 'getdischargeDetail',
      'notes/getAllProgressNotesDetails', 'ipchart/getChart', 'getIpPrescriptionList', 'lab-test-request',
      'ip-radiology', 'scan/ip-prescriptions-list', 'patientService/getAllPatientServices',
      'refund/getOverAllReturnList', 'ip-beddays-duration/{id}',
      'billDetails', 'bill-details/op/{id}', 'lab/getLabListByEncounterId', 'bill-items',
      'pharmacy/getPharmacyBillDetails', 'billReceipts', 'pharmacy/getPharmacyReceiptsByBillId',
      'people/getDoctors', 'item/getCharges', 'getItemCategory', 'room/getAllRoomType', 'insurance/master',
      'grn/{id}/items',
      // inpatient pharmacy, per admission (SwiftEHR's IP pharmacy screen)
      'ip-prescriptionByStatus', 'getIpMedicationByPrescription', 'pharmacy/bill-receipts', 'pharmacy/getPharmacyAmounts',
    ],
    POST: [
      'getAllPatient', 'view-lab-report-group', 'getIpMedication', 'app/getIoRecords', 'bills',
      'appointments/searchAppointment', 'people/getAllStaff', 'lab-test-list', 'lab-test-package-list',
      'insurance/master-list', 'room/getAllRoomsDetailsPagination', 'ward/getAllWardDetailsPagination',
      'bed/getAllBedDetailsPagination', 'supplier/getAllSupplierPagination', 'item/getAllItem', 'grn/all-grn',
      'grn/purchase-payments', 'reports/get-AdmittedPatientReport', 'reports/get-DischaredPatientReport',
      'insurance/bills',
    ],
  }
  const allowed = (verb, path) => (READS[verb] || []).includes(path.replace(/\/\d+(?=\/|$)/g, '/{id}'))

  // ── State (no patient data — only where we are) ─────────────────────────
  let TRIAL = false
  // State: which parts are done, which part is under way and where in it.
  // A state saved by the first version (parts by number) is read too; its
  // patients part counts as NOT done if no patient was copied.
  const ORDER = ['masters', 'patients', 'bills', 'appointments', 'purchases', 'checks']
  const loadState = () => {
    try {
      const s = JSON.parse(localStorage.getItem(STATE_KEY) || 'null')
      if (s?.v === VERSION) return s
      if (s?.v === 1) {
        return { ...s, v: VERSION, current: ORDER[s.phase] || null, done: ORDER.slice(0, s.phase).filter((n) => n !== 'patients' || s.stats?.counts?.patients), only: null }
      }
    } catch { /* unreadable */ }
    return null
  }
  let st = loadState() || { v: VERSION, current: null, unit: 0, done: [], only: null, parts: {}, stats: { requests: 0, errors: {}, counts: {} }, startedAt: new Date().toISOString() }
  const resuming = !!loadState()
  const saveState = () => { if (TRIAL) return; try { localStorage.setItem(STATE_KEY, JSON.stringify(st)) } catch { /* full */ } }

  // ── Panel ────────────────────────────────────────────────────────────────
  document.getElementById('uyirly-extract')?.remove()
  const box = document.createElement('div')
  box.id = 'uyirly-extract'
  box.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:2147483647;width:340px;padding:12px 14px;border-radius:12px;' +
    'background:#0D9488;color:#fff;font:500 13px/1.4 system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25)'
  const title = document.createElement('div'); title.style.fontWeight = '700'; title.textContent = 'Uyirly — copying SwiftEHR data (read-only)'
  const line1 = document.createElement('div'); const line2 = document.createElement('div'); line2.style.opacity = '.85'
  const btns = document.createElement('div'); btns.style.cssText = 'display:flex;gap:8px;margin-top:8px'
  const mkBtn = (t) => { const b = document.createElement('button'); b.textContent = t; b.style.cssText = 'border:0;border-radius:8px;padding:5px 10px;background:#fff;color:#0D9488;font:700 12px system-ui,sans-serif;cursor:pointer'; btns.appendChild(b); return b }
  const pauseBtn = mkBtn('Pause')
  box.append(title, line1, line2, btns)
  document.body.appendChild(box)
  let paused = false
  pauseBtn.onclick = () => { paused = !paused; pauseBtn.textContent = paused ? 'Resume' : 'Pause'; if (paused) line2.textContent = 'Paused — press Resume, or close the tab and paste again later.' }
  const say = (a, b) => { if (a != null) line1.textContent = a; if (b != null) line2.textContent = b }
  window.__uyirlyX = { show: () => { box.style.display = 'block' } }

  // ── Requests: allow-list, 3 at a time, retries, sign-out wait ───────────
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  let active = 0
  const queue = []
  const acquire = () => new Promise((r) => { if (active < PARALLEL) { active++; r() } else queue.push(r) })
  const release = () => { setTimeout(() => { const n = queue.shift(); if (n) n(); else active-- }, GAP_MS) }
  const err = (key) => { st.stats.errors[key] = (st.stats.errors[key] || 0) + 1 }

  async function call(verb, path, query, body) {
    if (!allowed(verb, path)) throw new Error(`refused (not a read on the list): ${verb} ${path}`)
    const qs = query ? '?' + Object.entries(query).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&') : ''
    const key = `${verb} ${path.replace(/\/\d+(?=\/|$)/g, '/{id}')}`
    for (let attempt = 0; attempt < 6; attempt++) {
      while (paused) await wait(500)
      await acquire()
      let res, text
      try {
        const headers = { Authorization: localStorage.getItem('token') || '' }
        const hist = localStorage.getItem('x-login-history-id'); if (hist) headers['x-login-history-id'] = hist
        if (body !== undefined) headers['Content-Type'] = 'application/json'
        res = await fetch(API + path + qs, { method: verb, headers, credentials: 'omit', body: body !== undefined ? JSON.stringify(body) : undefined })
        text = await res.text()
        st.stats.requests++
      } catch { res = null } finally { release() }
      if (!res) { await wait(2000 * (attempt + 1)); continue }
      if (res.status === 401 || res.status === 403) {
        if (await signedIn()) { err(`${key} → ${res.status}`); return { __error: res.status } }   // this address only
        say(null, 'SwiftEHR signed this tab out. Sign in again (another tab is fine) — it continues by itself.')
        await wait(30000); attempt--; continue
      }
      if (res.status === 429 || res.status >= 500) { await wait(3000 * (attempt + 1)); continue }
      if (!res.ok) { err(`${key} → ${res.status}`); return { __error: res.status } }
      if (!text) return null
      try { return JSON.parse(text) } catch { return { __text: text.slice(0, 20000) } }
    }
    err(`${key} → gave up`)
    return { __error: 'gave up' }
  }
  // Is the sign-in still good? One known-good read decides between
  // "signed out" (wait) and "this address is not allowed for this login" (skip).
  let probe = null
  const signedIn = () => probe || (probe = (async () => {
    try {
      const headers = { Authorization: localStorage.getItem('token') || '' }
      const hist = localStorage.getItem('x-login-history-id'); if (hist) headers['x-login-history-id'] = hist
      const r = await fetch(`${API}people/getDoctors?locationId=${LOC}`, { headers, credentials: 'omit' })
      return r.ok
    } catch { return false } finally { probe = null }   // never reuse an old answer
  })())
  const get = (path, query) => call('GET', path, query)
  const post = (path, body, query) => call('POST', path, query, body)
  const bad = (r) => r == null || (r && typeof r === 'object' && '__error' in r)

  // ── Lists: pull every page ───────────────────────────────────────────────
  const listOf = (r) => Array.isArray(r) ? r : (r?.dataArr || r?.patientList || r?.content || r?.data?.content || (Array.isArray(r?.data) ? r.data : null) || [])
  const countOf = (r) => [r?.count, r?.patientCount, r?.totalElements, r?.totalCount, r?.data?.totalElements].find((x) => typeof x === 'number')
  async function pageAll(fetchPage, size = PAGE, cap = 2000) {
    const rows = []
    let total
    for (let p = 0; p < cap; p++) {
      const r = await fetchPage(p, size)
      if (bad(r)) { rows.__error = r?.__error; break }
      const got = listOf(r)
      if (total === undefined) total = countOf(r)
      rows.push(...got)
      if (!got.length) break
      if (total !== undefined ? rows.length >= total : got.length < size) break
    }
    rows.__total = total
    return rows
  }

  // ── Output files ─────────────────────────────────────────────────────────
  let buf = []
  let bufBytes = 0
  const add = (item) => { const s = JSON.stringify(item); bufBytes += s.length; buf.push(s) }
  function flush(name, unitFrom, unitTo, force) {
    if (!buf.length && !force) return
    const n = (st.parts[name] || 0) + 1
    st.parts[name] = n
    const head = JSON.stringify({ source: 'swiftehr', part: name, number: n, savedAt: new Date().toISOString(), locationId: LOC, units: [unitFrom, unitTo] })
    const blob = new Blob([head.slice(0, -1), ',"items":[', buf.join(','), ']}'], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `swiftehr-${TRIAL ? 'trial-' : ''}${name}-${String(n).padStart(3, '0')}.json`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 60000)
    buf = []; bufBytes = 0
  }
  const count = (k, n = 1) => { st.stats.counts[k] = (st.stats.counts[k] || 0) + n }

  // ── Dates ────────────────────────────────────────────────────────────────
  const pad = (n) => String(n).padStart(2, '0')
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const dmy = (d) => `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`
  const parseDay = (s) => {
    if (typeof s !== 'string') return null
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return new Date(+m[1], +m[2] - 1, +m[3])
    m = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/); if (m) return new Date(+m[3], +m[2] - 1, +m[1])
    return null
  }
  const months = () => {
    const out = []; const [y0, m0] = START_MONTH.split('-').map(Number); const now = new Date()
    for (let d = new Date(y0, m0 - 1, 1); d <= now; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
      out.push({ key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, from: ymd(d), to: ymd(end) })
    }
    return out
  }
  const findDate = (obj, re, depth = 0) => {
    if (!obj || typeof obj !== 'object' || depth > 3) return null
    for (const [k, v] of Object.entries(obj)) {
      if (re.test(k) && parseDay(v)) return parseDay(v)
      if (v && typeof v === 'object') { const d = findDate(v, re, depth + 1); if (d) return d }
    }
    return null
  }

  // ── One patient, everything SwiftEHR holds about them ───────────────────
  async function opVisit(p, v) {
    const enc = v.visitId
    const out = { visit: v }
    out.caseSheet = await get(`answers/v2-caseSheet/${enc}`)
    const rxId = out.caseSheet?.encounter?.prescriptionId
    const [rx, labReqs, scans] = await Promise.all([
      get('getMedication', { encounterId: enc, prescriptionId: rxId || undefined }),
      get('op-lab-test-request', { patientId: p, encounterId: enc }),
      get('scan/op-prescriptions-list', { encounterId: enc, type: 'addScan' }),
    ])
    Object.assign(out, { prescription: rx, labRequests: labReqs, scans })
    out.labs = await Promise.all(listOf(labReqs).map(async (q) => ({
      labTestRequestId: q.labTestRequestId,
      items: await get('selected-lab-test', { patientId: p, saveId: enc, labTestRequestId: q.labTestRequestId, type: 'OP' }),
      report: await post('view-lab-report-group', [q.labTestRequestId], { id: enc, module: 'OP', requestNo: 'single' }),
    })))
    count('opVisits')
    return out
  }

  async function ipVisit(p, v) {
    const adm = v.visitId
    const out = { visit: v }
    const [details, discharge, notes, chart, rx, rxDischarge, labReqs, radiology, scans, services, overview, returns, stay] = await Promise.all([
      get('getPatientDetailsByAdmissionId', { admissionId: adm }),
      get('getdischargeDetail', { patientId: p, admissionId: adm }),
      get('notes/getAllProgressNotesDetails', { patientId: p, admissionId: adm, locationId: LOC }),
      get('ipchart/getChart', { facilityId: FAC, locationId: LOC, patientId: p, admissionId: adm }),
      get('getIpPrescriptionList', { admissionId: adm, dischargeSummaryMedicine: false }),
      get('getIpPrescriptionList', { admissionId: adm, dischargeSummaryMedicine: true }),
      get('lab-test-request', { patientId: p, admissionId: adm }),
      get('ip-radiology', { admissionId: adm }),
      get('scan/ip-prescriptions-list', { admissionId: adm, type: 'viewScan' }),
      get('patientService/getAllPatientServices', { patientId: p, locationId: LOC, admissionId: adm }),
      get('overview/getOverviewByPatientId', { patientId: p, admissionId: adm }),
      get('refund/getOverAllReturnList', { admissionId: adm }),
      get(`ip-beddays-duration/${adm}`),
    ])
    Object.assign(out, { details, discharge, notes, chart, prescriptions: rx, dischargeMedicines: rxDischarge, labRequests: labReqs, radiology, scans, services, overview, returns, stay })
    if (v.billId) out.bill = { lines: await get('billDetails', { billId: v.billId }), receipts: await get('billReceipts', { billId: v.billId }) }
    out.labs = await Promise.all(listOf(labReqs).filter((q) => q.labTestRequestId).map(async (q) => ({
      labTestRequestId: q.labTestRequestId,
      items: await get('selected-lab-test', { patientId: p, saveId: adm, labTestRequestId: q.labTestRequestId, type: 'IP' }),
      report: await post('view-lab-report-group', [q.labTestRequestId], { id: adm, module: 'IP', requestNo: 'single' }),
    })))
    // Medication chart and intake/output are kept one day at a time.
    const start = parseDay(v.admissionDate) || findDate(details, /^(admission|admit|allot)\w*date/i) || parseDay(v.visitDate)
    // Discharge date: the admission's bill has it, and so does the bed-stay
    // record (endDate); the discharge summary does not (checked 13 Nov 2026).
    const stayEnds = listOf(stay).map((x) => parseDay(x?.endDate)).filter(Boolean).sort((a, b) => b - a)
    let end = parseDay(out.bill?.lines?.dischargeDate) || stayEnds[0] || findDate(discharge, /^discharge\w*date/i) || findDate(details, /^discharge\w*date/i)
    out.daysGuessed = !end
    if (!end) { end = new Date(); if (start && (end - start) / 864e5 > 45) end = new Date(start.getTime() + 45 * 864e5) }
    out.days = []
    if (start) {
      const days = []
      for (let d = new Date(start); d <= end && days.length < 120; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) days.push(new Date(d))
      out.days = await Promise.all(days.map(async (d) => {
        const [med, io] = await Promise.all([
          post('getIpMedication', { date: dmy(d), patientId: p, admissionId: adm }),
          post('app/getIoRecords', { facilityId: FAC, locationId: LOC, patientId: p, admissionId: adm, date: dmy(d) }),
        ])
        return { date: ymd(d), medication: med, io }
      }))
    }
    count('admissions')
    return out
  }

  async function patient(row) {
    const p = row.patientId
    const [detail, history, files] = await Promise.all([
      get('getPatient', { patientId: p, locationId: LOC }),
      get('getPatientViewHistory', { patientId: p, locationId: LOC }),
      get('fileUpload/getuploadedFiles', { patientId: p, locationId: LOC }),
    ])
    const visits = []
    for (const v of listOf(history)) {
      const t = String(v.visitType || '').toUpperCase()
      if (t === 'IP') visits.push(await ipVisit(p, v))
      else if (t === 'OP') visits.push(await opVisit(p, v))
      else visits.push({ visit: v, note: 'unknown visit type' })
    }
    count('patients')
    return { patient: row, detail, history, files, visits }
  }

  // ── Bills ────────────────────────────────────────────────────────────────
  const BILL_STATUS = ['PAID', 'UNPAID', 'PARTIALLY PAID', 'CANCELLED']
  const BILL_TYPES = ['ip', 'op', 'lab', 'scan']
  // Pharmacy sales are the same list asked for "op pharmacy" / "ip pharmacy"
  // (SwiftEHR's pharmacy screen); "pharmacy" alone returns nothing.
  const PHARMACY_TYPES = ['op pharmacy', 'ip pharmacy']
  const empty = (r) => r == null || (Array.isArray(r) && !r.length) || (typeof r === 'object' && !Array.isArray(r) && !Object.keys(r).length)
  async function firstGood(...calls) {
    let last = null
    for (const c of calls) { const r = await c(); if (!bad(r) && !empty(r)) return r; last = r ?? last }
    return last
  }
  async function billDetail(type, row) {
    const id = row.billId
    if (!id) return { bill: row, note: 'no billId' }
    const lines = await (type === 'ip' ? get('billDetails', { billId: id })
      : type === 'op' ? get(`bill-details/op/${id}`)
        : type === 'lab' ? firstGood(() => get('lab/getLabListByEncounterId', { encounterId: row.encounterId ?? 0, billId: id }), () => get('bill-items', { billId: id, type: 'lab' }))
          : type === 'scan' ? get('bill-items', { billId: id, type: 'scan' })
            : firstGood(() => get('pharmacy/getPharmacyBillDetails', { billId: id }), () => get('bill-items', { billId: id, type: 'pharmacy' })))
    const receipts = type.includes('pharmacy')
      ? await firstGood(() => get('pharmacy/getPharmacyReceiptsByBillId', { billId: id }), () => get('billReceipts', { billId: id }))
      : await get('billReceipts', { billId: id })
    count(`bills.${type}`)
    return { type, bill: row, lines, receipts }
  }
  // Bill ids already copied, kept with the state so a resume never repeats one
  // (some lists may ignore the dates and return the same bills every month).
  const billSets = {}
  const billSeen = (type) => billSets[type] || (billSets[type] = new Set((st.billIds?.[type]) || []))
  // Merge, never replace: before the bills part has started, billSets is
  // empty, and replacing would wipe the ids a previous run had saved.
  const keepBillIds = () => { st.billIds = { ...(st.billIds || {}), ...Object.fromEntries(Object.entries(billSets).map(([t, set]) => [t, [...set].filter((x) => typeof x === 'number')])) } }
  const billPage = (type, from, to, filterData) => (p, size) => post('bills', {
    billType: type, locationId: LOC, facilityId: FAC, startDate: `${from} 00:00:00`, endDate: `${to} 23:59:59`,
    searchData: {}, pageNo: p, pageSize: size, filterData,
  }, { type })

  // ── Phases: each is a list of units; a file is saved at unit boundaries ─
  let monthList = months()
  let patientsSorted = null
  async function loadPatients() {
    if (patientsSorted) return patientsSorted
    say('Listing patients…', '')
    // The list needs its status filter spelled out: an empty list matches
    // nobody, "none" is refused (checked against SwiftEHR, 13 Nov 2026).
    // 10 a page, as SwiftEHR's own screen asks: with a bigger page the next
    // page still moves on only 10 rows, so pages overlap (500 a page gave 560
    // different patients out of 3,174 — 13 Nov 2026).
    const rows = await pageAll((p, size) => post('getAllPatient', { filterData: ['ACTIVE', 'INACTIVE'] }, { locationId: LOC, pageSize: size, pageNo: p }), 10, 5000)
    if (!rows.length) throw new Error('SwiftEHR gave 0 patients — stopped, so nothing is skipped')
    const seen = new Set()
    const unique = rows.filter((r) => r.patientId && !seen.has(r.patientId) && seen.add(r.patientId))
    if (rows.__total && unique.length < rows.__total - 5) throw new Error(`patient list incomplete: ${unique.length} of ${rows.__total} — stopped, so nothing is skipped`)
    // Patients already in saved files (the runner passes their ids) are left out.
    const skip = new Set(window.UYIRLY_SKIP || [])
    patientsSorted = unique.filter((r) => !skip.has(r.patientId)).sort((a, b) => a.patientId - b.patientId)
    st.stats.counts.patientList = unique.length
    st.stats.counts.patientListTotal = rows.__total
    st.stats.counts.patientsAlreadySaved = skip.size
    return patientsSorted
  }

  // One month of one bill type: the list asked with and without the status
  // filter (SwiftEHR shows only some statuses unless asked), merged by bill id,
  // then each new bill's lines and receipts.
  async function billMonth(types, u) {
    const type = types[Math.floor(u / monthList.length)]
    const m = monthList[u % monthList.length]
    const a = await pageAll(billPage(type, m.from, m.to, BILL_STATUS))
    const b = await pageAll(billPage(type, m.from, m.to, []))
    if (a.__error && b.__error) err(`bills ${type} ${m.key} list → ${a.__error}`)
    const seen = billSeen(type)
    const rows = []
    for (const r of [...a, ...b]) {
      const id = r.billId ?? JSON.stringify(r)
      if (seen.has(id)) continue
      seen.add(id); rows.push(r)
    }
    const details = await Promise.all(rows.map((r) => billDetail(type, r)))
    for (const d of details) add(d)
    return `Bills — ${type.toUpperCase()} ${m.key}: ${rows.length} new`
  }

  const phases = [
    {
      name: 'masters',
      units: async () => 1,
      run: async () => {
        const listTotals = {}
        const pages = async (path, extra = {}) => {
          const rows = await pageAll((p, size) => post(path, { locationId: LOC, facilityId: FAC, pageSize: size, pageNo: p, searchData: {}, ...extra }))
          listTotals[path] = { got: rows.length, total: rows.__total ?? null }
          return rows
        }
        const ROOM = { buildingId: 0, roomId: 0, roomTypeId: 0, floorId: 0, filterData: ['ACTIVE', 'INACTIVE'] }
        const charges = {}
        for (const t of ['op', 'ip', 'lab', 'scan']) charges[t] = await get('item/getCharges', { itemType: t, locationId: LOC })
        add({
          kind: 'masters',
          doctors: await get('people/getDoctors', { locationId: LOC }),
          staff: await pages('people/getAllStaff'),
          charges,
          itemCategories: await get('getItemCategory'),
          labTests: await (async () => {
            const a = await pages('lab-test-list', { filterData: [] })
            const b = await pages('lab-test-list', { filterData: ['RESULT TYPE ADDED', 'RESULT TYPE NOT ADDED', 'OUTSOURCE'] })
            return b.length > a.length ? b : a
          })(),
          labPackages: await pages('lab-test-package-list', { filterData: [] }),
          insuranceProviders: await get('insurance/master'),
          insurance: await pages('insurance/master-list', { filterData: [] }),
          roomTypes: await get('room/getAllRoomType', { facilityId: FAC, locationId: LOC }),
          rooms: await pages('room/getAllRoomsDetailsPagination', ROOM),
          wards: await pages('ward/getAllWardDetailsPagination', ROOM),
          beds: await pages('bed/getAllBedDetailsPagination', ROOM),
          suppliers: await pages('supplier/getAllSupplierPagination'),
          pharmacyItems: await pages('item/getAllItem', { filterData: ['ACTIVE', 'INACTIVE'] }),
          listTotals,
        })
        return 'Hospital lists (doctors, staff, charges, lab tests, rooms, suppliers, medicines)'
      },
    },
    {
      name: 'patients',
      units: async () => TRIAL ? 1 : Math.ceil((await loadPatients()).length / 25),
      run: async (u) => {
        const list = await loadPatients()
        const slice = TRIAL ? list.slice(-25) : list.slice(u * 25, u * 25 + 25)
        const results = await Promise.all(slice.map((r) => patient(r)))
        for (const r of results) add(r)
        const saved = (window.UYIRLY_SKIP || []).length
        return `Patients ${Math.min((u + 1) * 25, list.length)} of ${list.length}${saved ? ` (+${saved} saved earlier)` : ''} — visits, admissions, labs`
      },
    },
    {
      name: 'bills',
      units: async () => BILL_TYPES.length * monthList.length,
      run: async (u) => billMonth(BILL_TYPES, u),
    },
    {
      name: 'pharmacy',
      units: async () => PHARMACY_TYPES.length * monthList.length,
      run: async (u) => billMonth(PHARMACY_TYPES, u),
    },
    {
      // Inpatient pharmacy is kept per admission, not as bills by month: the
      // "ip pharmacy" list gives one total per stay. The runner passes the
      // admissions already copied (window.UYIRLY_ADMISSIONS: [patientId, admissionId]).
      name: 'ippharmacy',
      units: async () => Math.ceil((window.UYIRLY_ADMISSIONS || []).length / 20),
      run: async (u) => {
        const batch = (window.UYIRLY_ADMISSIONS || []).slice(u * 20, u * 20 + 20)
        const out = await Promise.all(batch.map(async ([patientId, admissionId]) => {
          const list = await get('ip-prescriptionByStatus', { admissionId })
          const bills = await Promise.all(listOf(list).map(async (r) => ({
            row: r,
            lines: r.billId ? await firstGood(() => get('pharmacy/getPharmacyBillDetails', { billId: r.billId }), () => get('bill-items', { billId: r.billId, type: 'pharmacy' })) : null,
            medicines: r.prescriptionId ? await get('getIpMedicationByPrescription', { prescriptionId: r.prescriptionId }) : null,
          })))
          count('ipPharmacyBills', bills.length)
          return {
            patientId, admissionId, list, bills,
            receipts: await get('pharmacy/bill-receipts', { admissionId }),
            amounts: await get('pharmacy/getPharmacyAmounts', { admissionId }),
          }
        }))
        for (const o of out) add(o)
        const total = (window.UYIRLY_ADMISSIONS || []).length
        return `Inpatient pharmacy — admissions ${Math.min((u + 1) * 20, total)} of ${total}`
      },
    },
    {
      name: 'appointments',
      units: async () => monthList.length,
      run: async (u) => {
        const m = monthList[u]
        const page = (filterData) => (p, size) => post('appointments/searchAppointment', {
          locationId: LOC, appointmentDate: null, fromDate: `${m.from} 00:00:00`, toDate: `${m.to} 23:59:59`,
          pageSize: size, searchData: {}, pageNo: p, filterData, doctorId: null,
        })
        const a = await pageAll(page([]))
        const b = await pageAll(page(['SCHEDULED', 'RE-SCHEDULED', 'CANCELLED', 'COMPLETED', 'CHECKED IN', 'CHECKED-IN']))
        const ids = new Set()
        const rows = [...a, ...b].filter((r) => { const k = r.appointmentId ?? JSON.stringify(r); if (ids.has(k)) return false; ids.add(k); return true })
        for (const r of rows) add({ appointment: r })
        count('appointments', rows.length)
        return `Appointments ${m.key}: ${rows.length}`
      },
    },
    {
      name: 'purchases',
      units: async () => 1,
      run: async () => {
        const grns = await pageAll((p, size) => post('grn/all-grn', { locationId: LOC, pageSize: size, searchData: {}, pageNo: p }), PAGE, TRIAL ? 1 : 2000)
        for (const g of grns) {
          const id = g.grnId ?? g.id
          add({ grn: g, items: id ? await get(`grn/${id}/items`) : null })
        }
        count('grns', grns.length)
        for (const m of monthList) {
          const pays = await pageAll((p, size) => post('grn/purchase-payments', { locationId: LOC, facilityId: FAC, startDate: `${m.from} 00:00:00`, endDate: `${m.to} 23:59:59`, pageSize: size, searchData: {}, pageNo: p, filterData: [] }))
          for (const x of pays) add({ purchasePayment: x })
          count('purchasePayments', pays.length)
        }
        return `Purchases: ${grns.length} invoices`
      },
    },
    {
      name: 'checks',
      units: async () => TRIAL ? 0 : 1,
      run: async () => {
        // Hospital-wide lists to cross-check the per-patient copy against.
        const years = [...new Set(monthList.map((m) => m.key.slice(0, 4)))]
        for (const y of years) {
          for (const [type, path] of [['admitted', 'reports/get-AdmittedPatientReport'], ['discharged', 'reports/get-DischaredPatientReport']]) {
            add({ report: type, year: y, rows: await post(path, { fromDate: `${y}-01-01 00:00:00`, endDate: `${y}-12-31 23:59:59`, locationId: LOC, type }) })
          }
        }
        for (const type of ['op', 'ip']) add({ insuranceBills: type, rows: await pageAll((p, size) => post('insurance/bills', { locationId: LOC, searchData: {}, pageNo: p, pageSize: size, filterData: [], type })) })
        return 'Cross-check lists (admitted / discharged, insurance)'
      },
    },
  ]

  // ── Start: trial or full (a saved full copy just carries on) ───────────
  if (!resuming && window.UYIRLY_ONLY) {
    st.only = String(window.UYIRLY_ONLY)
    if (!phases.some((p) => p.name === st.only)) throw new Error(`no part called ${st.only}`)
    say(`Copying only: ${st.only}`, '')
  } else if (!resuming) {
    say('Choose how to start. Nothing is changed in SwiftEHR either way.', 'Trial: latest 25 patients + last month\'s bills (a few minutes).')
    pauseBtn.style.display = 'none'
    const trialBtn = mkBtn('Trial first'); const fullBtn = mkBtn('Copy everything'); const patBtn = mkBtn('Patients only')
    const pick = await new Promise((r) => { trialBtn.onclick = () => r('trial'); fullBtn.onclick = () => r('all'); patBtn.onclick = () => r('patients') })
    TRIAL = pick === 'trial'
    if (pick === 'patients') st.only = 'patients'
    trialBtn.remove(); fullBtn.remove(); patBtn.remove(); pauseBtn.style.display = ''
    if (TRIAL) {
      const now = new Date(); const last = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      monthList = [{ key: `${last.getFullYear()}-${pad(last.getMonth() + 1)}`, from: ymd(last), to: ymd(new Date(now.getFullYear(), now.getMonth(), 0)) }]
      title.textContent = 'Uyirly — TRIAL copy of SwiftEHR data (read-only)'
    }
  } else {
    say(`Carrying on from where it stopped (${st.current || 'next part'})…`, '')
  }

  // ── Run ─────────────────────────────────────────────────────────────────
  const t0 = Date.now(); const r0 = st.stats.requests
  const rate = () => { const s = (Date.now() - t0) / 1000; return s > 5 ? ((st.stats.requests - r0) / s).toFixed(1) : '…' }
  try {
    const todo = phases.filter((p) => (!st.only || p.name === st.only) && !st.done.includes(p.name))
      .sort((a, b) => (b.name === st.current) - (a.name === st.current))
    for (let i = 0; i < todo.length; i++) {
      const ph = todo[i]
      if (st.current !== ph.name) { st.current = ph.name; st.unit = 0 }
      if (ph.name === 'patients' && window.UYIRLY_SKIP) st.unit = 0   // resume by saved ids, not by position
      const total = await ph.units()
      let from = st.unit
      const ph0 = Date.now(); const u0 = st.unit
      for (; st.unit < total; st.unit++) {
        const label = await ph.run(st.unit, total)
        const errs = Object.values(st.stats.errors).reduce((a, b) => a + b, 0)
        const done = st.unit + 1 - u0
        const left = done ? Math.round(((Date.now() - ph0) / done) * (total - st.unit - 1) / 60000) : 0
        say(`${i + 1}/${todo.length} · ${label}`, `${st.stats.requests.toLocaleString()} requests · ${rate()}/s · ${errs} errors · files: ${Object.values(st.parts).reduce((a, b) => a + b, 0)}${left > 1 ? ` · this part ~${left} min left` : ''}`)
        // The first file of each part saves at once, so real replies can be checked early.
        if (bufBytes > PART_BYTES || st.unit === total - 1 || !st.parts[ph.name]) {
          flush(ph.name, from, st.unit)
          from = st.unit + 1
          keepBillIds()
          st.unit++; saveState(); st.unit--   // resume after this unit
        }
      }
      flush(ph.name, from, total - 1)
      st.done.push(ph.name); st.current = null; st.unit = 0; keepBillIds(); saveState()
    }
    add({ summary: st.stats, startedAt: st.startedAt, finishedAt: new Date().toISOString() })
    flush('summary', 0, 0, true)
    say(TRIAL ? 'Trial done ✓ — files are in Downloads.' : 'Done ✓ — every part is in Downloads.', 'Move the swiftehr-*.json files into hms/migration/swiftehr/raw/ and tell Uyirly.')
    if (!TRIAL) localStorage.removeItem(STATE_KEY)
    window.__uyirlyX = null
  } catch (e) {
    saveState()
    say(`Stopped: ${String(e?.message || e).slice(0, 140)}`, 'Nothing was changed in SwiftEHR. Tell Uyirly what this says.')
  }
})()
