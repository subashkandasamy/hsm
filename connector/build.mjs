#!/usr/bin/env node
/**
 * Turn the connector into one file a hospital can double-click.
 *
 *   node build.mjs              build for this machine
 *   node build.mjs --win        build the Windows .exe
 *   node build.mjs --all        both
 *
 * ── Why a single executable ────────────────────────────────────────────────
 *
 * The person installing this is a biomedical engineer with a screwdriver, on a
 * laboratory PC that may not have internet and certainly does not have Node.
 * "Install a runtime, then npm install, then..." is where the conversation
 * ends. One file, one pairing code, done.
 *
 * ── How it works ───────────────────────────────────────────────────────────
 *
 * Node's Single Executable Application support: bundle everything to one
 * script, turn that into a blob, and inject the blob into a copy of the node
 * binary itself. The result is node-with-our-code-inside, which is why it is
 * large (~110 MB) and why it needs nothing installed.
 *
 * Cross-building for Windows works because injection only rewrites a resource
 * section — so the Windows node.exe is downloaded and patched here. It is not
 * code-signed, which Windows SmartScreen will mention on first run; signing
 * needs a certificate and is a release concern, noted in INSTALL.txt.
 */

import { execFileSync } from 'node:child_process'
import { createWriteStream, promises as fs } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import os from 'node:os'
import zlib from 'node:zlib'

const HERE = import.meta.dirname
const OUT = path.join(HERE, 'dist-exe')
const BUILD = path.join(HERE, '.build')

// Pinned rather than "latest": the executable IS this Node, so the version is
// part of what we ship and should change deliberately.
const NODE_VERSION = process.env.NODE_TARGET ?? 'v22.20.0'

const args = process.argv.slice(2)
const wantWin = args.includes('--win') || args.includes('--all')
const wantHost = args.includes('--all') || !wantWin

async function main() {
  await fs.mkdir(OUT, { recursive: true })
  await fs.mkdir(BUILD, { recursive: true })

  const bundle = await makeBundle()
  const blob = await makeBlob(bundle)

  if (wantHost) {
    // Deliberately not process.execPath. The executable IS a Node binary with
    // our code inside, so shipping "whatever the developer happened to have
    // installed" makes the build unreproducible — and newer Node binaries
    // carry the injection sentinel more than once, which postject refuses.
    const hostNode = await fetchNode(process.platform, process.arch)
    const ext = process.platform === 'win32' ? '.exe' : ''
    await inject(hostNode, path.join(OUT, `uyirly-connector${ext}`), blob, process.platform)
  }

  if (wantWin) {
    const nodeExe = await fetchNode('win32', 'x64')
    await inject(nodeExe, path.join(OUT, 'uyirly-connector.exe'), blob, 'win32')
    await writeInstaller()
    await makeZip()
  }

  console.log('\nBuilt into dist-exe/')
  for (const f of await fs.readdir(OUT)) {
    const s = await fs.stat(path.join(OUT, f))
    console.log(`  ${f.padEnd(28)} ${(s.size / 1048576).toFixed(1)} MB`)
  }
}

/** One script, because that is what SEA takes. */
async function makeBundle() {
  const file = path.join(BUILD, 'bundle.cjs')
  const esbuild = await import('esbuild')
  await esbuild.build({
    entryPoints: [path.join(HERE, 'src/index.ts')],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',              // SEA runs CommonJS
    outfile: file,
    // serialport is a native module and cannot go inside the executable. Left
    // external so the dynamic import fails gracefully and network and folder
    // analyzers keep working — which is what serial.ts is written to expect.
    external: ['serialport'],
    logLevel: 'warning',
  })
  const { size } = await fs.stat(file)
  console.log(`Bundled to ${(size / 1024).toFixed(0)} KB of JavaScript`)
  return file
}

async function makeBlob(bundlePath) {
  const cfg = path.join(BUILD, 'sea-config.json')
  const blob = path.join(BUILD, 'sea.blob')
  await fs.writeFile(cfg, JSON.stringify({
    main: bundlePath,
    output: blob,
    disableExperimentalSEAWarning: true,
    // Snapshot support varies by platform and buys us little for a program
    // that starts once and runs for months.
    useSnapshot: false,
    useCodeCache: false,
  }, null, 2))
  execFileSync(process.execPath, ['--experimental-sea-config', cfg], { stdio: 'inherit' })
  return blob
}

