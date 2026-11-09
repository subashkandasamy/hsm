/**
 * What each analyzer has done since the connector started — for the status
 * page on this computer (http://localhost:5151).
 *
 * Asked for at Karur, 9 Nov 2026, while connecting four machines at once: the
 * page said "Working" for the connector as a whole, and the only way to tell
 * WHICH analyzer was talking was to read the log. Now each machine has a row:
 * what it is, where it is, whether it is connected, when it last sent a
 * result, and a plain verdict.
 *
 * Machine names come from the message header (HL7 MSH-3/4, ASTM H-5) — never
 * patient names or results, which this page must not show.
 */

export interface AnalyzerLive {
  /** "tcp 192.168.1.60" or "serial COM3". */
  key: string
  kind: 'network' | 'cable'
  address: string
  /** What the machine calls itself, once it has sent something. */
  name: string | null
  connected: boolean
  connections: number
  firstSeenAt: Date
  lastConnectedAt: Date | null
  lastDisconnectedAt: Date | null
  /** Bytes in the most recent connection. */
  lastBytes: number
  results: number
  lastResultAt: Date | null
  /** The last message arrived incomplete (kept and sent for checking). */
  lastIncomplete: boolean
  /** A cable port that could not be opened, in words. */
  problem: string | null
}

const live = new Map<string, AnalyzerLive>()

function entry(key: string): AnalyzerLive {
  let a = live.get(key)
  if (!a) {
    const [kind, ...rest] = key.split(' ')
    a = {
      key, kind: kind === 'serial' ? 'cable' : 'network', address: rest.join(' ') || key,
      name: null, connected: false, connections: 0, firstSeenAt: new Date(),
      lastConnectedAt: null, lastDisconnectedAt: null, lastBytes: 0,
      results: 0, lastResultAt: null, lastIncomplete: false, problem: null,
    }
    live.set(key, a)
  }
  return a
}

export function analyzerConnected(key: string): void {
  const a = entry(key)
  a.connected = true
  a.connections++
  a.lastConnectedAt = new Date()
  a.lastBytes = 0
  a.problem = null
}

export function analyzerDisconnected(key: string, bytes: number): void {
  const a = entry(key)
  a.connected = false
  a.lastDisconnectedAt = new Date()
  a.lastBytes = bytes
}

export function analyzerResult(key: string, raw: string, incomplete = false): void {
  const a = entry(key)
  a.results++
  a.lastResultAt = new Date()
  a.lastIncomplete = incomplete
  a.name = machineName(raw) ?? a.name
}

export function analyzerProblem(key: string, problem: string): void {
  const a = entry(key)
  a.connected = false
  a.problem = problem
}

export function liveAnalyzers(): AnalyzerLive[] {
  return [...live.values()].sort((x, y) => x.address.localeCompare(y.address))
}

/** What the machine calls itself — the header only, never patient fields. */
export function machineName(raw: string): string | null {
  const lines = raw.split(/[\r\n]+/)
  const msh = lines.find((l) => l.includes('MSH'))
  if (msh) {
    const line = msh.slice(msh.indexOf('MSH'))
    const sep = line.charAt(3) || '|'
    const f = line.split(sep)
    // MSH-3 is f[2], MSH-4 f[3]: the field separator is itself MSH-1.
    const comp = (v?: string) => (v ?? '').split('^')[0].trim()
    const name = [comp(f[2]), comp(f[3])].filter((x) => x && !/^\d{1,2}$/.test(x)).join(' ')
    return name || comp(f[2]) || null
  }
  const h = lines.find((l) => /^\d?H\|/.test(l.replace(/^[\x02]/, '')))
  if (h) {
    const f = h.replace(/^[\x02]?\d?/, '').split('|')
    const name = (f[4] ?? '').split('^').filter(Boolean).slice(0, 2).join(' ').trim()
    return name || null
  }
  return null
}

export type Verdict = { ok: boolean | null; text: string }

/** One line a technician can act on. */
export function verdict(a: AnalyzerLive, now = Date.now()): Verdict {
  if (a.problem) return { ok: false, text: a.problem }
  if (a.results > 0 && a.lastIncomplete) {
    return { ok: null, text: 'Sends, but the last message arrived incomplete — kept and sent to Uyirly to check' }
  }
  if (a.results > 0) return { ok: true, text: `Working — last result ${ago(a.lastResultAt, now)}` }
  if (a.connected) {
    return { ok: null, text: a.kind === 'cable'
      ? 'Port open — waiting for the first result'
      : 'Connected — waiting for the first result' }
  }
  if (a.connections > 0 && a.lastBytes === 0) {
    return { ok: false, text: 'Connects but sends nothing — on the analyzer, check "send results automatically" and send one again' }
  }
  return { ok: false, text: `Not connected since ${ago(a.lastDisconnectedAt ?? a.firstSeenAt, now)}` }
}

function ago(d: Date | null, now: number): string {
  if (!d) return 'never'
  const mins = Math.floor((now - d.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  return hrs < 24 ? `${hrs} h ago` : `${Math.floor(hrs / 24)} d ago`
}
