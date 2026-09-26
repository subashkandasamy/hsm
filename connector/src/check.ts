import net from 'node:net'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { dataDir, lanIp, type Config } from './config.js'
import { Queue } from './queue.js'
import { checkDisk, humanBytes, WARN_FREE_BYTES, REFUSE_FREE_BYTES } from './dicom/disk.js'

const exec = promisify(execFile)

/**
 * One command that answers every question a support call opens with.
 *
 * The Windows side of this program cannot be rehearsed from a developer's
 * machine: the installer, the startup task and the firewall rule only exist
 * once they are on Windows. So the next best thing is a connector that can
 * explain its own state clearly enough for somebody to photograph the screen
 * and send it — no log hunting, no "try this and tell me what happens".
 *
 * Each line is a fact somebody can act on, and where it fails it says what to
 * do rather than what went wrong. Exits non-zero if anything is broken, so the
 * installer can refuse to finish on a machine that will not work.
 */

type State = 'ok' | 'warn' | 'bad'
interface Line { state: State; label: string; detail: string; fix?: string }

export async function runCheck(config: Config | null): Promise<number> {
  const lines: Line[] = []

  // ── Paired ────────────────────────────────────────────────────────────────
  if (!config) {
    lines.push({
      state: 'bad', label: 'Paired', detail: 'not set up yet',
      fix: 'Add a lab computer in Settings → Analyzers, then run:  uyirly-connector --pair <code>',
    })
    print(lines)
    return 1
  }
  lines.push({
    state: 'ok', label: 'Paired',
    detail: `${config.hospital ?? config.serverUrl} as "${config.connectorName}"`,
  })

  // ── Can we reach the server, and does our token still work? ──────────────
  const ping = await pingServer(config)
  lines.push(ping.line)

  // ── The port analyzers connect to ────────────────────────────────────────
  lines.push(await checkPort(config.listenPort))

  // ── The scanner port ─────────────────────────────────────────────────────
  lines.push(await checkDicomPort(config.dicomPort ?? 11112, config.dicomAeTitle ?? 'UYIRLY'))

  // ── Windows firewall ─────────────────────────────────────────────────────
  const fw = await checkFirewall(config.listenPort)
  if (fw) lines.push(fw)
  const fwD = await checkFirewall(config.dicomPort ?? 11112, 'Uyirly Scanners (DICOM)', 'scanners')
  if (fwD) lines.push(fwD)

  // ── Does it start with the computer? ─────────────────────────────────────
  const task = await checkStartup()
  if (task) lines.push(task)

  // ── Room for more images ─────────────────────────────────────────────────
  const diskLine = await checkImageDisk()
  if (diskLine) lines.push(diskLine)

  // ── Anything stuck on this machine ───────────────────────────────────────
  lines.push(await checkQueue())

  // ── What the hospital still has to do at their end ───────────────────────
  if (ping.body) {
    const { analyzersSeen = 0, needingAttention = 0 } = ping.body
    lines.push({
      state: 'ok', label: 'Analyzers seen',
      detail: analyzersSeen === 0
        ? 'none yet — no machine has sent anything'
        : `${analyzersSeen}`,
    })
    if (needingAttention > 0) {
      lines.push({
        state: 'warn', label: 'Waiting on you',
        detail: `${needingAttention} result${needingAttention === 1 ? '' : 's'} need attention`,
        fix: 'Open Settings → Analyzers on the website to resolve them.',
      })
    }
  }

  print(lines)

  const ip = lanIp()
  console.log(`  Give your analyzer engineer:  ${ip ?? '<this computer\'s IP address>'} : ${config.listenPort}`)
  if (!ip) {
    console.log('  (This computer has no network address we can see — check it is on the LAN.)')
  }
  console.log(`\n  Files:  ${dataDir()}\n`)

  return lines.some((l) => l.state === 'bad') ? 1 : 0
}

