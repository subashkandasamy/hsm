import { promises as fs } from 'node:fs'
import path from 'node:path'
import { log } from '../log.js'

/**
 * Analyzers whose only output is a file.
 *
 * Several biochemistry machines cannot talk to anything: they write a result
 * file to a folder, or to a shared drive, and that is the whole interface.
 * Watching a directory is not elegant but it is the difference between a
 * hospital being connected and not.
 *
 * ── Two things that go wrong, and are handled ──────────────────────────────
 *
 * 1. Reading a file while it is still being written gives half a result, which
 *    parses into a plausible wrong number. So a file is only taken once its
 *    size has stopped changing between two checks.
 *
 * 2. Re-reading the same file gives the same result twice. Files are moved to
 *    a 'sent' subfolder once queued — and the server keys on a hash of the
 *    contents anyway, so even a mistake here cannot duplicate a result.
 *
 * Polling rather than fs.watch: network shares and mapped drives, which is
 * where these folders usually live, do not reliably raise filesystem events on
 * Windows.
 */
export function startFolderWatch(
  folder: string,
  onMessage: (raw: string, source: string) => void,
  intervalMs = 5_000,
): () => void {
  const sentDir = path.join(folder, 'sent')
  const sizes = new Map<string, number>()
  let stopped = false

  async function scan(): Promise<void> {
    if (stopped) return
    try {
      await fs.mkdir(sentDir, { recursive: true })
      const entries = await fs.readdir(folder, { withFileTypes: true })

      for (const e of entries) {
        if (!e.isFile()) continue
        if (e.name.startsWith('.')) continue
        const full = path.join(folder, e.name)

        const stat = await fs.stat(full).catch(() => null)
        if (!stat) continue

        const previous = sizes.get(e.name)
        sizes.set(e.name, stat.size)
        // Still growing, or seen for the first time — wait one more round.
        if (previous === undefined || previous !== stat.size) continue
        if (stat.size === 0) continue

        const raw = await fs.readFile(full, 'latin1').catch(() => null)
        if (raw === null) continue

        onMessage(raw, `file ${e.name}`)
        sizes.delete(e.name)

        const dest = path.join(sentDir, `${Date.now()}-${e.name}`)
        await fs.rename(full, dest).catch(async (err) => {
          // A read-only share, or the analyzer still holds a handle. The hash
          // check upstream means re-reading it is harmless, so just say so.
          log.warn(`Could not move ${e.name} out of the way: ${(err as Error).message}`)
        })
        log.info(`Picked up ${e.name}`)
      }
    } catch (err) {
      log.warn(`Could not read ${folder}: ${(err as Error).message}`)
    }
  }

  log.info(`Watching folder ${folder}`)
  const timer = setInterval(() => void scan(), intervalMs)
  void scan()

  return () => { stopped = true; clearInterval(timer) }
}
