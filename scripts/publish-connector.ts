/**
 * Publish a connector build so hospitals can download it.
 *
 *   npx tsx --env-file=.env.local scripts/publish-connector.ts
 *   npx tsx --env-file=.env.local scripts/publish-connector.ts --version 1.0.1
 *
 * Uploads connector/dist-exe/uyirly-lab-connector-windows.zip to the
 * connector-downloads bucket and records it in connector_releases, which is
 * what Settings → Analyzers reads.
 *
 * Why a script and not a deploy step: the executable is 82 MB and changes on a
 * different rhythm to the application. A new build should not need a redeploy,
 * and a redeploy should not need an 82 MB upload.
 *
 * Each version is uploaded to its own path and never overwritten. A hospital
 * that is halfway through installing 1.0.0 should not silently get 1.0.1, and
 * a build that turns out to be bad has to remain identifiable.
 */

import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BUCKET = 'connector-downloads'

if (!URL_ || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  console.error('Run with:  npx tsx --env-file=.env.local scripts/publish-connector.ts')
  process.exit(1)
}

const args = process.argv.slice(2)
const argOf = (name: string): string | undefined => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

async function main() {
  const root = path.join(import.meta.dirname, '..')
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'connector/package.json'), 'utf8'))
  const version = argOf('--version') ?? pkg.version
  const zipName = 'uyirly-lab-connector-windows.zip'
  const local = path.join(root, 'connector/dist-exe', zipName)

  let bytes: Buffer
  try {
    bytes = await fs.readFile(local)
  } catch {
    console.error(`No build found at ${local}`)
    console.error('Build it first:  cd connector && node build.mjs --win')
    process.exit(1)
  }

  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const remote = `windows/${version}/${zipName}`

  console.log(`\n  version   ${version}`)
  console.log(`  size      ${(bytes.length / 1048576).toFixed(1)} MB`)
  console.log(`  sha256    ${sha256}`)
  console.log(`  path      ${remote}\n`)

  const svc = createClient(URL_, KEY, { auth: { persistSession: false } })

  // upsert:false — a published version is immutable. Re-publishing the same
  // number with different bytes is how a hospital ends up running something
  // nobody can identify from a support call.
  const { error: upErr } = await svc.storage.from(BUCKET).upload(remote, bytes, {
    contentType: 'application/zip',
    upsert: false,
    cacheControl: '31536000',
  })

  if (upErr) {
    if (upErr.message.includes('already exists')) {
      console.error(`Version ${version} is already published. Bump the version in `
        + 'connector/package.json, or pass --version.')
      process.exit(1)
    }
    console.error(`Upload failed: ${upErr.message}`)
    process.exit(1)
  }

  // Only one row per platform may be current; clear the old one first, because
  // the unique index would otherwise refuse the insert.
  await svc.from('connector_releases')
    .update({ is_current: false }).eq('platform', 'windows').eq('is_current', true)

  const { error: rowErr } = await svc.from('connector_releases').insert({
    version,
    platform: 'windows',
    file_path: remote,
    file_name: zipName,
    size_bytes: bytes.length,
    sha256,
    is_signed: false,
    is_current: true,
    notes: argOf('--notes') ?? null,
  })

  if (rowErr) {
    console.error(`Uploaded, but could not record the release: ${rowErr.message}`)
    process.exit(1)
  }

  const { data: pub } = svc.storage.from(BUCKET).getPublicUrl(remote)
  console.log(`  Published.\n  ${pub.publicUrl}\n`)
}

main().catch((e) => { console.error(e); process.exit(1) })
