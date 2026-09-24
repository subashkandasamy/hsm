import os from 'node:os'
import readline from 'node:readline/promises'
import { saveConfig, lanIp, type Config } from './config.js'
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
export async function pair(serverUrl: string, code: string): Promise<Config> {
  const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/device/pair`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      code,
      machineName: os.hostname(),
      lanIp: lanIp(),
      version: VERSION,
    }),
  })

  const body = await res.json().catch(() => ({})) as {
    token?: string; connectorId?: string; connectorName?: string
    hospital?: string; listenPort?: number; error?: string
  }

  if (!res.ok || !body.token) {
    throw new Error(body.error ?? `Pairing failed (HTTP ${res.status})`)
  }

  const config: Config = {
    token: body.token,
    serverUrl,
    connectorId: body.connectorId ?? '',
    connectorName: body.connectorName ?? 'Lab computer',
    hospital: body.hospital ?? null,
    listenPort: body.listenPort ?? 5150,
    statusPort: 5151,
    serial: [],
    watchFolders: [],
    pairedAt: new Date().toISOString(),
  }

  await saveConfig(config)
  return config
}

/** Ask at the terminal, for the person running the installer by hand. */
export async function promptForPairing(defaultServer: string): Promise<Config> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    console.log('\n  Uyirly Lab Connector — first time setup\n')
    const serverUrl = (await rl.question(`  Hospital web address [${defaultServer}]: `)).trim()
      || defaultServer
    const code = (await rl.question('  Pairing code from Settings → Analyzers: ')).trim()

    const config = await pair(serverUrl, code)
    console.log(`\n  Connected to ${config.hospital ?? 'the hospital'} as "${config.connectorName}".`)
    console.log(`  Give your analyzer engineer:  ${lanIp() ?? '<this computer\'s IP>'} : ${config.listenPort}\n`)
    return config
  } finally {
    rl.close()
  }
}
