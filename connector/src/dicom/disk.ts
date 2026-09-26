import { statfs } from 'node:fs/promises'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { log } from '../log.js'

/**
 * How much room is left, and what to do when there is not enough.
 *
 * A CT study runs to about half a gigabyte. Eight a day is roughly 1.4 TB a
 * year, and nothing in this program ever deleted an image — so a laboratory PC
 * would quietly fill up and then start failing to write.
 *
 * The failure matters more than the cause. Without this the scanner is told
 * each image was stored, the write fails, the log fills with errors nobody
 * reads, and a patient's study is simply missing. Refusing the images instead
 * makes the scanner report an error in the room, to the person who just did the
 * scan, while they can still do something about it.
 *
 * ── Why two thresholds ─────────────────────────────────────────────────────
 *
 * A warning that only appears once the disk is full is useless. The first
 * threshold is a warning with room to act; the second stops accepting images,
 * because writing until the last byte takes Windows down with it.
 */

/** Below this, say so everywhere but keep accepting. */
export const WARN_FREE_BYTES = 20 * 1024 ** 3      // 20 GB
/** Below this, refuse — the scanner will tell somebody. */
export const REFUSE_FREE_BYTES = 5 * 1024 ** 3     // 5 GB

export interface DiskState {
  freeBytes: number
  totalBytes: number
  usedByImagesBytes: number
  /** Nothing more will be accepted until space is made. */
  refusing: boolean
  checkedAt: Date
}

export const humanBytes = (n: number): string => {
  if (n >= 1024 ** 4) return `${(n / 1024 ** 4).toFixed(1)} TB`
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(0)} GB`
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(0)} MB`
  return `${(n / 1024).toFixed(0)} KB`
}

/** What our own images are taking up, walked rather than tracked. */
async function folderSize(dir: string): Promise<number> {
  let total = 0
  let entries
  try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return 0 }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) total += await folderSize(full)
    else {
      try { total += (await fs.stat(full)).size } catch { /* vanished mid-walk */ }
    }
  }
  return total
}

export async function checkDisk(imageDir: string): Promise<DiskState | null> {
  try {
    await fs.mkdir(imageDir, { recursive: true })
    const s = await statfs(imageDir)
    const freeBytes = s.bavail * s.bsize
    const totalBytes = s.blocks * s.bsize
    return {
      freeBytes,
      totalBytes,
      usedByImagesBytes: await folderSize(imageDir),
      refusing: freeBytes < REFUSE_FREE_BYTES,
      checkedAt: new Date(),
    }
  } catch (e) {
    // Not being able to measure the disk must not stop images arriving; a
    // hospital with a working scanner and an unreadable statfs is better off
    // receiving than refusing.
    log.warn(`Could not check free disk space: ${(e as Error).message}`)
    return null
  }
}

/**
 * Keeps an eye on the disk without asking the filesystem on every image.
 *
 * Walking the folder is expensive and a CT sends hundreds of images a minute,
 * so it is measured on a timer and the answer reused. Five minutes is far
 * quicker than a disk can fill from comfortable to dangerous.
 */
export class DiskWatch {
  private state: DiskState | null = null
  private timer: NodeJS.Timeout | null = null
  private warned = false
  private refused = false

  constructor(private imageDir: string, private intervalMs = 5 * 60_000) {}

  async start(): Promise<void> {
    await this.refresh()
    this.timer = setInterval(() => void this.refresh(), this.intervalMs)
    // Do not hold the program open just to measure a disk.
    this.timer.unref?.()
  }

  stop(): void { if (this.timer) clearInterval(this.timer) }

  get current(): DiskState | null { return this.state }

  /** Asked before every image, and deliberately cheap. */
  get accepting(): boolean { return !this.state?.refusing }

  private async refresh(): Promise<void> {
    const s = await checkDisk(this.imageDir)
    if (!s) return
    this.state = s

    if (s.refusing && !this.refused) {
      this.refused = true
      log.error(`ONLY ${humanBytes(s.freeBytes)} FREE — no longer accepting images from `
        + 'scanners. Scanners will report a failure, which is deliberate: it is better '
        + 'that somebody finds out now than that a study goes missing. Free space on '
        + 'this computer, or move old studies off it.')
    } else if (!s.refusing && this.refused) {
      this.refused = false
      this.warned = false
      log.info(`Space freed — ${humanBytes(s.freeBytes)} available, accepting images again.`)
    } else if (!s.refusing && s.freeBytes < WARN_FREE_BYTES && !this.warned) {
      this.warned = true
      log.warn(`Only ${humanBytes(s.freeBytes)} free on this computer. Images from `
        + `scanners are using ${humanBytes(s.usedByImagesBytes)}. Plan to free space `
        + 'before it runs out.')
    }
  }
}
