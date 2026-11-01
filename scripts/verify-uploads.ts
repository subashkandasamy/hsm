/**
 * What may be uploaded into the two PHI buckets.
 *
 *   npm run verify:uploads
 *
 * The bucket settings are the real control, and migration `0255` sets them. This
 * covers the code-side check (F-58), which exists so the person uploading gets
 * an actionable sentence rather than a storage error — and which also decides
 * the extension that goes into the object path, where the old code used whatever
 * followed the last dot in the client's filename.
 *
 * The two lists must agree. That is asserted here against the values the
 * migration writes, because "two copies of a rule that must match" is the defect
 * this audit has found five times.
 */

import {
  DOCUMENT_UPLOAD, RADIOLOGY_UPLOAD, allowedMimeTypes,
  checkUploadName, checkUploadSize,
} from '../src/lib/upload/allowedFiles'

let failed = 0
function check(ok: boolean, label: string, detail?: unknown) {
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? `  — ${JSON.stringify(detail)}` : ''}`)
}

console.log('\nWhat gets through')
for (const [name, ext, mime] of [
  ['discharge-summary.pdf', 'pdf', 'application/pdf'],
  ['scan.JPG', 'jpg', 'image/jpeg'],
  ['report.jpeg', 'jpeg', 'image/jpeg'],
  ['aadhaar.png', 'png', 'image/png'],
  ['photo.HEIC', 'heic', 'image/heic'],
  ['x-ray.tiff', 'tiff', 'image/tiff'],
] as [string, string, string][]) {
  const r = checkUploadName(name, DOCUMENT_UPLOAD)
  check(r.ok && r.ext === ext && r.mime === mime, `${name} → .${ext} (${mime})`, r)
}

console.log('\nWhat does not')
for (const name of [
  'payload.exe', 'macro.docm', 'summary.docx', 'sheet.xlsx', 'archive.zip',
  'script.js', 'page.html', 'video.mp4', 'db.sql',
]) {
  const r = checkUploadName(name, DOCUMENT_UPLOAD)
  check(!r.ok, `${name} is refused`, r)
}

console.log('\nFilenames that are not really filenames')
for (const name of ['', '   ', 'noextension', '.pdf', 'trailing.', 'a.']) {
  const r = checkUploadName(name, DOCUMENT_UPLOAD)
  check(!r.ok, `${JSON.stringify(name)} is refused`, r)
}

// The extension is LOOKED UP, so nothing from the client reaches the path.
console.log('\nThe path component comes from our list, not from the client')
{
  const r = checkUploadName('report.pdf', DOCUMENT_UPLOAD)
  check(r.ok && r.ext === 'pdf', 'a clean name resolves to a clean extension', r)

  const traversal = checkUploadName('../../etc/passwd', DOCUMENT_UPLOAD)
  check(!traversal.ok, 'a traversal attempt has no allowed extension and is refused', traversal)

  // "evil.pdf" with a directory part: only the extension is used downstream,
  // and the rest of the name never reaches the storage path at all.
  const nested = checkUploadName('../../evil.pdf', DOCUMENT_UPLOAD)
  check(nested.ok && nested.ext === 'pdf' && !/\.\./.test(nested.ext),
    'a path-shaped name still yields only "pdf" — the caller builds the path from a uuid', nested)

  const upper = checkUploadName('Report.PDF', DOCUMENT_UPLOAD)
  check(upper.ok && upper.ext === 'pdf', 'the extension is lowercased', upper)

  const doubled = checkUploadName('report.pdf.exe', DOCUMENT_UPLOAD)
  check(!doubled.ok, 'a double extension is judged on the LAST one, so .exe is refused', doubled)
}

console.log('\nRadiology is wider, and larger')
{
  const dcm = checkUploadName('study.dcm', RADIOLOGY_UPLOAD)
  check(dcm.ok && dcm.mime === 'application/dicom', 'DICOM is allowed for radiology', dcm)
  check(!checkUploadName('study.dcm', DOCUMENT_UPLOAD).ok,
    'but not for patient documents')
  check(!checkUploadName('photo.heic', RADIOLOGY_UPLOAD).ok,
    'and a phone photo is not a scan')
}

console.log('\nSize')
{
  check(checkUploadSize(1_400_000, DOCUMENT_UPLOAD) === null,
    'the 1.4 MB PDF actually in storage passes')
  check(checkUploadSize(25 * 1024 * 1024, DOCUMENT_UPLOAD) === null, 'exactly the limit passes')
  check(checkUploadSize(25 * 1024 * 1024 + 1, DOCUMENT_UPLOAD) !== null, 'a byte over does not')
  check(checkUploadSize(40 * 1024 * 1024, RADIOLOGY_UPLOAD) === null, '40 MB is fine for a scan')
  check(checkUploadSize(40 * 1024 * 1024, DOCUMENT_UPLOAD) !== null, 'but not for a document')
  check(checkUploadSize(null, DOCUMENT_UPLOAD) === null, 'an unknown size is not rejected here')
  check(checkUploadSize(undefined, DOCUMENT_UPLOAD) === null, 'nor an absent one')
  check(checkUploadSize(NaN, DOCUMENT_UPLOAD) === null, 'nor a NaN')
}

// The values migration 0255 writes into storage.buckets. Verified against the
// live bucket rows after applying it on a throwaway cluster; this keeps them
// from drifting afterwards.
console.log('\nThe code list and the bucket list must be the same list')
{
  const expectDocs = 'application/pdf,image/heic,image/heif,image/jpeg,image/png,image/tiff,image/webp'
  const expectRad = 'application/dicom,application/pdf,image/jpeg,image/png,image/tiff,image/webp'
  check(allowedMimeTypes(DOCUMENT_UPLOAD).join(',') === expectDocs,
    'documents MIME list matches 0255', allowedMimeTypes(DOCUMENT_UPLOAD).join(','))
  check(allowedMimeTypes(RADIOLOGY_UPLOAD).join(',') === expectRad,
    'radiology MIME list matches 0255', allowedMimeTypes(RADIOLOGY_UPLOAD).join(','))
  check(DOCUMENT_UPLOAD.maxBytes === 25 * 1024 * 1024, 'documents limit matches 0255 (25 MB)')
  check(RADIOLOGY_UPLOAD.maxBytes === 50 * 1024 * 1024, 'radiology limit matches 0255 (50 MB)')
}

console.log(failed === 0 ? '\nUpload rules hold.\n' : `\n${failed} check(s) FAILED.\n`)
process.exit(failed === 0 ? 0 : 1)
