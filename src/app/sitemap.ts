import type { MetadataRoute } from 'next'
import { GUIDES } from '@/lib/guides/registry'
import { publishedSlugs } from '@/content/guides'
import { SOLUTIONS, solutionSlugs } from '@/lib/solutions/registry'
import { citySlugs } from '@/lib/locations/registry'
import { toolSlugs } from '@/lib/tools/registry'

const SITE_URL = 'https://www.uyirly.com'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const published = new Set(publishedSlugs())

  const guideEntries: MetadataRoute.Sitemap = GUIDES
    .filter((g) => published.has(g.slug))
    .map((g) => ({
      url: `${SITE_URL}/guides/${g.slug}`,
      lastModified: new Date(g.updated),
      changeFrequency: 'monthly',
      priority: g.tier === 'pillar' ? 0.8 : 0.7,
    }))

  // Commercial solution pages — buyer intent, high priority.
  const solutionEntries: MetadataRoute.Sitemap = solutionSlugs().map((slug) => ({
    url: `${SITE_URL}/${slug}`,
    lastModified: new Date(SOLUTIONS[slug].updated),
    changeFrequency: 'monthly',
    priority: 0.9,
  }))

  return [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/pricing`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/guides`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.85,
    },
    {
      url: `${SITE_URL}/solutions`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.85,
    },
    {
      url: `${SITE_URL}/tools`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    ...toolSlugs().map((slug) => ({
      url: `${SITE_URL}/tools/${slug}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    ...solutionEntries,
    // Location pages — "hospital management software in [city]"
    ...citySlugs().map((slug) => ({
      url: `${SITE_URL}/hospital-management-software/${slug}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    ...guideEntries,
    {
      url: `${SITE_URL}/signup`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/security`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.4,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ]
}
