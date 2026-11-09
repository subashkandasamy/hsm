import { createWriteStream, type WriteStream } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { dataDir } from './config.js'

/**
 * A log somebody can read over the telephone.
 *
 * When an analyzer will not connect, the person standing next to it is a
 * biomedical engineer with a screwdriver, not a programmer. So: plain English,
 * one line per event, local time, and never a stack trace where a sentence
 * will do.
 *
 * Patient data is deliberately absent. The raw messages carry names and
 * results and they live in the queue, not in here — a log file gets emailed
 * around, copied to a pen drive and left on a desktop.
 */

let stream: WriteStream | null = null

export async function initLog(): Promise<void> {
  const dir = path.join(dataDir(), 'logs')
  await fs.mkdir(dir, { recursive: true })
  await rotate(dir)
  stream = createWriteStream(path.join(dir, 'connector.log'), { flags: 'a' })
  // Not being able to write the log must never stop the program. Run from a
  // Command Prompt that is not "Run as administrator", the file (owned by the
  // system account the service runs as) is refused with EPERM — and the
  // unhandled error used to crash the connector before it did anything.
  stream.on('error', (e) => {
    stream = null
    console.warn(`  (Could not write the log file: ${(e as NodeJS.ErrnoException).code ?? e.message}. `
      + 'Carrying on without it — run as administrator to keep a log.)')
  })
}

/** Keep a fortnight. A laboratory PC is not where logs should accumulate. */
async function rotate(dir: string): Promise<void> {
  const file = path.join(dir, 'connector.log')
  try {
    const stat = await fs.stat(file)
    const ageDays = (Date.now() - stat.mtimeMs) / 86_400_000
    if (stat.size > 8 * 1024 * 1024 || ageDays > 1) {
      const stamp = new Date(stat.mtimeMs).toISOString().slice(0, 10)
      await fs.rename(file, path.join(dir, `connector-${stamp}.log`)).catch(() => {})
    }
  } catch { /* no log yet */ }

  for (const f of await fs.readdir(dir).catch(() => [])) {
    if (!f.startsWith('connector-')) continue
    const s = await fs.stat(path.join(dir, f)).catch(() => null)
    if (s && (Date.now() - s.mtimeMs) / 86_400_000 > 14) {
      await fs.unlink(path.join(dir, f)).catch(() => {})
    }
  }
}

function write(level: string, message: string): void {
  const now = new Date()
  const stamp = now.toLocaleString('en-IN', { hour12: false })
  const line = `${stamp}  ${level.padEnd(5)} ${message}`
  console.log(line)
  stream?.write(`${line}\n`)
}

export const log = {
  info:  (m: string) => write('', m),
  warn:  (m: string) => write('WARN', m),
  error: (m: string) => write('ERROR', m),
}
