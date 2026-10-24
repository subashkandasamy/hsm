import { promises as fs } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { AstmLink } from './astm-link.js'
import { log } from './log.js'

/**
 * Listening to a machine nobody has ever connected before.
 *
 * A hospital's analyzers have had a serial socket on the back for years and
 * have never been asked for anything. Before any of them can be supported,
 * somebody has to stand in the laboratory, plug in, run one sample and keep
 * whatever comes out — because what a vendor's brochure says an instrument
 * sends and what it actually sends are different documents.
 *
 * So this is the tool for that visit. It pairs with nothing, uploads nothing,
 * and needs no account:
 *
 *   uyirly-connector --capture
 *   uyirly-connector --capture --serial COM3 --baud 9600
 *
 * Every complete message is written to its own file and printed to the screen.
 * The files go home and become a device library entry; the screen is so the
 * person standing there knows it worked and can run the next sample.
 *
 * ── Why it does not try to understand anything ─────────────────────────────
 *
 * It saves the raw text and names the protocol, and stops there. Parsing lives
 * on the server, where it can be corrected without anybody flying back. A
 * capture tool that quietly mis-parsed a machine would send us home with the
 * wrong answer and no way to tell — whereas raw text, kept, is answerable from
 * anywhere for ever.
 */

export interface CaptureOptions {
  port: number
  outDir: string
  serialPath?: string
  baudRate?: number
  /** Also listen for scanners, and answer their worklist with a test patient. */
  dicom?: boolean
  dicomPort?: number
  dicomAeTitle?: string
}

/** ASTM or HL7, from the first record that carries a name. Nothing more. */
function guessProtocol(text: string): string {
  for (const line of text.split(/[\r\n]+/)) {
    const l = line.trim()
    if (!l) continue
    if (l.startsWith('MSH')) return 'HL7'
    if (/^H[|!~^]/.test(l)) return 'ASTM'
    if (/^[POQRLC]\|/.test(l)) return 'ASTM (no header)'
    return 'unrecognised'
  }
  return 'empty'
}

/** The line most likely to say what the machine is, for the person watching. */
function identityLine(text: string): string {
  const first = text.split(/[\r\n]+/).map((l) => l.trim()).find(Boolean) ?? ''
  return first.length > 120 ? `${first.slice(0, 120)}…` : first
}

