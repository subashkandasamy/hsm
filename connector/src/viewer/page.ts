import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dataDir } from '../config.js'
import { renderDicomToPng, presetsFor, UnsupportedImage } from './render.js'
import { log } from '../log.js'

/**
 * Looking at a scan, from inside the hospital.
 *
 * ── Why the connector serves this rather than Uyirly ───────────────────────
 *
 * The images are on this computer and there are gigabytes of them. Uyirly runs
 * over HTTPS on the internet and cannot reach a private address to fetch them —
 * and since Chrome 142 a page may not even try without the viewer granting a
 * Local Network Access permission first.
 *
 * But a *link* is different. Opening http://192.168.1.14:5151/study/... in a
 * new tab is a plain navigation, which none of those rules touch. So Uyirly
 * shows the button and this serves the page, and nobody is prompted for
 * anything.
 *
 * The cost is that it only works inside the hospital. A doctor at home sees
 * nothing, and neither does the patient portal. That is a known gap and the
 * reason a small cloud copy is still worth doing later.
 */

const MAX_PREVIEW = 400   // a long CT would otherwise render for a minute

interface Found {
  studyUid: string
  seriesUid: string
  file: string
}

async function listStudyFiles(studyUid: string): Promise<Found[]> {
  const root = path.join(dataDir(), 'dicom', studyUid)
  const out: Found[] = []
  let series: string[]
  try {
    series = (await fs.readdir(root, { withFileTypes: true }))
      .filter((e) => e.isDirectory()).map((e) => e.name).sort()
  } catch { return [] }

  for (const s of series) {
    let files: string[]
    try {
      files = (await fs.readdir(path.join(root, s))).filter((f) => f.endsWith('.dcm')).sort()
    } catch { continue }
    for (const f of files) out.push({ studyUid, seriesUid: s, file: path.join(root, s, f) })
  }
  return out
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Handles the viewer's URLs. Returns false when the request is not ours, so
 * the status page keeps its own routes.
 */
export async function handleViewer(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts[0] !== 'study' || !parts[1]) return false

  const studyUid = decodeURIComponent(parts[1])
  // Refuse anything that could climb out of the images folder. The study id
  // arrives from a URL and must never be trusted as a path.
  if (studyUid.includes('..') || studyUid.includes('/') || studyUid.includes('\\')) {
    res.writeHead(400, { 'content-type': 'text/plain' })
    res.end('Bad study id')
    return true
  }

  const files = await listStudyFiles(studyUid)

  // /study/<uid>/image/<n>.png
  if (parts[2] === 'image') {
    const index = Number.parseInt(parts[3] ?? '', 10)
    const found = files[index]
    if (!found) { res.writeHead(404); res.end(); return true }
    try {
      const wanted = url.searchParams.get('w') ?? undefined
      const r = await renderDicomToPng(found.file, { window: wanted })
      res.writeHead(200, {
        'content-type': 'image/png',
        // Which window produced these bytes, so the page can say so without
        // decoding the image a second time.
        'x-window-applied': encodeURIComponent(r.applied),
        'x-window-guessed': r.guessed ? '1' : '0',
        // Safe to cache: the same window on the same image is the same picture.
        'cache-control': 'private, max-age=86400',
      })
      res.end(r.png)
    } catch (e) {
      const why = e instanceof UnsupportedImage ? e.message : 'This image could not be opened.'
      if (!(e instanceof UnsupportedImage)) {
        log.warn(`Could not render ${path.basename(found.file)}: ${(e as Error).message}`)
      }
      res.writeHead(415, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(why)
    }
    return true
  }

  // /study/<uid>/original/<n>.dcm — the untouched file, for a proper viewer.
  if (parts[2] === 'original') {
    const index = Number.parseInt(parts[3] ?? '', 10)
    const found = files[index]
    if (!found) { res.writeHead(404); res.end(); return true }
    const bytes = await fs.readFile(found.file)
    res.writeHead(200, {
      'content-type': 'application/dicom',
      'content-disposition': `attachment; filename="image-${index + 1}.dcm"`,
    })
    res.end(bytes)
    return true
  }

  // /study/<uid>
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(await renderPage(studyUid, files))
  return true
}

async function renderPage(studyUid: string, files: Found[]): Promise<string> {
  const shown = files.slice(0, MAX_PREVIEW)
  const bySeries = new Map<string, number[]>()
  shown.forEach((f, i) => {
    if (!bySeries.has(f.seriesUid)) bySeries.set(f.seriesUid, [])
    bySeries.get(f.seriesUid)!.push(i)
  })

  if (!files.length) {
    return shell('Nothing here', `
      <p class="empty">No images have arrived for this study yet.</p>
      <p class="empty small">If the scan has just been done, the machine may still be
      sending. This page will show them once it has.</p>`)
  }

  const series = [...bySeries.entries()].map(([uid, idx], n) => `
    <section>
      <h2>Series ${n + 1}<span>${idx.length} image${idx.length === 1 ? '' : 's'}</span></h2>
      <div class="grid">
        ${idx.map((i) => `
          <a class="tile" href="#i${i}" data-i="${i}">
            <img loading="lazy" src="/study/${encodeURIComponent(studyUid)}/image/${i}"
                 alt="Image ${i + 1}">
          </a>`).join('')}
      </div>
    </section>`).join('')

  // Decode one image to learn what this study offers. Cheaper than asking
  // every file, and a study's images share their display settings.
  let offered: Array<{ name: string }> = []
  let presets: Array<{ key: string; name: string }> = []
  let guessed = false
  let applied = ''
  try {
    const probe = await renderDicomToPng(shown[0].file)
    offered = probe.offered
    presets = presetsFor(probe.isCt)
    guessed = probe.guessed
    applied = probe.applied
  } catch { /* the grid will show the error per image */ }

  // The buttons that let a doctor decide for themselves rather than trust our
  // choice — which is the honest answer to "it looks darker than the machine".
  const choices = [
    ...offered.map((w, i) => ({ key: String(i), name: w.name })),
    ...presets,
  ]
  const windowBar = choices.length > 1 ? `
    <div class="windows">
      <span class="wl">Brightness</span>
      ${choices.map((c, i) => `<button class="wbtn${i === 0 ? ' on' : ''}" data-w="${esc(c.key)}">${esc(c.name)}</button>`).join('')}
    </div>` : ''

  // Said plainly, because a wrong window does not look broken — it looks like
  // a different finding, and somebody could act on it.
  const notice = guessed
    ? `<p class="warn">This image did not say how it should be displayed, so the
       brightness was chosen automatically. It may not match the scanner. Use the
       original file if anything matters.</p>`
    : applied
      ? `<p class="applied">Showing: <strong>${esc(applied)}</strong> — the same setting the machine recorded.</p>`
      : ''

  const truncated = files.length > MAX_PREVIEW
    ? `<p class="empty small">Showing the first ${MAX_PREVIEW} of ${files.length} images.
       The rest are stored and can be opened on the scanner.</p>`
    : ''

  return shell('Scan images', `${notice}${windowBar}${series}${truncated}
    <div id="big" hidden>
      <button id="close" aria-label="Close">&times;</button>
      <img id="bigimg" alt="">
      <div id="nav">
        <button id="prev">&#8249;</button><span id="pos"></span><button id="next">&#8250;</button>
        <a id="orig" download>Original file</a>
      </div>
    </div>
    <script>
      // A plain lightbox. No library: this page is served from a laboratory PC
      // that may have no route to the internet at all.
      const total = ${shown.length};
      const base = ${JSON.stringify(`/study/${encodeURIComponent(studyUid)}/image/`)};
      const big = document.getElementById('big');
      const bigimg = document.getElementById('bigimg');
      const pos = document.getElementById('pos');
      const origin = ${JSON.stringify(`/study/${encodeURIComponent(studyUid)}/original/`)};
      const orig = document.getElementById('orig');
      let at = 0;
      let win = '';
      function show(i) {
        at = (i + total) % total;
        bigimg.src = base + at + (win ? '?w=' + encodeURIComponent(win) : '');
        pos.textContent = (at + 1) + ' of ' + total;
        orig.href = origin + at;
        big.hidden = false;
      }
      // Changing the window reloads every tile as well as the open image, so
      // the grid never disagrees with what is being looked at.
      document.querySelectorAll('.wbtn').forEach(function (b) {
        b.addEventListener('click', function () {
          win = b.dataset.w;
          document.querySelectorAll('.wbtn').forEach(function (o) { o.classList.remove('on'); });
          b.classList.add('on');
          const q = win ? '?w=' + encodeURIComponent(win) : '';
          document.querySelectorAll('.tile img').forEach(function (img, i) {
            img.src = base + i + q;
          });
          if (!big.hidden) show(at);
        });
      });
      document.querySelectorAll('.tile').forEach(function (t) {
        t.addEventListener('click', function (e) { e.preventDefault(); show(+t.dataset.i); });
      });
      document.getElementById('close').onclick = function () { big.hidden = true; };
      document.getElementById('prev').onclick = function () { show(at - 1); };
      document.getElementById('next').onclick = function () { show(at + 1); };
      document.addEventListener('keydown', function (e) {
        if (big.hidden) return;
        if (e.key === 'Escape') big.hidden = true;
        if (e.key === 'ArrowLeft') show(at - 1);
        if (e.key === 'ArrowRight') show(at + 1);
      });
    </script>`)
}

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Uyirly</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; padding:24px 18px 60px; background:#0B1220; color:#E2E8F0;
         font:15px/1.5 -apple-system,"Segoe UI",system-ui,sans-serif; }
  h1 { font-size:18px; margin:0 0 4px; }
  .lead { color:#94A3B8; font-size:13px; margin:0 0 22px; }
  section { margin-bottom:26px; }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.08em; color:#94A3B8;
       margin:0 0 10px; display:flex; gap:10px; align-items:baseline; }
  h2 span { font-size:12px; letter-spacing:0; text-transform:none; color:#64748B; }
  .grid { display:grid; gap:8px; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); }
  .tile { display:block; background:#000; border:1px solid #1E293B; border-radius:6px;
          overflow:hidden; aspect-ratio:1; }
  .tile img { width:100%; height:100%; object-fit:contain; display:block; }
  .empty { color:#94A3B8; }
  .small { font-size:13px; }
  #big { position:fixed; inset:0; background:rgba(2,6,23,.96); display:flex;
         align-items:center; justify-content:center; flex-direction:column; z-index:50; }
  #bigimg { max-width:96vw; max-height:84vh; object-fit:contain; }
  #nav { margin-top:12px; display:flex; gap:18px; align-items:center; color:#94A3B8; }
  #nav button, #close { background:#1E293B; color:#E2E8F0; border:none; border-radius:8px;
                        font-size:20px; width:44px; height:38px; cursor:pointer; }
  #close { position:fixed; top:16px; right:16px; }
  #orig { color:#94A3B8; font-size:13px; margin-left:14px; }
  .windows { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin:0 0 18px; }
  .wl { font-size:12px; color:#64748B; text-transform:uppercase; letter-spacing:.07em;
        margin-right:4px; }
  .wbtn { background:#1E293B; color:#CBD5E1; border:1px solid #334155; border-radius:999px;
          padding:5px 12px; font-size:13px; cursor:pointer; }
  .wbtn.on { background:#0D9488; color:#fff; border-color:#0D9488; }
  .warn { background:#422006; border:1px solid #854D0E; color:#FDE68A; padding:11px 14px;
          border-radius:8px; font-size:13px; margin:0 0 16px; }
  .applied { color:#94A3B8; font-size:13px; margin:0 0 16px; }
  .applied strong { color:#E2E8F0; }
  .foot { max-width:900px; margin:28px auto 0; padding-top:16px; border-top:1px solid #1E293B;
          color:#64748B; font-size:12px; }
</style></head><body>
<h1>Scan images</h1>
<p class="lead">Stored in this hospital. Use the arrow keys to move between images.</p>
${body}
<p class="foot"><strong>Preview only — not for diagnosis.</strong> Screens differ and this
page is not a diagnostic display. For reporting, open the study on the scanner or download
the original file.</p>
</body></html>`
}
