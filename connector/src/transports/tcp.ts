import net from 'node:net'
import { AstmLink } from '../astm-link.js'
import { log } from '../log.js'
import { analyzerConnected, analyzerDisconnected, analyzerResult } from '../analyzers-live.js'

/**
 * Analyzers that speak over the network.
 *
 * The machine is the one that connects, not us: a service engineer types this
 * computer's IP and port into the analyzer's keypad and it opens a socket when
 * it has something to say. That is why nothing here needs configuring per
 * instrument — whatever connects gets the same handshake, and the server works
 * out what it is from the message it sends.
 *
 * Several analyzers can be wired to one connector, so connections are handled
 * concurrently and each gets its own link state. Two machines mid-transmission
 * must never have their records interleaved into one message.
 *
 * ── Failing to take the port is not survivable ─────────────────────────────
 *
 * This used to log "port already in use" and carry on, and the program then
 * announced it was ready and sat there for ever with nothing listening. A
 * hospital would point an analyzer at it, see results never arrive, and have
 * nothing to go on. Now the caller is told whether the port was actually
 * taken, and binding is retried in case whatever holds it lets go.
 */
export function startTcp(
  port: number,
  onMessage: (raw: string, source: string) => void,
  onBound?: (bound: boolean) => void,
): { close: () => void } {
  let server: net.Server | null = null
  let retry: NodeJS.Timeout | null = null
  let stopped = false
  let announced = false

  const build = () => {
    if (stopped) return

    const srv = net.createServer((socket) => {
      const who = `${socket.remoteAddress}:${socket.remotePort}`
      log.info(`Analyzer connected from ${who}`)
      // One row per machine on the status page (analyzers-live.ts). IPv4
      // addresses arrive as "::ffff:192.168.1.60" on a dual-stack socket.
      const key = `tcp ${(socket.remoteAddress ?? '?').replace(/^::ffff:/, '')}`
      analyzerConnected(key)
      let incomplete = false

      const link = new AstmLink({
        onMessage: (raw) => {
          analyzerResult(key, raw, incomplete)
          incomplete = false
          onMessage(raw, `tcp ${socket.remoteAddress}`)
        },
        send: (data) => { if (!socket.destroyed) socket.write(data) },
        onWarn: (m) => {
          if (/unrecognised byte/.test(m)) incomplete = true
          log.warn(`${who}: ${m}`)
        },
      })

      socket.on('data', (chunk) => link.push(chunk))
      socket.on('error', (e) => log.warn(`${who}: ${e.message}`))
      socket.on('close', () => {
        const { bytes, began } = link.summary()
        link.close()
        analyzerDisconnected(key, bytes)
        // What it sent, readably — the one line that tells us how a new
        // analyzer talks, without a capture tool or a packet sniffer.
        log.info(bytes
          ? `Analyzer at ${who} disconnected after sending ${bytes} byte(s), beginning: ${began}`
          : `Analyzer at ${who} disconnected without sending anything`)
      })

      // An instrument that opens a socket and then says nothing holds a handle
      // open for ever. Half an hour is far longer than any real transmission.
      socket.setTimeout(30 * 60_000, () => socket.destroy())
    })

    srv.on('error', (e) => {
      const err = e as NodeJS.ErrnoException
      if (err.code === 'EADDRINUSE') {
        log.error(`Port ${port} is already being used by another program on this `
          + 'computer, so analyzers cannot reach us. Stop that program, or change '
          + 'the port in Settings → Analyzers. Trying again every 15 seconds.')
      } else {
        log.error(`Could not listen on port ${port}: ${err.message}. Trying again in 15 seconds.`)
      }
      if (!announced) { announced = true; onBound?.(false) }
      srv.close()
      server = null
      if (!stopped) retry = setTimeout(build, 15_000)
    })

    srv.listen(port, '0.0.0.0', () => {
      server = srv
      log.info(`Listening for analyzers on port ${port}`)
      // Only now is it true. Saying so before this is how a laboratory ends up
      // waiting on results that were never going to arrive.
      onBound?.(true)
      announced = true
    })
  }

  build()

  return {
    close: () => {
      stopped = true
      if (retry) clearTimeout(retry)
      server?.close()
    },
  }
}
