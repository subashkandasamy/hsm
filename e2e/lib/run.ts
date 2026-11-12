// One test run: its folder under e2e/results/, the checks it recorded, and the
// data flows hand to each other (patients registered, admissions, bills …).
import fs from 'fs'
import path from 'path'
import { ROOT } from './env'

export type Result = 'pass' | 'fail' | 'blocked' | 'note'

export interface Check {
  id: string
  flow: string
  role: string
  screen: string
  title: string
  result: Result
  detail?: string
  /** The known bug this check guards (see e2e/known-bugs.json). */
  bug?: string
  shot?: string
  at: string
}

export interface KnownBug {
  id: string; sev: 'Blocker' | 'Major' | 'Minor' | 'Cosmetic'; role: string; screen: string; title: string
  steps: string; expected: string; actual: string; phase: string; shot?: string
}

// Flows hand each other plain JSON (patients, URLs, amounts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Bag = Record<string, any>
export type Patient = Bag & { full_name: string; uhid: string }

export class Run {
  readonly id: string
  readonly dir: string
  readonly shots: string
  /** Short tag added to every patient this run registers, so runs never collide. */
  readonly tag: string
  data: Bag
  checks: Check[]
  flow = ''

  constructor(id?: string) {
    const now = new Date()
    const stamp = now.toISOString().slice(0, 16).replace(/[-:T]/g, '')
    this.id = id ?? `run-${stamp}`
    this.dir = path.join(ROOT, 'results', this.id)
    this.shots = path.join(this.dir, 'shots')
    fs.mkdirSync(this.shots, { recursive: true })
    const ctx = path.join(this.dir, 'ctx.json')
    this.data = fs.existsSync(ctx) ? JSON.parse(fs.readFileSync(ctx, 'utf8')) : {}
    this.tag = this.data.tag ?? `R${stamp.slice(4, 12)}`
    this.data.tag = this.tag
    const cf = path.join(this.dir, 'checks.json')
    this.checks = fs.existsSync(cf) ? JSON.parse(fs.readFileSync(cf, 'utf8')) : []
    this.save()
  }

  save() {
    fs.writeFileSync(path.join(this.dir, 'ctx.json'), JSON.stringify(this.data, null, 2))
    fs.writeFileSync(path.join(this.dir, 'checks.json'), JSON.stringify(this.checks, null, 2))
  }

  /** Remember something for later flows (a patient's UHID, an admission URL …). */
  set(key: string, value: unknown) { this.data[key] = value; this.save() }
  patient(key: string): Patient {
    const p = this.data.patients?.[key]
    if (!p) throw new Blocked(`patient "${key}" was not registered in this run`)
    return p
  }
  setPatient(key: string, patch: Record<string, unknown>) {
    this.data.patients = this.data.patients ?? {}
    this.data.patients[key] = { ...(this.data.patients[key] ?? {}), ...patch }
    this.save()
  }

  private record(c: Omit<Check, 'at' | 'flow'>) {
    const row: Check = { ...c, flow: this.flow, at: new Date().toISOString() }
    const i = this.checks.findIndex((x) => x.id === c.id)
    if (i >= 0) this.checks[i] = row; else this.checks.push(row)
    this.save()
    const tagTxt = c.result === 'fail' && c.bug ? ` [${c.bug}]` : c.result === 'fail' ? ' [NEW]' : ''
    console.log(`${c.result.toUpperCase().padEnd(7)} ${c.id} ${c.title}${tagTxt}${c.detail ? ' — ' + c.detail.slice(0, 160) : ''}`)
  }

  /** A check that passes when `ok` is true. `bug` names the known bug it guards. */
  check(c: { id: string; role: string; screen: string; title: string; ok: boolean; detail?: string; bug?: string; shot?: string }) {
    this.record({ id: c.id, role: c.role, screen: c.screen, title: c.title, result: c.ok ? 'pass' : 'fail', detail: c.detail, bug: c.bug, shot: c.shot })
    return c.ok
  }
  note(c: { id: string; role: string; screen: string; title: string; detail?: string }) { this.record({ ...c, result: 'note' }) }
  /** Run a side step; if it throws, record it as blocked and carry on with the flow. */
  async step(id: string, role: string, screen: string, title: string, fn: () => Promise<unknown>) {
    try { await fn() } catch (e) { this.blocked({ id, role, screen, title, detail: (e as Error).message.split('\n')[0].slice(0, 200) }) }
  }
  blocked(c: { id: string; role: string; screen: string; title: string; detail?: string }) { this.record({ ...c, result: 'blocked' }) }
}

/** Thrown when a flow cannot go on because an earlier step or flow did not happen. */
export class Blocked extends Error {}

export interface Flow {
  name: string
  title: string
  run: (r: Run) => Promise<void>
}
