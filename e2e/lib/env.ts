// Settings for the E2E suite, read from e2e/.env.e2e (never committed).
// Values already in the process environment win, so a CI job can pass them in.
import fs from 'fs'
import path from 'path'

export const ROOT = path.resolve(__dirname, '..')

function parse(file: string): Record<string, string> {
  if (!fs.existsSync(file)) return {}
  const out: Record<string, string> = {}
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return out
}

const fileEnv = parse(path.join(ROOT, '.env.e2e'))
const get = (k: string, d = ''): string => process.env[k] ?? fileEnv[k] ?? d

export const ROLES = ['admin', 'doctor', 'nurse', 'receptionist', 'lab_tech', 'pharmacist', 'hr', 'accountant'] as const
export type Role = (typeof ROLES)[number]

export const E = {
  base: get('E2E_BASE_URL', 'https://demo.uyirly.com').replace(/\/$/, ''),
  tenant: get('E2E_TENANT_SLUG', 'demo'),
  chrome: get('E2E_CHROME_PATH', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
  headless: get('E2E_HEADLESS', 'true') !== 'false',
  /** Multiply every fixed wait — raise it on a slow connection. */
  waitScale: Number(get('E2E_WAIT_SCALE', '1')) || 1,
  /** Other staff on the test hospital the flows pick from lists. */
  anaesthetist: get('E2E_ANAESTHETIST', 'Dr. Arun Prakash'),
  secondNurse: get('E2E_SECOND_NURSE', 'Sister Anitha John'),
  paediatrician: get('E2E_PAEDIATRICIAN', 'Dr. Lakshmi Iyer'),
}

export interface Account { role: Role; email: string; password: string; name: string }

export function account(role: Role): Account {
  const k = role.toUpperCase()
  const a = { role, email: get(`E2E_${k}_EMAIL`), password: get(`E2E_${k}_PASSWORD`), name: get(`E2E_${k}_NAME`) }
  if (!a.email || !a.password) throw new Error(`E2E_${k}_EMAIL / E2E_${k}_PASSWORD missing in e2e/.env.e2e — run "npm run e2e:accounts"`)
  return a
}

/**
 * The suite clicks through a real hospital's screens and creates patients,
 * bills and records. It must never point at a hospital with real patients.
 */
export function assertSafeTarget() {
  const host = new URL(E.base).hostname
  if (/karur/i.test(host) || /karur/i.test(E.tenant)) throw new Error(`Refusing to run against ${host}: real patients`)
  if (!/^demo\./.test(host) && !/localhost|127\.0\.0\.1/.test(host) && get('E2E_ALLOW_HOST') !== host) {
    throw new Error(`Refusing to run against ${host}. Use the demo hospital, or set E2E_ALLOW_HOST=${host} if it is a test hospital.`)
  }
}

/** Seconds → milliseconds, scaled. */
export const ms = (n: number) => Math.round(n * E.waitScale)
