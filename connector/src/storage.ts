import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { dataDir, saveConfig, type Config } from './config.js'
import { log } from './log.js'

/**
 * Where scans and uploaded files are kept on this computer.
 *
 * Chosen once, automatically: the local fixed drive with the most free space
 * (the user's rule, 9 Nov 2026), in a folder called Uyirly at its root — so a
 * laboratory PC with a small C: and a large D: fills the D:. Remembered in
 * config.json and never re-chosen, because files split across two drives are
 * files looked for in the wrong place. Removable, network and optical drives
 * are never considered: a USB disk that is unplugged, or comes back as F:
 * instead of E:, would lose the scans the scanner is sending.
 *
 * Settings, the result queue and the logs stay in ProgramData on C:. Only the
 * bulky things move.
 */

export interface Drive { id: string; freeBytes: number; sizeBytes: number }

let root: string | null = null

/** The storage folder in use (dataDir() until resolveStorage has run). */
export function storageRoot(): string {
  return root ?? dataDir()
}

/** Where incoming scans are written. */
export function scanDir(): string {
  return path.join(storageRoot(), 'dicom')
}

/**
 * Where scans may be found. The chosen folder, plus the old ProgramData folder
 * that connectors before 1.0.8 always wrote to — so a computer that already
 * holds studies on C: keeps showing them after it starts writing to D:.
 */
export function scanDirs(): string[] {
  const dirs = [scanDir(), path.join(dataDir(), 'dicom')]
  return [...new Set(dirs)]
}

/** Where uploaded files moved from the cloud are kept. */
export function filesDir(): string {
  return path.join(storageRoot(), 'files')
}

/** The drive with the most free space. Pure, so the rule can be tested. */
export function pickDrive(drives: Drive[]): Drive | null {
  const usable = drives.filter((d) => /^[A-Z]:$/i.test(d.id) && d.freeBytes > 0)
  if (!usable.length) return null
  // Most free space; on a tie prefer C: last, so the system drive is spared.
  return [...usable].sort((a, b) =>
    b.freeBytes - a.freeBytes || (a.id.toUpperCase() === 'C:' ? 1 : 0) - (b.id.toUpperCase() === 'C:' ? 1 : 0))[0]
}

/** Local fixed drives (DriveType 3), from Windows itself. */
export async function listFixedDrives(): Promise<Drive[]> {
  if (process.platform !== 'win32') return []
  const out = await new Promise<string>((resolve) => {
    execFile('powershell', ['-NoProfile', '-Command',
      'Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,FreeSpace,Size | ConvertTo-Json -Compress',
    ], { windowsHide: true, timeout: 20_000 }, (_e, stdout) => resolve(stdout ?? ''))
  })
  try {
    const parsed = JSON.parse(out) as unknown
    const list = (Array.isArray(parsed) ? parsed : [parsed]) as Array<{ DeviceID?: string; FreeSpace?: number; Size?: number }>
    return list
      .filter((d) => d?.DeviceID)
      .map((d) => ({ id: String(d.DeviceID), freeBytes: Number(d.FreeSpace ?? 0), sizeBytes: Number(d.Size ?? 0) }))
  } catch {
    return []
  }
}

/**
 * Decide the storage folder (once), create it, and make it private.
 *
 * Off Windows, or when Windows will not say what drives it has, the folder
 * stays in ProgramData as before — never a guess.
 */
export async function resolveStorage(
  config: Config,
  opts: { drives?: Drive[]; persist?: (c: Config) => Promise<void> } = {},
): Promise<string> {
  if (config.storageRoot) {
    root = config.storageRoot
  } else {
    const drives = opts.drives ?? await listFixedDrives()
    const best = pickDrive(drives)
    root = best ? `${best.id.toUpperCase()}\\Uyirly` : dataDir()
    config.storageRoot = root
    await (opts.persist ?? saveConfig)(config)
    if (best) {
      log.info(`Scans and files will be kept on ${best.id.toUpperCase()} `
        + `(${Math.round(best.freeBytes / 1e9)} GB free, the most of any drive) in ${root}`)
    }
  }
  await fs.mkdir(path.join(root, 'dicom'), { recursive: true })
  await fs.mkdir(path.join(root, 'files'), { recursive: true })
  if (process.platform === 'win32' && root !== dataDir()) await makePrivate(root)
  return root
}

/**
 * Only Windows itself (SYSTEM, which the connector runs as) and
 * Administrators may open the folder. A folder made at the root of D: would
 * otherwise inherit D:'s permissions, which usually let every signed-in user
 * browse it — and these are patients' scans and documents.
 */
async function makePrivate(dir: string): Promise<void> {
  await new Promise<void>((resolve) => {
    execFile('icacls', [dir, '/inheritance:r',
      '/grant:r', '*S-1-5-18:(OI)(CI)F', '/grant:r', '*S-1-5-32-544:(OI)(CI)F'],
    { windowsHide: true, timeout: 20_000 }, (e) => {
      if (e) log.warn(`Could not make ${dir} private: ${e.message}`)
      resolve()
    })
  })
}
