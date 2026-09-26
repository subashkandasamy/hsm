import path from 'node:path'
import { dataDir, loadConfig, lanIp, type Config } from './config.js'
import { initLog, log } from './log.js'
import { Queue } from './queue.js'
import { Uploader } from './uploader.js'
import { promptForPairing, pair } from './pair.js'
import { runCheck } from './check.js'
import { startStatusPage, type LiveState } from './status-page.js'
import { startDicom } from './dicom/server.js'
import { fetchWorklist, reportStudy, fetchViewerKey } from './radiology.js'
import { startTcp } from './transports/tcp.js'
import { startFolderWatch } from './transports/folder.js'
import { startSerial } from './transports/serial.js'

/**
 * The Uyirly Lab Connector.
 *
 * It sits on a computer in the laboratory and does one thing: take what the
 * analyzers say and get it to the hospital's Uyirly account, losing nothing on
 * the way.
 *
 * ── The order of operations, which is the whole design ─────────────────────
 *
 *   analyzer → link layer → DISK → uploader → server
 *
 * A message is written to disk the moment it is complete, before any attempt
 * to send it. Everything after that is retry logic. An analyzer transmits once
 * and forgets, so the disk write is the only moment that cannot be repeated —
 * and it is the one that happens first, offline, with no network involved.
 *
 * Usage:
 *   uyirly-connector                 run (prompts to pair on first use)
 *   uyirly-connector --pair CODE     pair without prompting
 *   uyirly-connector --status        what is waiting, and where the files are
 *   uyirly-connector --check         diagnose everything, and say how to fix it
 */

const DEFAULT_SERVER = process.env.UYIRLY_SERVER ?? 'https://demo.uyirly.com'

async function main(): Promise<void> {
  await initLog()

  const args = process.argv.slice(2)
  const flag = (name: string): string | undefined => {
    const i = args.indexOf(name)
    return i >= 0 ? args[i + 1] : undefined
  }

  const queue = new Queue(path.join(dataDir(), 'queue'))
  await queue.init()

  // Everything a support call opens with, in one screen somebody can photograph.
  if (args.includes('--check')) {
    process.exitCode = await runCheck(await loadConfig())
    return
  }

  if (args.includes('--status')) {
    const config = await loadConfig()
    console.log(`\n  Paired:   ${config ? `yes, to ${config.hospital ?? config.serverUrl}` : 'no'}`)
    console.log(`  Waiting:  ${await queue.size()} result(s) not yet sent`)
    console.log(`  Files:    ${dataDir()}`)
    console.log(`  Address:  ${lanIp() ?? 'unknown'} : ${config?.listenPort ?? 5150}\n`)
    return
  }

  let config: Config | null = await loadConfig()

  const code = flag('--pair')
  if (code) {
    config = await pair(flag('--server') ?? DEFAULT_SERVER, code)
    log.info(`Paired with ${config.hospital ?? config.serverUrl} as "${config.connectorName}"`)
    // The installer pairs while somebody is standing there to type the code,
    // then hands running over to the scheduled task. Exiting non-zero on
    // failure is what lets it stop before scheduling anything.
    if (args.includes('--pair-only')) {
      console.log(`\n  Paired with ${config.hospital ?? config.serverUrl}.`)
      console.log(`  Analyzers should send to ${lanIp() ?? 'this computer'} : ${config.listenPort}\n`)
      return
    }
  } else if (!config) {
    if (!process.stdin.isTTY) {
      log.error('Not set up yet, and there is nobody to ask. '
        + 'Run:  uyirly-connector --pair <code from Settings → Analyzers>')
      process.exitCode = 1
      return
    }
    config = await promptForPairing(DEFAULT_SERVER)
  }

  log.info(`Uyirly Lab Connector starting for ${config.hospital ?? config.serverUrl}`)
  log.info(`Results are kept in ${dataDir()}`)

  const uploader = new Uploader(queue, config)

  // What the status page reads. Kept here rather than inside the page so the
  // page stays a view and never becomes something the connector depends on.
  const live: LiveState = {
    tcpBound: false, lastMessageAt: null, receivedCount: 0, lastProblem: null,
  }

  // The single path every transport funnels into. Persist, then try to send —
  // and never the other way round.
  const receive = async (raw: string, source: string): Promise<void> => {
    try {
      const { stored, id } = await queue.add(raw, source)
      if (!stored) {
        log.info(`Repeat of a message already queued (${source}) — ignored.`)
        return
      }
      log.info(`Received ${raw.length} bytes from ${source}, saved as ${id.slice(0, 8)}`)
      live.lastMessageAt = new Date()
      live.receivedCount += 1
      uploader.nudge()
    } catch (e) {
      // The one genuinely bad outcome: a real measurement we could not write
      // down. Say so loudly — the laboratory needs to type this one in.
      live.lastProblem = `A result from ${source} could not be saved to this computer `
        + 'and must be entered by hand. Please call support.'
      log.error(`COULD NOT SAVE a result from ${source}: ${(e as Error).message}. `
        + 'This result must be entered by hand.')
    }
  }

  const stoppers: Array<() => void> = []

  const tcp = startTcp(
    config.listenPort,
    (raw, src) => void receive(raw, src),
    (bound) => { live.tcpBound = bound },
  )
  stoppers.push(() => tcp.close())

  // Fetched rather than stored at pairing, so a connector installed before
  // links were signed starts verifying them without being reinstalled.
  let viewerKey: string | null = null
  void fetchViewerKey(config).then((k) => { viewerKey = k })

  const statusPage = startStatusPage(
    config.statusPort ?? 5151, config, live, config.viewerPort ?? 5152,
    () => viewerKey,
  )
  stoppers.push(() => statusPage.close())

  // Scanners. Same program, another port — a hospital installs one thing
  // whether its machines are analyzers, scanners or both.
  const dicom = await startDicom(config, {
    getWorklist: (modality) => fetchWorklist(config, modality),
    onStudyComplete: (study) => {
      live.lastMessageAt = new Date()
      live.receivedCount += 1
      void reportStudy(config, study)
    },
  })
  stoppers.push(() => dicom.close())

  for (const folder of config.watchFolders) {
    stoppers.push(startFolderWatch(folder, (raw, src) => void receive(raw, src)))
  }

  for (const s of config.serial) {
    stoppers.push(await startSerial(s.path, s.baudRate, (raw, src) => void receive(raw, src)))
  }

  uploader.start()

  const waiting = await queue.size()
  if (waiting) log.info(`${waiting} result(s) from last time are waiting to be sent.`)

  // listen() resolves asynchronously, so give it a moment before claiming
  // anything. Announcing "Ready" while the port was taken is exactly how this
  // program once sat for ever with nothing listening.
  await new Promise((r) => setTimeout(r, 500))
  if (live.tcpBound) {
    log.info(`Ready. Analyzers should send to ${lanIp() ?? 'this computer'} : ${config.listenPort}`)
  } else {
    log.error('NOT ready for network analyzers — port '
      + `${config.listenPort} could not be opened. Anything on a serial cable or `
      + 'in a watched folder still works, and we keep trying for the port.')
  }

  const shutdown = (signal: string) => {
    log.info(`Stopping (${signal}). Anything unsent stays on disk and goes when we start again.`)
    uploader.stop()
    for (const stop of stoppers) stop()
    process.exit(0)
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((e) => {
  log.error(`Could not start: ${(e as Error).message}`)
  process.exitCode = 1
})
