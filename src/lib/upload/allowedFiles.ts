/**
 * What may be uploaded into the two private PHI buckets, and how big.
 *
 * Both buckets were created with `file_size_limit: null` and
 * `allowed_mime_types: null` — no type check and no size check at either layer
 * (F-58). `getUploadUrl` took a filename, split off whatever followed the last
 * dot, and minted a signed URL for it. Anyone holding
 * `emr:document:upload` — which includes the **receptionist** — could put a file
 * of any type and any size into the hospital's storage. The buckets are private
 * and served only through signed URLs, so the realistic harm is cost and abuse
 * rather than disclosure, but `tenant-logos` was capped at 2 MB with three MIME
 * types while the bucket holding patient records had nothing.
 *
 * ## One list, two enforcers
 *
 * The bucket settings are the real control: they are enforced by storage itself
 * and cannot be talked out of by a crafted client. The check here exists so the
 * person at the screen gets a sentence they can act on, instead of a storage
 * error after the upload has already been attempted.
 *
 * Both read from this file, and migration `0255` sets the buckets from the same
 * values, with a comment pointing back here. Two copies of a rule that must
 * agree is the defect this audit has found five times; keeping the authority in
 * one place is the point.
 *
 * ## Why these types
 *
 * Measured, not guessed. Live contents at the time of writing: the `documents`
 * bucket held one PDF of 1.4 MB, `radiology` held two JPEGs of about 600 kB. So
 * the sets below are already generous for what the hospital actually does, and
 * nothing in storage violates them.
 *
 * TIFF and DICOM are included for radiology because scanners emit them and a
 * hospital that buys a modality should not have to wait for a code change.
 * Office documents are deliberately absent: a discharge summary belongs in the
 * record as a PDF, and allowing `.docx` into a PHI bucket means accepting a
 * macro container nobody will scan.
 */

export interface UploadRules {
  /** Hard ceiling in bytes, matching the bucket's `file_size_limit`. */
  maxBytes: number
  /** Extension (no dot, lowercase) → the MIME type storage will be told. */
  extensions: Record<string, string>
}

/** Patient documents: reports, discharge summaries, consent forms, ID scans. */
export const DOCUMENT_UPLOAD: UploadRules = {
  maxBytes: 25 * 1024 * 1024,
  extensions: {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
    tif: 'image/tiff',
    tiff: 'image/tiff',
  },
}

/** Radiology scan images. Larger, and DICOM is a real thing here. */
export const RADIOLOGY_UPLOAD: UploadRules = {
  maxBytes: 50 * 1024 * 1024,
  extensions: {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    pdf: 'application/pdf',
    dcm: 'application/dicom',
  },
}

/** Distinct MIME types for a rule set — what the bucket's allowlist is set to. */
export function allowedMimeTypes(rules: UploadRules): string[] {
  return [...new Set(Object.values(rules.extensions))].sort()
}

export interface CheckedUpload {
  ok: true
  /** Lowercased, allowlisted extension — safe to build a storage path with. */
  ext: string
  mime: string
}
export interface RejectedUpload {
  ok: false
  error: string
}

/**
 * Validates a client-supplied filename against a rule set.
 *
 * The extension is taken from the filename and then looked up, so the value
 * that reaches the storage path is one of OUR strings rather than whatever the
 * client sent. That matters beyond type checking: the old code interpolated the
 * raw tail of the filename into the object path.
 */
export function checkUploadName(filename: string, rules: UploadRules): CheckedUpload | RejectedUpload {
  const name = (filename ?? '').trim()
  if (!name) return { ok: false, error: 'No file name was given' }

  const dot = name.lastIndexOf('.')
  // `dot < 1` also rejects a dotfile such as ".pdf", which has no stem.
  if (dot < 1 || dot === name.length - 1) {
    return { ok: false, error: 'The file needs an extension — ' + describe(rules) }
  }

  const ext = name.slice(dot + 1).toLowerCase()
  const mime = rules.extensions[ext]
  if (!mime) {
    return { ok: false, error: `.${ext} files cannot be uploaded here — ` + describe(rules) }
  }
  return { ok: true, ext, mime }
}

/** Optional size pre-check, where the client knows the size before uploading. */
export function checkUploadSize(bytes: number | null | undefined, rules: UploadRules): RejectedUpload | null {
  if (bytes == null || !Number.isFinite(bytes)) return null
  if (bytes > rules.maxBytes) {
    return {
      ok: false,
      error: `That file is ${(bytes / 1024 / 1024).toFixed(1)} MB — the limit is ${rules.maxBytes / 1024 / 1024} MB`,
    }
  }
  return null
}

function describe(rules: UploadRules): string {
  const exts = Object.keys(rules.extensions).sort().map((e) => `.${e}`).join(', ')
  return `allowed: ${exts} (up to ${rules.maxBytes / 1024 / 1024} MB)`
}
