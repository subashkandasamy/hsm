import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

/**
 * Analyzers that are knocking but cannot be let in.
 *
 * A connection the operating system has half-opened never reaches this
 * program: Node only hears about a socket once the three-way handshake has
 * completed. So from inside the connector a machine stuck in SYN_RECEIVED
 * looks exactly like a machine that was never switched on, and the status
 * page cheerfully says "Working" while a technician two feet away runs sample
 * after sample into nothing.
 *
 * That is not hypothetical. It cost an afternoon in a Karur laboratory: the
 * H360 sat on 10.0.0.101, the laboratory computer on 192.168.1.54, and every
 * connection died half-open because the reply had nowhere to go. Everything
 * the connector could see about itself was healthy.
 *
 * The information exists one layer down, so this asks the operating system.
 */

export interface HalfOpen {
  /** The machine trying to reach us. */
  remoteIp: string
  attempts: number
  /** True when it is on a different network from us — almost always the cause. */
  differentNetwork: boolean
}

/** 192.168.1.54 and 192.168.1.60 are neighbours; 10.0.0.101 is not. */
export function sameNetwork(a: string, b: string, maskBits = 24): boolean {
  const toInt = (ip: string) => ip.split('.').reduce((n, o) => (n << 8) + (Number(o) & 255), 0) >>> 0
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(a) || !/^\d+\.\d+\.\d+\.\d+$/.test(b)) return true
  const mask = maskBits >= 32 ? 0xffffffff : (~((1 << (32 - maskBits)) - 1)) >>> 0
  return ((toInt(a) & mask) >>> 0) === ((toInt(b) & mask) >>> 0)
}

/**
 * Half-open connections on our port, from netstat.
 *
 * Deliberately forgiving: netstat is absent or differently shaped on some
 * systems, and a diagnostic that throws is worse than one that stays quiet.
 * An empty answer means "nothing to report", never "all is well".
 */
export async function findHalfOpen(port: number, ourIp: string | null): Promise<HalfOpen[]> {
  let out = ''
  try {
    const r = await run('netstat', ['-an'], { timeout: 8000, windowsHide: true })
    out = r.stdout
  } catch {
    return []
  }

  const seen = new Map<string, number>()
  for (const line of out.split(/\r?\n/)) {
    // TCP  192.168.1.54:5150   10.0.0.101:52455   SYN_RECEIVED
    if (!/SYN_RECEIVED|SYN_RECV/i.test(line)) continue
    const fields = line.trim().split(/\s+/)
    const local = fields.find((f) => f.endsWith(`:${port}`))
    if (!local) continue
    const remote = fields.find((f) => f !== local && /:\d+$/.test(f))
    if (!remote) continue
    const ip = remote.replace(/:\d+$/, '').replace(/^\[|\]$/g, '')
    seen.set(ip, (seen.get(ip) ?? 0) + 1)
  }

  return [...seen.entries()].map(([remoteIp, attempts]) => ({
    remoteIp,
    attempts,
    differentNetwork: !!ourIp && !sameNetwork(remoteIp, ourIp),
  }))
}
