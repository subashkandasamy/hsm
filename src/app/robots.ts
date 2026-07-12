import type { MetadataRoute } from 'next'

const SITE_URL = 'https://uyirly.com'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // App, auth and account areas — not useful in search and often
        // duplicated across tenant subdomains.
        disallow: [
          '/dashboard',
          '/platform-admin',
          '/account',
          '/api/',
          '/login',
          '/signup/', // allow /signup itself, block any sub-paths
          '/forgot-password',
          '/reset-password',
          '/native-entry',
          '/tenant-not-found',
          '/tenant-suspended',
          '/tenant-expired',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
