// Ways to find things on Uyirly's screens that held up across the 12 Nov run.
// Uyirly's <Select> renders a button plus a hidden native <select>; pick()
// drives the native one, which is what the button mirrors.
import type { Locator, Page } from 'playwright-core'
import { ms } from './env'

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The visible <label> whose whole text is `label` (a trailing * is allowed). */
export const lab = (page: Page | Locator, label: string) =>
  page.locator('label:visible').filter({ hasText: new RegExp('^\\s*' + esc(label.replace(/\s*\*$/, '')) + '\\s*\\*?\\s*$') }).first()

/** The input / textarea / select that belongs to a label. */
export const fld = (page: Page | Locator, label: string) =>
  lab(page, label).locator('xpath=..').locator('input:not([type=checkbox]):not([type=radio]), textarea, select').first()

export async function fill(page: Page | Locator, label: string, v: string) { await fld(page, label).fill(v) }

/** Choose an option (by visible text, exact first, then "contains") in the select under a label. */
export async function pick(page: Page | Locator, label: string, opt: string | RegExp) {
  const sel = lab(page, label).locator('xpath=..').locator('select').first()
  await chooseIn(sel, opt, label)
}

/** Choose an option in a <select> by its text. */
export async function chooseIn(sel: Locator, opt: string | RegExp, what = 'select') {
  const opts = await sel.locator('option').allInnerTexts()
  const o = typeof opt === 'string'
    ? (opts.find((x) => x.trim() === opt) ?? opts.find((x) => x.includes(opt)))
    : opts.find((x) => opt.test(x))
  if (!o) throw new Error(`no option ${String(opt)} in ${what}: ${opts.slice(0, 12).join(' | ')}`)
  await sel.selectOption({ label: o })
  return o
}

/** The first <select> on the page that offers an option matching `has`. */
export const selectOffering = (page: Page, has: string | RegExp) =>
  page.locator('select').filter({ has: page.locator('option', { hasText: has }) }).first()

/** Tick the checkbox whose label text is exactly `t`. */
export async function tick(page: Page | Locator, t: string) {
  await page.locator('label:visible').filter({ hasText: new RegExp('^\\s*' + esc(t) + '\\s*$') }).first().click()
}

/** Open a collapsible section (unless already open — `probe` is a label inside it). */
export async function openSec(page: Page, name: string, probe: string) {
  if (await lab(page, probe).isVisible().catch(() => false)) return
  await page.getByRole('button', { name: new RegExp('^' + esc(name)) }).first().click()
  await page.waitForTimeout(ms(1000))
  if (!(await lab(page, probe).isVisible().catch(() => false))) throw new Error(`section "${name}" did not open`)
}

/** The summary text on a collapsible section's header button. */
export async function secState(page: Page, name: string) {
  return (await page.getByRole('button', { name: new RegExp('^' + esc(name)) }).first().innerText()).replace(/\s+/g, ' ')
}

/**
 * The button labelled `label` that sits inside the card mentioning every string
 * in `inCard` (and none of `notInCard`). Cards here rarely have stable
 * containers, so this walks up from each button.
 */
export async function buttonIn(page: Page, label: string | RegExp, inCard: string[], notInCard: string[] = [], scope = 'main'): Promise<Locator> {
  const re = typeof label === 'string' ? `^${esc(label)}$` : label.source
  const idx: number = await page.evaluate(`(() => {
    const re = new RegExp(${JSON.stringify(re)});
    const btns = [...document.querySelectorAll(${JSON.stringify(scope + ' button, ' + scope + ' a')})].filter(b => re.test((b.textContent || '').trim()));
    const need = ${JSON.stringify(inCard)}, avoid = ${JSON.stringify(notInCard)};
    // Walk up to the card, but stop at a container that holds another such
    // button — that is the list, and a name elsewhere on the page (a banner)
    // would otherwise match.
    return btns.findIndex(b => { let n = b; for (let i = 0; i < 7 && n; i++) { n = n.parentElement; if (!n) break; if (btns.filter(x => x !== b && n.contains(x)).length) return false; const t = n.innerText || ''; if (need.every(s => t.includes(s))) return !avoid.some(s => t.includes(s)) } return false })
  })()`)
  if (idx < 0) throw new Error(`no "${String(label)}" button in a card with ${inCard.join(' + ')}`)
  return page.locator(`${scope} button, ${scope} a`).filter({ hasText: typeof label === 'string' ? new RegExp(`^\\s*${esc(label)}\\s*$`) : label }).nth(idx)
}

/** The table row holding `t`. */
export const row = (page: Page, t: string | RegExp) => page.locator('tr').filter({ hasText: t }).first()

/** Read the message a form shows after a failed submit (or '' if none). */
export async function message(page: Page, re: RegExp): Promise<string> {
  return ((await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').match(re)?.[0] ?? '')
}

export const byPh = (page: Page | Locator, ph: string | RegExp) => page.getByPlaceholder(ph).first()
