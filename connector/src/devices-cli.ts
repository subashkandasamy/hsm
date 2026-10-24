import { loadConfig, saveConfig, type Config } from './config.js'
import { loadSerialPort } from './transports/serial.js'

/**
 * Telling the connector about a cable or a folder.
 *
 * Until this existed, `serial` and `watchFolders` were written once at pairing
 * as empty arrays and never written again. The transports themselves were
 * built and tested, and both were listed in the README as supported — but
 * there was no way for anybody to switch either on short of hand-editing
 * config.json on a laboratory PC. Two of the three transports were
 * unreachable from the product.
 *
 * These are commands rather than a screen because the status page is
 * deliberately read-only — a page that can change the connector is a page
 * that can break it from a browser on the hospital's network — and because
 * whoever plugs in a serial cable is already at that keyboard.
 */

function fmt(c: Config): string {
  const lines: string[] = []
  lines.push('')
  lines.push(`  Network analyzers   port ${c.listenPort} (they connect to us)`)
  lines.push(`  Scanners            port ${c.dicomPort ?? 11112} as "${c.dicomAeTitle ?? 'UYIRLY'}"`)
  if (c.serial.length) {
    for (const s of c.serial) lines.push(`  Serial              ${s.path} at ${s.baudRate} baud`)
  } else {
    lines.push('  Serial              none configured')
  }
  if (c.watchFolders.length) {
    for (const f of c.watchFolders) lines.push(`  Watched folder      ${f}`)
  } else {
    lines.push('  Watched folder      none configured')
  }
  lines.push('')
  return lines.join('\n')
}

async function withConfig(fn: (c: Config) => boolean | string): Promise<number> {
  const config = await loadConfig()
  if (!config) {
    console.log('\n  Not paired yet. Run:  uyirly-connector --pair <code>\n')
    return 1
  }
  // Older installs predate these fields; a connector paired last month must
  // not fail here because its config has no `serial` key.
  config.serial ??= []
  config.watchFolders ??= []

  const result = fn(config)
  if (typeof result === 'string') { console.log(`\n  ${result}\n`); return 1 }
  if (result) await saveConfig(config)
  console.log(fmt(config))
  if (result) console.log('  Restart the connector for this to take effect.\n')
  return 0
}

/** What this computer is currently listening to. */
export async function listDevices(): Promise<number> {
  return withConfig(() => false)
}

/**
 * Add a serial analyzer.
 *
 * 9600 is the default because it is what most of these instruments ship with
 * and the one a service engineer will assume if nobody tells them otherwise.
 */
export async function addSerial(devicePath: string, baudRate: number): Promise<number> {
  if (!devicePath) {
    console.log('\n  Which port? e.g.  uyirly-connector --add-serial COM3\n')
    return 1
  }
  if (!Number.isFinite(baudRate) || baudRate <= 0) {
    console.log(`\n  "${baudRate}" is not a baud rate. Common ones are 9600, 19200, 38400, 115200.\n`)
    return 1
  }

  // Said before the port is saved, not after it silently fails at 3am.
  if (!(await loadSerialPort())) {
    console.log('\n  WARNING: the serial driver could not be loaded on this computer.')
    console.log('  The port will be saved, but nothing will be read from it until that is fixed.')
    console.log('  Check that the node_modules folder from the download sits beside this program.')
  }

  return withConfig((c) => {
    const existing = c.serial.find((s) => s.path.toLowerCase() === devicePath.toLowerCase())
    if (existing) {
      if (existing.baudRate === baudRate) return `${devicePath} is already set up at ${baudRate} baud.`
      existing.baudRate = baudRate
      return true
    }
    c.serial.push({ path: devicePath, baudRate })
    return true
  })
}

export async function removeSerial(devicePath: string): Promise<number> {
  return withConfig((c) => {
    const before = c.serial.length
    c.serial = c.serial.filter((s) => s.path.toLowerCase() !== devicePath.toLowerCase())
    if (c.serial.length === before) return `${devicePath} was not set up here.`
    return true
  })
}

/**
 * Watch a folder.
 *
 * For instruments whose only output is a file — several biochemistry
 * analyzers write a result to a shared drive and nothing else.
 */
export async function addFolder(folder: string): Promise<number> {
  if (!folder) {
    console.log('\n  Which folder? e.g.  uyirly-connector --add-folder "D:\\\\LabResults"\n')
    return 1
  }
  return withConfig((c) => {
    if (c.watchFolders.some((f) => f.toLowerCase() === folder.toLowerCase())) {
      return `${folder} is already being watched.`
    }
    c.watchFolders.push(folder)
    return true
  })
}

export async function removeFolder(folder: string): Promise<number> {
  return withConfig((c) => {
    const before = c.watchFolders.length
    c.watchFolders = c.watchFolders.filter((f) => f.toLowerCase() !== folder.toLowerCase())
    if (c.watchFolders.length === before) return `${folder} was not being watched.`
    return true
  })
}

/**
 * The serial ports this computer can see.
 *
 * On Windows a technician rarely knows whether the USB adapter became COM3 or
 * COM7, and Device Manager is several clicks away on a machine they may not
 * be allowed to administer.
 */
export async function listPorts(): Promise<number> {
  const SerialPort = await loadSerialPort() as
    { list?: () => Promise<Array<{ path: string; manufacturer?: string; friendlyName?: string }>> } | null

  if (!SerialPort?.list) {
    console.log('\n  The serial driver could not be loaded, so no ports can be listed.')
    console.log('  Check that the node_modules folder from the download sits beside this program.\n')
    return 1
  }

  const ports = await SerialPort.list()
  if (!ports.length) {
    console.log('\n  No serial ports found. If an adapter is plugged in, check its driver is installed.\n')
    return 0
  }
  console.log('')
  for (const p of ports) {
    const who = p.friendlyName ?? p.manufacturer ?? ''
    console.log(`  ${p.path.padEnd(14)} ${who}`)
  }
  console.log('\n  Add one with:  uyirly-connector --add-serial <port> --baud 9600\n')
  return 0
}