async function inject(sourceBinary, target, blob, platform) {
  await fs.copyFile(sourceBinary, target)

  // macOS refuses to run a binary whose existing signature no longer matches
  // the bytes, so the old signature comes off before and a fresh ad-hoc one
  // goes on after.
  if (platform === 'darwin') {
    try { execFileSync('codesign', ['--remove-signature', target], { stdio: 'ignore' }) } catch {}
  }

  const postject = path.join(HERE, 'node_modules/.bin/postject')
  const flags = [
    target, 'NODE_SEA_BLOB', blob,
    '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  ]
  if (platform === 'darwin') flags.push('--macho-segment-name', 'NODE_SEA')
  execFileSync(postject, flags, { stdio: 'inherit' })

  if (platform === 'darwin') {
    try { execFileSync('codesign', ['--sign', '-', target], { stdio: 'ignore' }) } catch {}
  }
  if (platform !== 'win32') await fs.chmod(target, 0o755)

  console.log(`Injected → ${path.basename(target)}`)
}


/**
 * One file for the hospital to download.
 *
 * Four loose files means somebody downloads the .exe, misses install.ps1, and
 * rings up. A zip keeps the installer, the uninstaller and the instructions
 * together with the program they refer to.
 *
 * Windows marks a file downloaded from the internet, and PowerShell refuses to
 * run a blocked .ps1 — INSTALL.txt covers Unblock-File, and the installer is
 * launched by right-click → Run with PowerShell, which prompts rather than
 * silently failing.
 */
async function makeZip() {
  const zipName = `uyirly-lab-connector-windows.zip`
  const zipPath = path.join(OUT, zipName)
  await fs.rm(zipPath, { force: true })
  // `zip` ships with macOS and Linux; on Windows the build runs in CI or WSL.
  execFileSync('zip', ['-j', '-q', zipPath,
    path.join(OUT, 'uyirly-connector.exe'),
    path.join(OUT, 'install.ps1'),
    path.join(OUT, 'uninstall.ps1'),
    path.join(OUT, 'INSTALL.txt'),
  ], { stdio: 'inherit' })

  const { size } = await fs.stat(zipPath)
  const { createHash } = await import('node:crypto')
  const hash = createHash('sha256').update(await fs.readFile(zipPath)).digest('hex')
  await fs.writeFile(path.join(OUT, `${zipName}.sha256`), `${hash}  ${zipName}\n`)
  console.log(`Zipped → ${zipName} (${(size / 1048576).toFixed(1)} MB)`)
  console.log(`  sha256 ${hash}`)
}

/**
 * The Node binary we inject into, for a given platform. Cached between builds.
 *
 * Windows publishes node.exe on its own; the others come inside a tarball, so
 * one file is extracted out of it.
 */
async function fetchNode(platform, arch) {
  const plat = platform === 'win32' ? 'win' : platform === 'darwin' ? 'darwin' : 'linux'
  // 'node-bin-' rather than 'node-', so the cached binary cannot collide with
  // the directory name the tarball extracts to.
  const cached = path.join(BUILD, `node-bin-${NODE_VERSION}-${plat}-${arch}${platform === 'win32' ? '.exe' : ''}`)
  try {
    await fs.access(cached)
    console.log(`Using cached Node ${NODE_VERSION} for ${plat}-${arch}`)
    return cached
  } catch { /* fetch it */ }

  if (platform === 'win32') {
    const url = `https://nodejs.org/dist/${NODE_VERSION}/win-${arch}/node.exe`
    console.log(`Downloading ${url}`)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Could not download Node for Windows: HTTP ${res.status}`)
    await pipeline(res.body, createWriteStream(cached))
    return cached
  }

  const name = `node-${NODE_VERSION}-${plat}-${arch}`
  const url = `https://nodejs.org/dist/${NODE_VERSION}/${name}.tar.gz`
  console.log(`Downloading ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not download Node for ${plat}-${arch}: HTTP ${res.status}`)

  const tarball = path.join(BUILD, `${name}.tar.gz`)
  await pipeline(res.body, createWriteStream(tarball))
  execFileSync('tar', ['-xzf', tarball, '-C', BUILD, `${name}/bin/node`], { stdio: 'inherit' })
  await fs.rename(path.join(BUILD, name, 'bin', 'node'), cached)
  await fs.rm(path.join(BUILD, name), { recursive: true, force: true })
  await fs.rm(tarball, { force: true })
  await fs.chmod(cached, 0o755)
  return cached
}

/**
 * Write a PowerShell script Windows will read correctly.
 *
 * Windows PowerShell 5.1 — still the default on the machines this lands on —
 * reads a .ps1 as the system ANSI codepage unless it starts with a UTF-8 byte
 * order mark. Without one, every non-ASCII character in the file is mangled,
 * which at best corrupts a message and at worst breaks a string literal.
 */
async function writePs1(file, body) {
  await fs.writeFile(file, '\ufeff' + body, 'utf8')
}

/**
 * Registering it to start with Windows.
 *
 * A scheduled task at startup rather than a true service: a real service has
 * to answer the service control manager, which a plain Node executable cannot
 * do without a third-party wrapper we would then have to ship and trust. The
 * task runs as SYSTEM, starts before anyone logs in, survives a power cut, and
 * restarts itself if it stops — which is the whole of what a laboratory needs.
 */
async function writeInstaller() {
  await writePs1(path.join(OUT, 'install.ps1'), `# Uyirly Lab Connector - install
# Right-click this file and choose "Run with PowerShell (as Administrator)".

$ErrorActionPreference = 'Stop'
$name    = 'UyirlyLabConnector'
$destDir = "$env:ProgramFiles\\Uyirly\\Connector"
$exe     = "$destDir\\uyirly-connector.exe"

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
      ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host "Please run this as Administrator." -ForegroundColor Red; exit 1
}

New-Item -ItemType Directory -Force -Path $destDir | Out-Null
Copy-Item "$PSScriptRoot\\uyirly-connector.exe" $exe -Force
Write-Host "Installed to $exe"

# Pair now, while there is a person here to type the code.
$code = Read-Host "Pairing code from Settings -> Analyzers"
$site = Read-Host "Hospital web address (e.g. https://yourhospital.uyirly.com)"
& $exe --pair $code --server $site --pair-only
if ($LASTEXITCODE -ne 0) { Write-Host "Pairing failed. Nothing was scheduled." -ForegroundColor Red; exit 1 }

# Let the analyzers reach us. Harmless if it already exists.
netsh advfirewall firewall delete rule name="Uyirly Lab Connector" 2>$null | Out-Null
netsh advfirewall firewall add rule name="Uyirly Lab Connector" dir=in action=allow \`
  protocol=TCP localport=5150 profile=any | Out-Null
Write-Host "Opened port 5150 for analyzers"

# Start with Windows, as SYSTEM, and restart if it ever stops.
$xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Sends laboratory analyzer results to Uyirly.</Description></RegistrationInfo>
  <Triggers><BootTrigger><Enabled>true</Enabled></BootTrigger></Triggers>
  <Principals><Principal id="Author">
    <UserId>S-1-5-18</UserId><RunLevel>HighestAvailable</RunLevel>
  </Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RestartOnFailure><Interval>PT1M</Interval><Count>999</Count></RestartOnFailure>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Enabled>true</Enabled>
  </Settings>
  <Actions Context="Author"><Exec><Command>$exe</Command></Exec></Actions>
</Task>
"@

$xmlPath = "$env:TEMP\\uyirly-task.xml"
[System.IO.File]::WriteAllText($xmlPath, $xml, [System.Text.Encoding]::Unicode)
schtasks /Create /TN $name /XML $xmlPath /F | Out-Null
Remove-Item $xmlPath -Force
schtasks /Run /TN $name | Out-Null

Write-Host ""
Write-Host "Done. The connector is running and will start with Windows." -ForegroundColor Green
& $exe --status
Write-Host ""
Write-Host "Give the address above to your analyzer engineer."
`)

  await writePs1(path.join(OUT, 'uninstall.ps1'), `# Uyirly Lab Connector - remove
$ErrorActionPreference = 'SilentlyContinue'
schtasks /End    /TN 'UyirlyLabConnector' | Out-Null
schtasks /Delete /TN 'UyirlyLabConnector' /F | Out-Null
netsh advfirewall firewall delete rule name="Uyirly Lab Connector" | Out-Null
Remove-Item "$env:ProgramFiles\\Uyirly\\Connector" -Recurse -Force
Write-Host "Removed. Results not yet sent are still in C:\\ProgramData\\Uyirly\\Connector\\queue"
Write-Host "Delete that folder only once you are sure nothing is waiting."
`)

  await fs.writeFile(path.join(OUT, 'INSTALL.txt'), `Uyirly Lab Connector
====================

WHAT THIS IS
  A small program for the computer in your laboratory. It takes results from
  your analyzers and sends them to Uyirly. It keeps them safe on this computer
  if the internet is down, and sends them when it comes back.

BEFORE YOU START
  In Uyirly, go to Settings -> Analyzers, add this computer, and note the
  8-character pairing code.

TO INSTALL
  1. Right-click install.ps1 and choose "Run with PowerShell".
     Choose Yes when it asks for administrator permission.
  2. Type the pairing code when asked.
  3. Write down the address it prints, for example  192.168.1.14 : 5150

  Windows may warn that the publisher is unknown. Choose "More info" and then
  "Run anyway" — the file is not yet code-signed.

TO CONNECT AN ANALYZER
  Give that address to whoever services your analyzer. They enter it as the
  "host" or "LIS" address on the machine. Nothing else needs setting up —
  Uyirly recognises the machine from what it sends.

TO CHECK ON IT
  Open Command Prompt and run:
      "%ProgramFiles%\\Uyirly\\Connector\\uyirly-connector.exe" --status

  It shows whether it is paired, how many results are waiting, and the address
  for your engineer.

IF SOMETHING LOOKS WRONG
  The log is in:
      C:\\ProgramData\\Uyirly\\Connector\\logs

  Results not yet sent are in:
      C:\\ProgramData\\Uyirly\\Connector\\queue

  Nothing is ever deleted from that folder until Uyirly has confirmed it.

TO REMOVE IT
  Right-click uninstall.ps1 and choose "Run with PowerShell".
`, 'utf8')

  console.log('Wrote install.ps1, uninstall.ps1 and INSTALL.txt')
}

main().catch((e) => { console.error(`\nBuild failed: ${e.message}`); process.exit(1) })
