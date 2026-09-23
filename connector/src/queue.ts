import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

/**
 * The reason this program runs in the hospital rather than in the cloud.
 *
 * A laboratory's internet goes down. The analyzer does not stop, and it will
 * not hold a result for you — most instruments transmit once and forget. So a
 * message is written to disk the moment it is complete, before anything is
 * sent anywhere, and it stays there until the server has confirmed it.
 *
 * One file per message, because a broadband outage should be recoverable with
 * a text editor and a phone call. No database, no native module, nothing to
 * corrupt: a crashed connector loses at most the message currently being
 * written, and that one was never acknowledged to the analyzer either.
 *
 * Writes are atomic — written to .tmp, then renamed — so a power cut cannot
 * leave a half-written result that later parses into a plausible wrong number.
 */

export interface QueuedMessage {
  /** sha256 of the raw text. Doubles as the server's idempotency key, so a
   *  message sent twice after a timeout can never become a second result. */
  id: string
  raw: string
  receivedAt: string
  source: string
  attempts: number
  lastError?: string
}

export class Queue {
  constructor(private dir: string) {}

  async init(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
    // A .tmp left behind means we died mid-write. It was never acknowledged
    // and never sent, so it is noise rather than data.
    for (const f of await fs.readdir(this.dir)) {
      if (f.endsWith('.tmp')) await fs.unlink(path.join(this.dir, f)).catch(() => {})
    }
  }

  /** Persist a completed message. Returns false if we already hold it. */
  async add(raw: string, source: string): Promise<{ stored: boolean; id: string }> {
    const id = createHash('sha256').update(raw).digest('hex')
    const file = path.join(this.dir, `${id}.json`)

    try {
      await fs.access(file)
      return { stored: false, id }          // already queued
    } catch { /* not there — good */ }

    const msg: QueuedMessage = {
      id, raw, receivedAt: new Date().toISOString(), source, attempts: 0,
    }
    const tmp = `${file}.tmp`
    await fs.writeFile(tmp, JSON.stringify(msg, null, 2), 'utf8')
    await fs.rename(tmp, file)
    return { stored: true, id }
  }

  /** Oldest first — a laboratory's results should arrive in the order drawn. */
  async list(): Promise<QueuedMessage[]> {
    const files = (await fs.readdir(this.dir)).filter((f) => f.endsWith('.json'))
    const out: QueuedMessage[] = []
    for (const f of files) {
      try {
        out.push(JSON.parse(await fs.readFile(path.join(this.dir, f), 'utf8')))
      } catch {
        // Unreadable rather than absent. Leave it alone: a human can look, and
        // deleting something we failed to parse is how results disappear.
      }
    }
    return out.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
  }

  async remove(id: string): Promise<void> {
    await fs.unlink(path.join(this.dir, `${id}.json`)).catch(() => {})
  }

  /** Record a failed attempt so a stuck message is visible on disk. */
  async noteFailure(msg: QueuedMessage, error: string): Promise<void> {
    const updated: QueuedMessage = { ...msg, attempts: msg.attempts + 1, lastError: error }
    const file = path.join(this.dir, `${msg.id}.json`)
    const tmp = `${file}.tmp`
    await fs.writeFile(tmp, JSON.stringify(updated, null, 2), 'utf8')
    await fs.rename(tmp, file)
  }

  async size(): Promise<number> {
    return (await fs.readdir(this.dir)).filter((f) => f.endsWith('.json')).length
  }
}
