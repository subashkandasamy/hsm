import { AstmLink } from '../astm-link.js'
import { log } from '../log.js'

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
 * ── Why this import is dynamic ─────────────────────────────────────────────
 *
 * serialport is a native module: it compiles per platform and cannot be baked
 * into a single-file executable the way plain JavaScript can. Loading it
 * lazily means a connector whose only analyzer is on the network still starts
 * and works if the native part is missing, instead of refusing to run at all.
 */

interface SerialPortLike {
  on(event: 'data', cb: (chunk: Buffer) => void): void
  on(event: 'error', cb: (err: Error) => void): void
  on(event: 'close', cb: () => void): void
  write(data: Buffer): void
  close(cb?: () => void): void
  isOpen: boolean
}

export async function startSerial(
  devicePath: string,
  baudRate: number,
  onMessage: (raw: string, source: string) => void,
): Promise<() => void> {
  let SerialPort: new (opts: { path: string; baudRate: number }) => SerialPortLike
  try {
    const mod = await import('serialport')
    SerialPort = mod.SerialPort as unknown as typeof SerialPort
  } catch {
    log.error(`Cannot open ${devicePath}: serial support is not installed in this build. `
      + 'Network and folder analyzers are unaffected.')
    return () => {}
  }

  let port: SerialPortLike | null = null
  let retry: NodeJS.Timeout | null = null
  let stopped = false

  const open = () => {
    if (stopped) return
    try {
      port = new SerialPort({ path: devicePath, baudRate })
    } catch (e) {
      log.warn(`Could not open ${devicePath}: ${(e as Error).message}. Trying again in 30 seconds.`)
      retry = setTimeout(open, 30_000)
      return
    }

    const link = new AstmLink({
      onMessage: (raw) => onMessage(raw, `serial ${devicePath}`),
      send: (data) => { if (port?.isOpen) port.write(data) },
      onWarn: (m) => log.warn(`${devicePath}: ${m}`),
    })

    log.info(`Listening on ${devicePath} at ${baudRate} baud`)
    port.on('data', (chunk) => link.push(chunk))
    port.on('error', (e) => log.warn(`${devicePath}: ${e.message}`))
    port.on('close', () => {
      link.close()
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
