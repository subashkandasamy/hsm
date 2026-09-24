import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Where the connector keeps its identity and its unsent results.
 *
 * Under the machine's own program-data directory rather than beside the
 * executable, because a laboratory PC's Program Files is usually read-only to
 * the account the service runs as, and because an .exe that rewrites itself is
 * exactly what antivirus is watching for.
 */
export function dataDir(): string {
  // Overridable so a laboratory can put unsent results on a drive that is
  // actually backed up, and so tests never touch a real installation.
  if (process.env.UYIRLY_DATA_DIR) return process.env.UYIRLY_DATA_DIR
  if (process.platform === 'win32') {
    return path.join(process.env.PROGRAMDATA ?? 'C:\\ProgramData', 'Uyirly', 'Connector')
  }
  return path.join(os.homedir(), '.uyirly-connector')
}

export interface Config {
  /** Bearer token, obtained by pairing. The only secret on this machine. */
  token: string
  /** Where results are posted — the hospital's own subdomain. */
  serverUrl: string
  connectorId: string
  connectorName: string
  hospital: string | null
  /** TCP port analyzers connect to. What the service engineer types in. */
  listenPort: number
  /** Where the local status page is served. Loopback only. */
  statusPort?: number
  /** COM ports / tty devices to open, with their line settings. */
  serial: Array<{ path: string; baudRate: number }>
  /** Folders to watch for analyzers that can only write a file. */
  watchFolders: string[]
  pairedAt: string
}

const CONFIG_FILE = 'config.json'

export async function loadConfig(): Promise<Config | null> {
  try {
    const raw = await fs.readFile(path.join(dataDir(), CONFIG_FILE), 'utf8')
    return JSON.parse(raw) as Config
  } catch {
    return null
  }
}

export async function saveConfig(config: Config): Promise<void> {
  const dir = dataDir()
  await fs.mkdir(dir, { recursive: true })
  const file = path.join(dir, CONFIG_FILE)
  const tmp = `${file}.tmp`
  await fs.writeFile(tmp, JSON.stringify(config, null, 2), 'utf8')
  await fs.rename(tmp, file)
  // The token is in here. Owner-only where the filesystem supports it.
  await fs.chmod(file, 0o600).catch(() => {})
}

/**
 * The address a service engineer types into the analyzer's keypad.
 *
 * Picks the first non-internal IPv4 address. A laboratory PC with several
 * adapters (wifi plus a dedicated analyzer LAN) may guess wrong, which is why
 * the settings screen shows what was reported and the port is configurable.
 */
export function lanIp(): string | null {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) return a.address
    }
  }
  return null
}
