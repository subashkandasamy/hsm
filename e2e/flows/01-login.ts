import { open, login, as, go, wait, bodyText, pathOf } from '../lib/browser'
import { ROLES, account, E } from '../lib/env'
import type { Flow } from '../lib/run'

export default {
  name: 'login', title: '01 Sign-in',
  async run(r) {
    const s = await open(); const page = s.page
    try {
      await page.goto(`${E.base}/dashboard`, { waitUntil: 'networkidle' })
      r.check({ id: 'L-01', role: 'anyone', screen: '/dashboard', title: 'Signed out: /dashboard sends you to sign-in', ok: pathOf(page).startsWith('/login'), detail: pathOf(page) })
      const a = account('admin')
      const where = await login(page, a.email, a.password + 'x')
      const t = await bodyText(page)
      r.check({ id: 'L-02', role: 'admin', screen: '/login', title: 'Wrong password is refused with a message', ok: where.startsWith('/login') && /invalid|incorrect|wrong/i.test(t), detail: t.match(/[^.]*(invalid|incorrect|wrong)[^.]*/i)?.[0]?.slice(0, 120) })
      await page.locator('#email').fill(''); await page.locator('#password').fill('')
      await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await wait(page, 1500)
      r.check({ id: 'L-03', role: 'admin', screen: '/login', title: 'Empty email and password: stays on sign-in', ok: pathOf(page).startsWith('/login') })
    } finally { await s.close() }

    for (const role of ROLES) {
      try {
        const x = await as(role); const where = pathOf(x.page)
        r.check({ id: `L-10-${role}`, role, screen: where, title: `${role} signs in to the app`, ok: !where.startsWith('/login') && where !== '/change-password', detail: where })
        if (role === 'receptionist') {
          const out = x.page.getByRole('button', { name: /sign out|log out|logout/i }).first()
          await out.click(); await x.page.waitForURL((u) => u.pathname.startsWith('/login') || u.pathname === '/', { timeout: 15000 }).catch(() => {})
          r.check({ id: 'L-11', role, screen: 'Logout', title: 'Logout returns to sign-in', ok: /^\/(login)?$/.test(pathOf(x.page)), detail: pathOf(x.page) })
          await go(x.page, '/billing')
          r.check({ id: 'L-12', role, screen: '/billing', title: 'After logout the back door (/billing) asks to sign in again', ok: pathOf(x.page).startsWith('/login'), detail: pathOf(x.page) })
        }
        await x.close()
      } catch (e) { r.check({ id: `L-10-${role}`, role, screen: '/login', title: `${role} signs in to the app`, ok: false, detail: (e as Error).message.slice(0, 160) }) }
    }
  },
} satisfies Flow