export async function runCapture(opts: CaptureOptions): Promise<void> {
  const dir = path.resolve(opts.outDir)
  await fs.mkdir(dir, { recursive: true })

  let n = 0
  const started = new Date()

  const save = async (raw: string, from: string) => {
    n += 1
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const file = path.join(dir, `${stamp}-${String(n).padStart(3, '0')}.txt`)
    // Written before anything is printed, for the same reason the connector
    // writes before it sends: the screen can be scrolled away, the file cannot.
    await fs.writeFile(file, raw, 'utf8')

    console.log(`\n── message ${n} ─────────────────────────────────────────`)
    console.log(`  from      ${from}`)
    console.log(`  protocol  ${guessProtocol(raw)}`)
    console.log(`  identity  ${identityLine(raw)}`)
    console.log(`  lines     ${raw.split(/[\r\n]+/).filter(Boolean).length}`)
    console.log(`  saved     ${file}`)
  }

  console.log(`\n  Capturing to ${dir}`)
  console.log(`  Listening on port ${opts.port} for an analyzer on the network.`)
  if (opts.serialPath) console.log(`  And on ${opts.serialPath} at ${opts.baudRate ?? 9600} baud.`)
  console.log('\n  Point the analyzer at this computer, run one sample, and watch.')
  console.log('  Press Ctrl-C when you have what you need.\n')

  // ── Network ──────────────────────────────────────────────────────────────
  const server = net.createServer((socket) => {
    const who = `${socket.remoteAddress}:${socket.remotePort}`
    console.log(`  → an analyzer connected from ${who}`)
    const link = new AstmLink({
      onMessage: (raw) => { void save(raw, `network ${who}`) },
      send: (data) => { if (!socket.destroyed) socket.write(data) },
      onWarn: (m) => console.log(`  ! ${m}`),
    })
    socket.on('data', (c) => link.push(c))
    socket.on('close', () => { link.close(); console.log(`  ← ${who} disconnected`) })
    socket.on('error', (e) => console.log(`  ! ${who}: ${e.message}`))
  })

  server.on('error', (e: NodeJS.ErrnoException) => {
    // The commonest thing to go wrong on a laptop in a laboratory, and worth
    // saying plainly rather than as a stack trace.
    if (e.code === 'EADDRINUSE') {
      console.log(`\n  Port ${opts.port} is already taken on this computer.`)
      console.log('  Something else is listening — the connector itself, perhaps.')
      console.log('  Stop it, or capture on another port:  --capture --port 5151\n')
    } else {
      console.log(`\n  Could not listen on port ${opts.port}: ${e.message}\n`)
    }
    process.exitCode = 1
    server.close()
  })

  server.listen(opts.port)

  // ── Scanners ─────────────────────────────────────────────────────────────
  //
  // A console proves itself in two steps and both can be done in the room:
  // C-ECHO says the network path is open, and a worklist query says the
  // machine can be driven from a list instead of a keyboard. So the worklist
  // answers with one obviously-fake patient — if that name appears on the
  // X-ray console's screen, radiology is finished bar the account.
  if (opts.dicom) {
    const { startDicom } = await import('./dicom/server.js')
    const scheduled = new Date().toISOString()
    await startDicom(
      {
        dicomPort: opts.dicomPort ?? 11112,
        dicomAeTitle: opts.dicomAeTitle ?? 'UYIRLY',
      } as unknown as import('./config.js').Config,
      {
        getWorklist: async (modality) => {
          console.log(`  → a scanner asked for the worklist${modality ? ` (${modality})` : ''}`)
          return [{
            accessionNumber: 'TEST-0001',
            patientId: 'TEST-0001',
            patientName: 'Uyirly Test Patient',
            patientBirthDate: '1990-01-01',
            patientSex: 'O',
            modality: modality ?? null,
            // Plain ASCII: DICOM's default character set has no em dash, and a
            // console renders one as mojibake, which makes a working
            // connection look broken to the person judging it.
            studyDescription: 'CONNECTION TEST - do not scan a patient',
            scheduledFor: scheduled,
            referringPhysician: null,
          }]
        },
        onStudyComplete: (study) => {
          n += 1
          console.log(`\n── study ${n} ───────────────────────────────────────────`)
          console.log(`  from      ${study.aeTitle}${study.model ? ` (${study.model})` : ''}`)
          console.log(`  accession ${study.accessionNumber ?? '(none — the console typed it by hand)'}`)
          console.log(`  patient   ${study.patientNameRaw ?? '?'}  ${study.patientIdRaw ?? ''}`)
          console.log(`  images    ${study.instanceCount} in ${study.series.length} series, `
            + `${(study.sizeBytes / 1048576).toFixed(1)} MB`)
          console.log(`  saved     ${study.storagePath}`)
        },
      },
    )
    console.log(`  Listening on port ${opts.dicomPort ?? 11112} as "${opts.dicomAeTitle ?? 'UYIRLY'}" for scanners.`)
    console.log('  Their worklist will show one patient called "Uyirly Test Patient".')
  }

  // ── Serial ───────────────────────────────────────────────────────────────
  if (opts.serialPath) {
    const { startSerial } = await import('./transports/serial.js')
    await startSerial(opts.serialPath, opts.baudRate ?? 9600,
      (raw, source) => { void save(raw, source) })
  }

  // Summarise on the way out, because the number captured is the thing the
  // person will be asked when they get back.
  const finish = () => {
    const mins = Math.round((Date.now() - started.getTime()) / 60000)
    console.log(`\n  ${n} message${n === 1 ? '' : 's'} captured in ${mins} minute${mins === 1 ? '' : 's'}.`)
    console.log(`  They are in ${dir}\n`)
    process.exit(0)
  }
  process.on('SIGINT', finish)
  process.on('SIGTERM', finish)

  log.info(`Capture mode on port ${opts.port}, writing to ${dir}`)
}
