import { AstmLink } from '../astm-link.js'
import { log } from '../log.js'
import { analyzerConnected, analyzerDisconnected, analyzerProblem, analyzerResult } from '../analyzers-live.js'

/**
 * Analyzers on a cable.
 *
 * RS-232 is still how a great many machines in Indian laboratories talk —
 * Mindray BC-20s, Transasia/Erba H360 — and on plenty of them it is the only
 * port there is. A USB-to-serial adapter is the usual arrangement, which is
 * why a port can vanish mid-shift when somebody knocks the cable: reconnection
 * is expected, not exceptional.
 *
 * Unlike a network socket there is no connect or disconnect event from the
 * instrument, so the link layer's idle timeout is what decides a transmission
 * has ended when a machine does not send EOT.
 *
 * ── Why this import is dynamic, and how it is found ───────────────────────
 *
 * serialport is a native module: it compiles per platform and cannot be baked
 * into a single-file executable the way plain JavaScript can. It therefore
 * travels BESIDE the executable, in a node_modules folder the installer
 * unzips next to it, and is loaded at runtime.
 *
 * Two ways in, tried in order:
 *
 *   1. A normal import. This is what works when the connector is run from
 *      source, and inside a plain Node install.
 *   2. A require anchored to the executable's own directory. Inside a
 *      single-file build there is no module path to resolve against — the
 *      script does not exist on disk — so the lookup has to be told where to
 *      start.
 *
 * If both fail the connector still runs. A hospital whose analyzers are all
 * on the network should never be stopped by a missing serial driver, which is
 * why this is a warning and not a crash.
 */

interface SerialPortLike {
  on(event: 'data', cb: (chunk: Buffer) => void): void
  on(event: 'error', cb: (err: Error) => void): void
  on(event: 'close', cb: () => void): void
  write(data: Buffer): void
  close(cb?: () => void): void
  isOpen: boolean
}

/**
 * The serial driver, from wherever it happens to live.
 *
 * Cached after the first attempt: a connector with several serial analyzers
 * calls this once per port, and a failed native load is slow and noisy.
 */
let cached: unknown | null | undefined
export async function loadSerialPort(): Promise<unknown | null> {
  if (cached !== undefined) return cached

  // 1. Running from source, or from a normal Node install.
  try {
    const mod = await import('serialport')
    cached = (mod as { SerialPort?: unknown }).SerialPort ?? null
    if (cached) return cached
  } catch { /* fall through — expected inside a single-file build */ }

  // 2. Inside a single-file build, beside the executable.
  try {
    const { createRequire } = await import('node:module')
    const path = await import('node:path')
    const beside = path.join(path.dirname(process.execPath), 'index.js')
    const req = createRequire(beside)
    const mod = req('serialport') as { SerialPort?: unknown }
    cached = mod.SerialPort ?? null
    return cached
  } catch {
    cached = null
    return null
  }
}

export async function startSerial(
  devicePath: string,
  baudRate: number,
  onMessage: (raw: string, source: string) => void,
  /** Every chunk as it arrives — capture mode shows them, so a technician
   *  can see the cable is alive before anything parses. */
  onChunk?: (chunk: Buffer) => void,
): Promise<() => void> {
  const mod = await loadSerialPort()
  if (!mod) {
    log.error(`Cannot open ${devicePath}: the serial driver could not be loaded. `
      + 'It should be in the node_modules folder beside this program — if that folder '
      + 'is missing, unzip the download again and keep the files together. '
      + 'Network and folder analyzers are unaffected.')
    return () => {}
  }
  const SerialPort = mod as new (opts: { path: string; baudRate: number }) => SerialPortLike

  let port: SerialPortLike | null = null
  let retry: NodeJS.Timeout | null = null
  let stopped = false

  const key = `serial ${devicePath}`
  const open = () => {
    if (stopped) return
    try {
      port = new SerialPort({ path: devicePath, baudRate })
    } catch (e) {
      analyzerProblem(key, `Cannot open ${devicePath} — is the cable plugged in and no other program using it?`)
      log.warn(`Could not open ${devicePath}: ${(e as Error).message}. Trying again in 30 seconds.`)
      retry = setTimeout(open, 30_000)
      return
    }

    let incomplete = false
    let bytes = 0
    const link = new AstmLink({
      onMessage: (raw) => {
        analyzerResult(key, raw, incomplete)
        incomplete = false
        onMessage(raw, `serial ${devicePath}`)
      },
      send: (data) => { if (port?.isOpen) port.write(data) },
      onWarn: (m) => {
        if (/unrecognised byte/.test(m)) incomplete = true
        log.warn(`${devicePath}: ${m}`)
      },
    })

    analyzerConnected(key)
    log.info(`Listening on ${devicePath} at ${baudRate} baud`)
    port.on('data', (chunk) => { bytes += chunk.length; onChunk?.(chunk); link.push(chunk) })
    port.on('error', (e) => {
      analyzerProblem(key, `${devicePath}: ${e.message}`)
      log.warn(`${devicePath}: ${e.message}`)
    })
    port.on('close', () => {
      link.close()
      analyzerDisconnected(key, bytes)
      if (stopped) return
      // A knocked cable or a pulled USB adapter. Keep trying — the analyzer
      // will still be there when it is plugged back in.
      log.warn(`${devicePath} closed. Reopening in 10 seconds.`)
      retry = setTimeout(open, 10_000)
    })
  }

  open()

  return () => {
    stopped = true
    if (retry) clearTimeout(retry)
    port?.close?.()
  }
}