async function pingServer(config: Config): Promise<{ line: Line; body?: Record<string, number> }> {
  const url = `${config.serverUrl.replace(/\/$/, '')}/api/device/ping`
  const started = Date.now()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15_000)
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${config.token}` },
      signal: controller.signal,
    })
    clearTimeout(timer)
    const body = await res.json().catch(() => ({})) as Record<string, unknown>

    if (res.status === 401 || res.status === 403) {
      return { line: {
        state: 'bad', label: 'Server',
        detail: 'reachable, but this computer is no longer recognised',
        fix: String(body.error ?? 'Pair it again from Settings → Analyzers.'),
      } }
    }
    if (!res.ok) {
      return { line: {
        state: 'bad', label: 'Server',
        detail: `answered with an error (HTTP ${res.status})`,
        fix: 'Try again in a few minutes. Results are safe on this computer meanwhile.',
      } }
    }
    return {
      line: { state: 'ok', label: 'Server', detail: `reachable · ${Date.now() - started} ms` },
      body: body as Record<string, number>,
    }
  } catch (e) {
    const why = (e as Error).name === 'AbortError'
      ? 'no answer within 15 seconds'
      : (e as Error).message
    return { line: {
      state: 'bad', label: 'Server', detail: `cannot reach ${config.serverUrl} — ${why}`,
      // The common causes, in the order they actually occur.
      fix: 'Check this computer has internet. If it goes through a proxy or a '
        + 'firewall, allow outbound HTTPS to the address above. Results are held '
        + 'here safely until it works.',
    } }
  }
}

/**
 * Is our connector listening on the port, or has something else taken it?
 *
 * This used to answer by trying to bind the port, which could not tell the two
 * apart — "in use" was reported identically whether it was our own service
 * doing its job or a stray program blocking every analyzer in the laboratory.
 * It also raced with the service it was meant to be checking.
 *
 * So ask properly. An analyzer opens the conversation with ENQ and expects
 * ACK; our connector answers, and essentially nothing else will. That tests
 * the thing that actually matters — whether an instrument's first byte gets
 * the right reply — rather than a proxy for it.
 */
async function checkPort(port: number): Promise<Line> {
  const ENQ = 0x05, ACK = 0x06

  const outcome = await new Promise<'ours' | 'someone-else' | 'nothing'>((resolve) => {
    const sock = net.createConnection({ port, host: '127.0.0.1' })
    const done = (r: 'ours' | 'someone-else' | 'nothing') => {
      sock.destroy()
      resolve(r)
    }
    const timer = setTimeout(() => done('someone-else'), 4000)

    sock.on('connect', () => sock.write(Buffer.from([ENQ])))
    sock.on('data', (d) => {
      if (d.includes(ACK)) { clearTimeout(timer); done('ours') }
    })
    sock.on('error', () => { clearTimeout(timer); done('nothing') })
    sock.on('close', () => { clearTimeout(timer); resolve('nothing') })
  })

  if (outcome === 'ours') {
    return { state: 'ok', label: `Port ${port}`, detail: 'the connector is listening and answering' }
  }
  if (outcome === 'someone-else') {
    return {
      state: 'bad', label: `Port ${port}`,
      detail: 'something is on this port, but it is not the connector',
      fix: 'Another program has taken the port, so no analyzer can reach us. '
        + 'Stop it, or change the port in Settings → Analyzers.',
    }
  }
  return {
    state: 'warn', label: `Port ${port}`,
    detail: 'nothing is listening — analyzers cannot connect',
    fix: 'The connector is not running. Check the startup task below, or start it.',
  }
}

/**
 * Is our own DICOM server answering?
 *
 * Asked the same way a scanner asks: open an association and send C-ECHO, the
 * "are you there" every imaging engineer tries first. Nothing but a DICOM
 * server will answer it, so this distinguishes us from a stray program on the
 * port — exactly as the lab check sends ENQ and waits for ACK.
 */
async function checkDicomPort(port: number, aeTitle: string): Promise<Line> {
  let answered = false
  try {
    const dimse = ((await import('dcmjs-dimse')) as unknown as {
      default: typeof import('dcmjs-dimse')
    }).default
    const { Client, requests } = dimse

    answered = await new Promise<boolean>((resolve) => {
      const client = new Client()
      const req = new requests.CEchoRequest()
      let ok = false
      req.on('response', () => { ok = true })
      client.addRequest(req)
      client.on('networkError', () => resolve(false))
      client.on('closed', () => resolve(ok))
      setTimeout(() => resolve(ok), 6000)
      client.send('127.0.0.1', port, 'UYIRLY-CHECK', aeTitle)
    })
  } catch {
    return {
      state: 'warn', label: `Scanner port ${port}`,
      detail: 'could not be tested in this build',
    }
  }

  if (answered) {
    return { state: 'ok', label: `Scanner port ${port}`, detail: `answering as "${aeTitle}"` }
  }
  return {
    state: 'warn', label: `Scanner port ${port}`,
    detail: 'nothing is answering — scanners cannot send here',
    fix: 'The connector may not be running, or another program has the port. '
      + 'If you have no scanners, this line can be ignored.',
  }
}

/** Only meaningful on Windows; elsewhere there is nothing useful to say. */
async function checkFirewall(
  port: number,
  ruleName = 'Uyirly Lab Connector',
  what = 'analyzers',
): Promise<Line | null> {
  if (process.platform !== 'win32') return null
  const label = what === 'analyzers' ? 'Firewall' : 'Firewall (scanners)'
  try {
    const { stdout } = await exec('netsh',
      ['advfirewall', 'firewall', 'show', 'rule', `name=${ruleName}`])
    if (/Enabled:\s*Yes/i.test(stdout)) {
      return { state: 'ok', label, detail: `allowed (inbound TCP ${port})` }
    }
    return {
      state: 'warn', label, detail: 'a rule exists but is switched off',
      fix: 'Re-run install.ps1 as Administrator to repair it.',
    }
  } catch {
    return {
      state: 'bad', label, detail: `no rule — ${what} cannot reach this computer`,
      fix: `Run as Administrator:  netsh advfirewall firewall add rule name="${ruleName}" dir=in action=allow protocol=TCP localport=${port}`,
    }
  }
}

/** Will it come back after a power cut? */
async function checkStartup(): Promise<Line | null> {
  if (process.platform !== 'win32') return null
  try {
    const { stdout } = await exec('schtasks', ['/Query', '/TN', 'UyirlyLabConnector'])
    const running = /Running/i.test(stdout)
    return {
      state: 'ok', label: 'Runs at startup',
      detail: running ? 'yes, and running now' : 'yes, currently stopped',
    }
  } catch {
    return {
      state: 'warn', label: 'Runs at startup',
      detail: 'no — it will not come back after a restart',
      fix: 'Re-run install.ps1 as Administrator.',
    }
  }
}

/**
 * Whether there is room for more scans.
 *
 * Shown only once images exist, because a laboratory with no scanner has no
 * reason to be told about a folder it does not use. A full disk is the one
 * failure here that silently loses a patient's study, so it is worth a line.
 */
async function checkImageDisk(): Promise<Line | null> {
  const dir = path.join(dataDir(), 'dicom')
  const s = await checkDisk(dir)
  if (!s) return null
  if (s.usedByImagesBytes === 0 && s.freeBytes > WARN_FREE_BYTES) return null

  const used = humanBytes(s.usedByImagesBytes)
  const free = humanBytes(s.freeBytes)

  if (s.freeBytes < REFUSE_FREE_BYTES) {
    return {
      state: 'bad', label: 'Room for scans',
      detail: `only ${free} free — scanners are being REFUSED`,
      fix: 'Free space on this computer, or move old studies off it. Scanners will '
        + 'report a failure until there is room, which is deliberate: better that '
        + 'somebody is told than that a study goes missing.',
    }
  }
  if (s.freeBytes < WARN_FREE_BYTES) {
    return {
      state: 'warn', label: 'Room for scans',
      detail: `${free} free, scans using ${used}`,
      fix: 'Plan to free space before it runs out.',
    }
  }
  return { state: 'ok', label: 'Room for scans', detail: `${free} free, scans using ${used}` }
}

async function checkQueue(): Promise<Line> {
  const queue = new Queue(path.join(dataDir(), 'queue'))
  try {
    await queue.init()
    const pending = await queue.list()
    if (!pending.length) {
      return { state: 'ok', label: 'Waiting to send', detail: 'nothing — everything has gone through' }
    }
    const oldest = pending[0]
    const ageMin = Math.floor((Date.now() - new Date(oldest.receivedAt).getTime()) / 60_000)
    const stuck = pending.some((m) => m.attempts > 5)
    return {
      state: stuck ? 'warn' : 'ok',
      label: 'Waiting to send',
      detail: `${pending.length} result${pending.length === 1 ? '' : 's'}, oldest ${
        ageMin < 60 ? `${ageMin} min` : `${Math.floor(ageMin / 60)} hr`} old`,
      fix: stuck ? `Last error: ${oldest.lastError ?? 'unknown'}` : undefined,
    }
  } catch (e) {
    return {
      state: 'bad', label: 'Waiting to send',
      detail: `cannot read the queue folder — ${(e as Error).message}`,
      fix: `Check this folder exists and is writable: ${path.join(dataDir(), 'queue')}`,
    }
  }
}

function print(lines: Line[]): void {
  // Plain ASCII marks. A Windows console in its default codepage turns ✓ and ✗
  // into mojibake, and a diagnostic that looks broken is worse than none.
  const mark: Record<State, string> = { ok: ' ok ', warn: ' !! ', bad: ' XX ' }
  console.log('\n  Uyirly Lab Connector — check\n')
  for (const l of lines) {
    console.log(`  [${mark[l.state]}] ${l.label.padEnd(17)} ${l.detail}`)
    if (l.fix && l.state !== 'ok') {
      // Wrapped rather than one long line, because this gets photographed.
      for (const chunk of wrap(l.fix, 62)) console.log(`${' '.repeat(26)}${chunk}`)
    }
  }
  console.log('')
}

function wrap(text: string, width: number): string[] {
  const words = text.split(' ')
  const out: string[] = []
  let line = ''
  for (const w of words) {
    if ((line + w).length > width) { out.push(line.trimEnd()); line = '' }
    line += `${w} `
  }
  if (line.trim()) out.push(line.trimEnd())
  return out
}
