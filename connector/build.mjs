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
import { createWriteStream, readFileSync, promises as fs } from 'node:fs'
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

// What we are shipping. The installer writes it beside the program so the
// next upgrade can say what it is replacing without running the old build.
// main() still checks it against package.json before anything is written.
const VERSION = /VERSION = '([^']+)'/.exec(
  readFileSync(path.join(HERE, 'src/version.ts'), 'utf8'))?.[1]

const args = process.argv.slice(2)
const wantWin = args.includes('--win') || args.includes('--all')
const wantHost = args.includes('--all') || !wantWin

async function main() {
  // The version is written in two files — package.json, which the publish
  // script reads, and src/version.ts, which the connector reports to the
  // server. They drift silently: a hospital downloads 1.0.2 while the
  // settings screen shows every connector still running 1.0.1, and nobody
  // can tell from a support call what is actually installed.
  const pkgVersion = JSON.parse(readFileSync(path.join(HERE, 'package.json'), 'utf8')).version
  const srcVersion = VERSION
  if (pkgVersion !== srcVersion) {
    console.error(`\n  Version mismatch: package.json says ${pkgVersion}, `
      + `src/version.ts says ${srcVersion}.`)
    console.error('  Set both to the same number before building.\n')
    process.exit(1)
  }
  console.log(`Building version ${pkgVersion}`)

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

  if (wantHost) await copySerialRuntime(process.platform)

  if (wantWin) {
    const nodeExe = await fetchNode('win32', 'x64')
    await inject(nodeExe, path.join(OUT, 'uyirly-connector.exe'), blob, 'win32')
    await copySerialRuntime('win32')
    await writeInstaller()
    await makeZip()
  }

  console.log('\nBuilt into dist-exe/')
  for (const f of await fs.readdir(OUT)) {
    const s = await fs.stat(path.join(OUT, f))
    console.log(`  ${f.padEnd(28)} ${(s.size / 1048576).toFixed(1)} MB`)
  }
}

/**
 * The serial driver, copied to sit beside the executable.
 *
 * serialport is a native module and cannot go inside a single-file build, so
 * it travels next to it in a node_modules folder and is loaded at runtime
 * (see transports/serial.ts). Without this the executable can only ever talk
 * to analyzers on the network — which is most of a laboratory's machines
 * missing, since RS-232 is still the only port on a great many of them.
 *
 * Cross-packaging works because @serialport/bindings-cpp ships prebuilt
 * binaries for every platform inside the npm package, so a Windows build can
 * be assembled on a Mac. Only the target's prebuild is copied; carrying
 * Android and Linux into a hospital's download is pointless weight.
 */
async function copySerialRuntime(platform) {
  const SRC = path.join(HERE, 'node_modules')
  const DEST = path.join(OUT, 'node_modules')

  // Everything serialport needs at run time. node-addon-api is deliberately
  // absent: it is C++ headers used when compiling from source, and we ship a
  // prebuilt binary.
  const walk = (name, seen = new Set()) => {
    if (seen.has(name) || name === 'node-addon-api') return seen
    let pkg
    try { pkg = JSON.parse(readFileSync(path.join(SRC, name, 'package.json'), 'utf8')) }
    catch { return seen }
    seen.add(name)
    for (const dep of Object.keys(pkg.dependencies ?? {})) walk(dep, seen)
    return seen
  }
  const packages = [...walk('serialport')]
  if (!packages.length) {
    console.log('  ! serialport is not installed — the build will have no serial support')
    return
  }

  // The prebuild folder for this target, as node-gyp-build names them.
  const keep = platform === 'win32' ? 'win32-x64'
    : platform === 'darwin' ? 'darwin-x64+arm64'
    : 'linux-x64'

  await fs.rm(DEST, { recursive: true, force: true })
  for (const name of packages) {
    await fs.cp(path.join(SRC, name), path.join(DEST, name), {
      recursive: true,
      filter: (src) => {
        const rel = path.relative(SRC, src)
        const m = rel.match(/prebuilds[/\\]([^/\\]+)/)
        return !m || m[1] === keep
      },
    })
  }

  const size = await dirSize(DEST)
  console.log(`Serial driver copied beside the executable `
    + `(${packages.length} packages, ${keep}, ${(size / 1048576).toFixed(1)} MB)`)
}

