import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline/promises'
import { dataDir, saveConfig, lanIp, type Config } from './config.js'
import { VERSION } from './version.js'

/**
 * First run: turn a code somebody read out into an identity for this machine.
 *
 * The hospital's admin creates a lab computer in Settings → Analyzers and gets
 * an eight-character code. It is typed in here once, exchanged for a real
 * token, and never needed again.
 *
 * The token is written to disk and never shown. Nobody has to copy it, email
 * it or keep it anywhere — which is the entire point of pairing rather than
 * handing out tokens.
 */
export interface PairResult {
  config: Config
  /** Results that were waiting for the previous hospital, moved here unsent. */
  setAside: { dir: string; count: number } | null
}

const hostOf = (url: string): string => {
  try { return new URL(url).host.toLowerCase() } catch { return url.toLowerCase() }
}

/**
 * Pair (or pair again, with -Repair) and keep what belongs to this machine.
 *
 * ── What a re-pair keeps ────────────────────────────────────────────────────
 * The chosen storage drive, analyzer cables and watched folders, and the
 * scanner settings are facts about THIS computer, not about the hospital.
 * Losing them made the next start choose a drive again — and if another drive
 * now had more room, every scan on the old one silently stopped showing.
 *
 * ── Moving to a different hospital ──────────────────────────────────────────
 * Results still waiting to send were measured for the OLD hospital. Sent with
 * the new token they would land in the new hospital and could be matched to
 * one of its patients by sample number. So when the hospital's address
 * changes, the queue is set aside — moved, not deleted, not sent — before the
 * new code is claimed, and put back if pairing fails.
 */
export async function pair(
  serverUrl: string, code: string,
  previous: Config | null = null,
  fetchImpl: typeof fetch = fetch,
): Promise<PairResult> {
  const moving = !!previous && hostOf(previous.serverUrl) !== hostOf(serverUrl)
  const queueDir = path.join(dataDir(), 'queue')
  let setAside: PairResult['setAside'] = null

  if (moving) setAside = await setAsideQueue(queueDir, hostOf(previous!.serverUrl))

  let body: {
    token?: string; connectorId?: string; connectorName?: string
    hospital?: string; listenPort?: number; error?: string
  }
  try {
    const res = await fetchImpl(`${serverUrl.replace(/\/$/, '')}/api/device/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code,
        machineName: os.hostname(),
        lanIp: lanIp(),
        version: VERSION,
      }),
    })
    body = await res.json().catch(() => ({})) as typeof body
    if (!res.ok || !body.token) throw new Error(body.error ?? `Pairing failed (HTTP ${res.status})`)
  } catch (e) {
    // Still paired to the old hospital: its results go back where they were.
    if (setAside) await restoreQueue(setAside.dir, queueDir)
    throw e
  }

  const config: Config = {
    token: body.token,
    serverUrl,
    connectorId: body.connectorId ?? '',
    connectorName: body.connectorName ?? 'Lab computer',
    hospital: body.hospital ?? null,
    listenPort: body.listenPort ?? 5150,
    statusPort: previous?.statusPort ?? 5151,
    serial: previous?.serial ?? [],
    watchFolders: previous?.watchFolders ?? [],
    pairedAt: new Date().toISOString(),
    ...(previous?.storageRoot ? { storageRoot: previous.storageRoot } : {}),
    ...(previous?.dicomPort ? { dicomPort: previous.dicomPort } : {}),
    ...(previous?.dicomAeTitle ? { dicomAeTitle: previous.dicomAeTitle } : {}),
    ...(previous?.viewerPort ? { viewerPort: previous.viewerPort } : {}),
  }

  await saveConfig(config)
  return { config, setAside }
}

/** Move waiting results out of the way, with a note saying what they are. */
async function setAsideQueue(queueDir: string, oldHost: string): Promise<PairResult['setAside']> {
  let files: string[] = []
  try { files = (await fs.readdir(queueDir)).filter((f) => f.endsWith('.json')) } catch { return null }
  if (!files.length) return null
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  // A short random tail: two re-pairs in the same second must not collide.
  const tail = Math.random().toString(16).slice(2, 6)
  const dir = path.join(dataDir(), 'set-aside', `${oldHost.replace(/[^a-z0-9.-]/gi, '_')}-${stamp}-${tail}`)
  await fs.mkdir(path.dirname(dir), { recursive: true })
  await fs.rename(queueDir, dir)
  await fs.mkdir(queueDir, { recursive: true })
  await fs.writeFile(path.join(dir, 'README.txt'),
    `${files.length} result(s) were waiting to be sent to ${oldHost} when this computer\r\n`
    + `was paired to another hospital on ${new Date().toString()}.\r\n\r\n`
    + 'They were NOT sent to the new hospital, and they have not been deleted.\r\n'
    + 'If they matter, enter them by hand at the old hospital, or ask Uyirly support.\r\n', 'utf8')
  return { dir, count: files.length }
}

async function restoreQueue(asideDir: string, queueDir: string): Promise<void> {
  await fs.rm(path.join(asideDir, 'README.txt'), { force: true })
  await fs.rm(queueDir, { recursive: true, force: true })
  await fs.rename(asideDir, queueDir)
}

/** Ask at the terminal, for the person running the installer by hand. */
export async function promptForPairing(defaultServer: string): Promise<Config> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    console.log('\n  Uyirly Lab Connector — first time setup\n')
    const serverUrl = (await rl.question(`  Hospital web address [${defaultServer}]: `)).trim()
      || defaultServer
    const code = (await rl.question('  Pairing code from Settings → Analyzers: ')).trim()

    const { config } = await pair(serverUrl, code)
    console.log(`\n  Connected to ${config.hospital ?? 'the hospital'} as "${config.connectorName}".`)
    console.log(`  Give your analyzer engineer:  ${lanIp() ?? '<this computer\'s IP>'} : ${config.listenPort}\n`)
    return config
  } finally {
    rl.close()
  }
}
