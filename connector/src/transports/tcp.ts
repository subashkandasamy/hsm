import net from 'node:net'
import { AstmLink } from '../astm-link.js'
import { log } from '../log.js'

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
 */
export function startTcp(
  port: number,
  onMessage: (raw: string, source: string) => void,
): net.Server {
  const server = net.createServer((socket) => {
    const who = `${socket.remoteAddress}:${socket.remotePort}`
    log.info(`Analyzer connected from ${who}`)

    const link = new AstmLink({
      onMessage: (raw) => onMessage(raw, `tcp ${socket.remoteAddress}`),
      send: (data) => { if (!socket.destroyed) socket.write(data) },
      onWarn: (m) => log.warn(`${who}: ${m}`),
    })

    socket.on('data', (chunk) => link.push(chunk))
    socket.on('error', (e) => log.warn(`${who}: ${e.message}`))
    socket.on('close', () => {
      link.close()
      log.info(`Analyzer at ${who} disconnected`)
    })

    // An instrument that opens a socket and then says nothing holds a handle
    // open for ever. Half an hour is far longer than any real transmission.
    socket.setTimeout(30 * 60_000, () => socket.destroy())
  })

  server.on('error', (e) => {
    const err = e as NodeJS.ErrnoException
    if (err.code === 'EADDRINUSE') {
      log.error(`Port ${port} is already being used by another program on this computer. `
        + 'Change the port in Settings → Analyzers, or stop the other program.')
    } else {
      log.error(`Could not listen on port ${port}: ${err.message}`)
    }
  })

  server.listen(port, '0.0.0.0', () => {
    log.info(`Listening for analyzers on port ${port}`)
  })

  return server
}