async function dirSize(dir) {
  let total = 0
  for (const e of await fs.readdir(dir, { withFileTypes: true, recursive: true })) {
    if (e.isFile()) {
      try { total += (await fs.stat(path.join(e.parentPath ?? e.path, e.name))).size } catch {}
    }
  }
  return total
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

  // Call postject's own script with node rather than the .bin shim. On Windows
  // npm writes postject.cmd and postject.ps1 but no extension-less file, so
  // spawning "node_modules/.bin/postject" fails with ENOENT — which is exactly
  // how the first Windows CI run died.
  const postjectCli = path.join(HERE, 'node_modules/postject/dist/cli.js')
  const flags = [
    postjectCli,
    target, 'NODE_SEA_BLOB', blob,
    '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  ]
  if (platform === 'darwin') flags.push('--macho-segment-name', 'NODE_SEA')
  execFileSync(process.execPath, flags, { stdio: 'inherit' })

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
  // node_modules holds the serial driver and must keep its shape, so the
  // archive is no longer completely flat. The four files a person needs are
  // still at the top of it.
  // Bare names, zipped from inside dist-exe. They used to be absolute paths
  // that -j flattened away; with -r the full build path went into every entry
  // name instead, so a hospital unzipping it got
  // Users/<developer>/Desktop/... before reaching the program.
  const members = ['uyirly-connector.exe', 'install.cmd', 'install.ps1', 'uninstall.ps1', 'INSTALL.txt', 'node_modules']

  if (process.platform === 'win32') {
    // Windows has no `zip`. Compress-Archive is built in, and the build runs
    // here on a CI runner testing the install.
    execFileSync('powershell', ['-NoProfile', '-Command',
      `Compress-Archive -Path ${members.map((m) => `'${m}'`).join(',')} -DestinationPath '${zipPath}' -Force`,
    ], { stdio: 'inherit', cwd: OUT })
  } else {
    // -r rather than -j: the four files stay at the top and node_modules
    // keeps its structure, which it must to be loadable.
    execFileSync('zip', ['-r', '-q', zipPath, ...members], { stdio: 'inherit', cwd: OUT })
  }

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
/**
 * What a person actually double-clicks.
 *
 * Three problems with telling a hospital to right-click a .ps1, all of which
 * cost a real install in Karur:
 *
 *   PowerShell's execution policy refuses unsigned scripts, and on a managed
 *   hospital PC it is often set by Group Policy, where no flag the user can
 *   type will override it. A .cmd file is not a script by that definition and
 *   is never blocked.
 *
 *   "Run with PowerShell" closes the window the instant the script ends —
 *   including when it fails — so the person sees a flash and nothing else.
 *   There is no way to read the error that just scrolled past.
 *
 *   And the script needs Administrator, which right-clicking does not give
 *   it, so it exits immediately on a line nobody can read.
 *
 * So this elevates itself, bypasses the policy for its own child process
 * only, and waits for a keypress at the end whether it worked or not.
 */
async function writeCmd() {
  const body = [
    '@echo off',
    'setlocal',
    'title Uyirly Lab Connector - install',
    '',
    'rem Administrator, or nothing below works: the firewall rules and the',
    'rem startup task both need it. Re-launch ourselves elevated rather than',
    'rem failing with a message nobody can read.',
    'net session >nul 2>&1',
    'if %errorlevel% neq 0 (',
    '  echo Asking for administrator permission...',
    '  powershell -NoProfile -Command "Start-Process -FilePath \'%~f0\' -Verb RunAs"',
    '  exit /b',
    ')',
    '',
    'cd /d "%~dp0"',
    '',
    'rem Windows blocks everything that came out of a downloaded zip until it',
    'rem is unblocked, and the symptom is the script simply not running.',
    'powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Recurse | Unblock-File" >nul 2>&1',
    '',
    'rem -ExecutionPolicy Bypass applies to this one child process only. It',
    'rem changes nothing on the computer and needs no policy to be relaxed.',
    'powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*',
    '',
    'echo.',
    'if %errorlevel% neq 0 (',
    '  echo Install did not finish. The message above says why.',
    ') else (',
    '  echo Done.',
    ')',
    'echo.',
    'rem The whole point: the window stays so the result can be read.',
    'pause',
  ].join('\r\n')
  // CRLF and no BOM: cmd.exe is old and particular about both.
  await fs.writeFile(path.join(OUT, 'install.cmd'), body + '\r\n', 'latin1')
}

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
  await writeCmd()
  await writePs1(path.join(OUT, 'install.ps1'), `# Uyirly Lab Connector - install or upgrade
# Right-click this file and choose "Run with PowerShell (as Administrator)".
#
# Run it on a computer that already has the connector and it upgrades in
# place: no pairing code, no questions, nothing to set up again.
#
# For a first install it asks for the pairing code, or you can supply it:
#   .\\install.ps1 -Code K7MQ-3RXW -Server https://yourhospital.uyirly.com
#
# -Repair pairs again on a computer that is already set up, for the one case
# that needs it: moving this connector to a different hospital.
param(
  [string]$Code,
  [string]$Server,
  [switch]$Repair,
  # Skips the firewall rule and the startup task. Only for testing the rest.
  [switch]$NoService
)

$ErrorActionPreference = 'Stop'
$version = '${VERSION}'
$name    = 'UyirlyLabConnector'
$destDir = "$env:ProgramFiles\\Uyirly\\Connector"
$exe     = "$destDir\\uyirly-connector.exe"

# ── Install or upgrade? ────────────────────────────────────────────────────
#
# The answer is on disk. Settings live in ProgramData and the program lives in
# Program Files, which is the whole reason an upgrade can be this simple: the
# pairing, the analyzer mappings and anything still queued are in the folder
# this script never touches.
#
# Deciding it here rather than asking means the engineer with the screwdriver
# cannot get it wrong, and nobody has to find a pairing code to install a fix.
$configFile = "$env:ProgramData\\Uyirly\\Connector\\config.json"
$upgrade = (Test-Path $configFile) -and (-not $Repair) -and (-not $Code)

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
      ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host ""
  Write-Host "This needs Administrator permission." -ForegroundColor Red
  Write-Host "Close this and double-click install.cmd instead - it asks for permission itself."
  Write-Host ""
  Start-Sleep -Seconds 20
  exit 1
}

# What was here before, read from a file rather than asked of the program.
# Older builds do not know --version, and an unrecognised flag makes the
# connector fall through to starting up in the foreground - so asking would
# hang the installer on exactly the computers an upgrade is for.
$stamp = "$destDir\\version.txt"
$was = if (Test-Path $stamp) { (Get-Content $stamp -Raw).Trim() } else { $null }

if ($upgrade) {
  Write-Host ""
  Write-Host "Upgrading the connector that is already on this computer." -ForegroundColor Cyan
  Write-Host "Its pairing, analyzer settings and anything not yet sent are kept."
  Write-Host ""
}

# Windows will not let us overwrite a running program, and the connector runs
# as a scheduled task from boot. Stopping it first is what makes an upgrade an
# upgrade instead of an "access is denied" and a puzzled engineer.
schtasks /End /TN $name 2>$null | Out-Null
# The task ends asynchronously; a copy started too soon still hits the lock.
for ($i = 0; $i -lt 20; $i++) {
  if (-not (Get-Process -Name 'uyirly-connector' -ErrorAction SilentlyContinue)) { break }
  Start-Sleep -Milliseconds 250
}
Stop-Process -Name 'uyirly-connector' -Force -ErrorAction SilentlyContinue

New-Item -ItemType Directory -Force -Path $destDir | Out-Null
try {
  Copy-Item "$PSScriptRoot\\uyirly-connector.exe" $exe -Force
} catch {
  Write-Host ""
  Write-Host "Could not replace the program file - it is still running." -ForegroundColor Red
  Write-Host "Restart this computer and run this again. Nothing has been changed."
  Write-Host ""
  Start-Sleep -Seconds 20
  exit 1
}

# The serial driver travels beside the program, not inside it: it is a native
# module and cannot be baked into a single file. Leaving it behind in the
# unzip folder is the same as not shipping it, and the failure is silent until
# somebody plugs in a cable months later.
$modules = "$PSScriptRoot\\node_modules"
if (Test-Path $modules) {
  Copy-Item $modules "$destDir\\node_modules" -Recurse -Force
  Write-Host "Serial support installed"
} else {
  Write-Host "No serial driver in this download - network analyzers only" -ForegroundColor Yellow
}

Set-Content -Path "$destDir\\version.txt" -Value $version -Encoding ASCII
Write-Host "Installed to $exe"

# Pair now, while there is a person here to type the code. Skipped on an
# upgrade: this computer is already paired, and asking again would mean
# somebody has to go and make a code before they can install a fix.
if (-not $upgrade) {
if (-not $Code)   { $Code   = Read-Host "Pairing code from Settings -> Analyzers" }
if (-not $Server) { $Server = Read-Host "Hospital web address (e.g. https://yourhospital.uyirly.com)" }
& $exe --pair $Code --server $Server --pair-only
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Pairing failed - nothing else was set up." -ForegroundColor Red
  Write-Host "  - the code lasts one hour, so make a fresh one if it is older"
  Write-Host "  - check this computer can open $Server in a browser"
  Write-Host ""
  exit 1
}
}

if ($NoService) {
  Write-Host "Skipping firewall and startup task (-NoService)."
  & $exe --check
  exit $LASTEXITCODE
}

# Let the analyzers reach us. Harmless if it already exists.
netsh advfirewall firewall delete rule name="Uyirly Lab Connector" 2>$null | Out-Null
netsh advfirewall firewall add rule name="Uyirly Lab Connector" dir=in action=allow \`
  protocol=TCP localport=5150 profile=any | Out-Null
Write-Host "Opened port 5150 for analyzers"

# Scanners. Without this a machine simply cannot reach us and the failure is
# silent at both ends — the console reports a timeout and nothing appears here.
netsh advfirewall firewall delete rule name="Uyirly Scanners (DICOM)" 2>$null | Out-Null
netsh advfirewall firewall add rule name="Uyirly Scanners (DICOM)" dir=in action=allow \`
  protocol=TCP localport=11112 profile=any | Out-Null
Write-Host "Opened port 11112 for scanners"

# The scan viewer. Doctors open it from their own desks, so unlike the status
# page — which stays on this computer only — it has to cross the network.
netsh advfirewall firewall delete rule name="Uyirly Scan Viewer" 2>$null | Out-Null
netsh advfirewall firewall add rule name="Uyirly Scan Viewer" dir=in action=allow \`
  protocol=TCP localport=5152 profile=any | Out-Null
Write-Host "Opened port 5152 so doctors can view scans"
# The status page is deliberately NOT opened in the firewall: it is bound to
# 127.0.0.1 and has no business being reachable from the rest of the hospital.

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

# Somewhere to look. The service has no window of its own, so without this a
# laboratory has no way to see whether it is working short of Command Prompt.
$statusUrl = 'http://localhost:5151'
$link = (New-Object -ComObject WScript.Shell).CreateShortcut(
  [System.IO.Path]::Combine([Environment]::GetFolderPath('CommonDesktopDirectory'), 'Uyirly Lab Connector.lnk'))
$link.TargetPath = $statusUrl
$link.Description = 'Is the lab connector working?'
$link.Save()
Write-Host "Put a shortcut on the desktop: Uyirly Lab Connector"

Write-Host ""
if ($upgrade) {
  $now = $version
  # Say the numbers out loud. The commonest doubt after an upgrade is whether
  # the new file actually took, and "it looked like it worked" is not an answer
  # anyone can act on from three hundred kilometres away.
  if ($was -and $now -and ($was -ne $now)) {
    Write-Host "Done. Upgraded from $was to $now." -ForegroundColor Green
  } elseif ($now) {
    Write-Host "Done. Running version $now." -ForegroundColor Green
  } else {
    Write-Host "Done. The connector is running again." -ForegroundColor Green
  }
  Write-Host "Nothing to set up - it kept its pairing and its settings."
} else {
  Write-Host "Done. The connector is running and will start with Windows." -ForegroundColor Green
}
& $exe --check
Write-Host ""
if (-not $upgrade) { Write-Host "Give the address above to your analyzer engineer." }
`)

  await writePs1(path.join(OUT, 'uninstall.ps1'), `# Uyirly Lab Connector - remove
$ErrorActionPreference = 'SilentlyContinue'
schtasks /End    /TN 'UyirlyLabConnector' | Out-Null
schtasks /Delete /TN 'UyirlyLabConnector' /F | Out-Null
Remove-Item ([System.IO.Path]::Combine([Environment]::GetFolderPath('CommonDesktopDirectory'), 'Uyirly Lab Connector.lnk'))
netsh advfirewall firewall delete rule name="Uyirly Lab Connector" | Out-Null
netsh advfirewall firewall delete rule name="Uyirly Scanners (DICOM)" | Out-Null
netsh advfirewall firewall delete rule name="Uyirly Scan Viewer" | Out-Null
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
  1. Double-click install.cmd
     Choose Yes when Windows asks for administrator permission.
  2. Type the pairing code when asked, then your hospital's web address.
  3. Write down the address it prints, for example  192.168.1.14 : 5150

  The window stays open when it finishes, so you can read the result.

  (install.ps1 is the same thing without the wrapper. Use install.cmd -
  some computers refuse to run .ps1 files at all, and the .cmd works
  around that.)

  Windows may warn that the publisher is unknown. Choose "More info" and then
  "Run anyway" — the file is not yet code-signed.

TO UPGRADE
  Exactly the same: download the new version and double-click install.cmd.

  It sees the connector is already here and upgrades it. No pairing code, no
  questions. It keeps the pairing, the analyzer settings, and any results that
  have not been sent yet. Do NOT uninstall first — that is how a queue of
  results waiting for the internet gets stranded.

  It prints the old and new version numbers when it finishes, so you can see
  the new one took.

TO CONNECT AN ANALYZER
  Give that address to whoever services your analyzer. They enter it as the
  "host" or "LIS" address on the machine. Nothing else needs setting up —
  Uyirly recognises the machine from what it sends.

TO CONNECT A SCANNER (X-ray, ultrasound, CT, MRI)
  Your imaging engineer needs three things, which they type into the machine:

      AE Title:  UYIRLY
      IP:        the address printed above
      Port:      11112

  They will usually press "Verify" or "Echo" first. If that succeeds, the
  wiring is right. Then switch on the worklist so today's patients appear on
  the machine instead of being typed in by hand.

TO CHECK ON IT
  Double-click "Uyirly Lab Connector" on the desktop. A page opens showing
  whether it is working, the address for your engineer, and whether anything
  is waiting to be sent. It refreshes by itself, so you can leave it open.

  That page is only visible on this computer, and never shows patient names.

  If you need more detail, open Command Prompt and run:
      "%ProgramFiles%\\Uyirly\\Connector\\uyirly-connector.exe" --check

  It checks everything — pairing, the internet, the port, the firewall, and
  whether it will restart after a power cut — and tells you how to fix
  anything that is wrong. If you need help, photograph that screen and send
  it to us.

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
