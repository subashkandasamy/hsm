import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Config } from './config.js'
import { log } from './log.js'
import { filesDir } from './storage.js'
import { VERSION } from './version.js'

/**
 * Collecting the hospital's uploaded files from the cloud (0275).
 *
 * When an admin switches "keep uploaded files on this computer" on, patient
 * documents, IPD declaration uploads and radiology report images are uploaded
 * to the cloud as always, then fetched here on the next heartbeat. The order
 * is the whole design:
 *
 *   download → write to a .part file → flush to disk → rename → check size and
 *   SHA-256 of what is on disk → tell Uyirly → Uyirly deletes the cloud copy
 *
 * The cloud copy goes only after this computer has said it holds an identical
 * file, and Uyirly checks the size against its own record before deleting. If
 * anything fails midway the cloud copy stays and the file is tried again.
 *
 * Nothing here ever deletes a kept file. Removing patient records is not a
 * thing a program should be able to be told to do.
 */

export interface MoverOptions { fetchImpl?: typeof fetch; dir?: () => string }

interface Offered { id: string; url: string; ext: string; size: number | null }

export class FileMover {
  private running = false

  constructor(private config: Config, private opts: MoverOptions = {}) {}

  private get f(): typeof fetch { return this.opts.fetchImpl ?? fetch }
  private dir(): string { return (this.opts.dir ?? filesDir)() }
  private api(): string { return `${this.config.serverUrl.replace(/\/$/, '')}/api/device/files` }
  private headers(): Record<string, string> {
    return { authorization: `Bearer ${this.config.token}`, 'x-connector-version': VERSION }
  }

  /** One pass: take everything Uyirly offers. Overlapping calls are ignored. */
  async sync(): Promise<{ moved: number; failed: number }> {
    if (this.running) return { moved: 0, failed: 0 }
    this.running = true
    let moved = 0
    let failed = 0
    try {
      const res = await this.f(this.api(), { headers: this.headers(), signal: AbortSignal.timeout(30_000) })
      if (!res.ok) return { moved, failed }
      const { files = [] } = await res.json() as { files?: Offered[] }
      for (const file of files) {
        const ok = await this.take(file)
        if (ok) moved++
        else failed++
      }
      if (moved) log.info(`Kept ${moved} uploaded file${moved === 1 ? '' : 's'} on this computer.`)
    } catch (e) {
      log.warn(`Could not collect uploaded files: ${(e as Error).message}`)
    } finally {
      this.running = false
    }
    return { moved, failed }
  }

  private async take(file: Offered): Promise<boolean> {
    if (!/^[0-9a-f-]{36}$/i.test(file.id) || !/^[a-z0-9]{1,5}$/.test(file.ext)) {
      await this.report({ id: file.id, ok: false, error: 'Unexpected file id or type' })
      return false
    }
    const dir = this.dir()
    const final = path.join(dir, `${file.id}.${file.ext}`)
    const part = `${final}.part`
    try {
      await fs.mkdir(dir, { recursive: true })
      const res = await this.f(file.url, { signal: AbortSignal.timeout(5 * 60_000) })
      if (!res.ok) throw new Error(`download answered ${res.status}`)
      const bytes = Buffer.from(await res.arrayBuffer())
      if (file.size !== null && bytes.length !== file.size) {
        throw new Error(`download was ${bytes.length} bytes, expected ${file.size}`)
      }

      // Written whole and flushed before it takes its real name, so a power cut
      // leaves a .part file to retry, never a short file that looks complete.
      const handle = await fs.open(part, 'w')
      try { await handle.writeFile(bytes); await handle.sync() } finally { await handle.close() }
      await fs.rename(part, final)

      // Checked as it is on disk, not as it was in memory.
      const onDisk = await fs.readFile(final)
      const sha256 = createHash('sha256').update(onDisk).digest('hex')
      if (onDisk.length !== bytes.length || sha256 !== createHash('sha256').update(bytes).digest('hex')) {
        throw new Error('the saved copy does not match what was downloaded')
      }

      const confirmed = await this.report({ id: file.id, ok: true, size: onDisk.length, sha256 })
      if (!confirmed) throw new Error('Uyirly did not accept the copy')
      return true
    } catch (e) {
      await fs.rm(part, { force: true }).catch(() => {})
      log.warn(`Could not keep uploaded file ${file.id.slice(0, 8)}: ${(e as Error).message}. It stays in the cloud and will be tried again.`)
      await this.report({ id: file.id, ok: false, error: (e as Error).message })
      return false
    }
  }

  private async report(body: Record<string, unknown>): Promise<boolean> {
    try {
      const res = await this.f(this.api(), {
        method: 'POST',
        headers: { ...this.headers(), 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      })
      return res.ok
    } catch {
      return false
    }
  }
}
