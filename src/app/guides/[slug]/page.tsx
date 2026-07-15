import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getGuide } from '@/lib/guides/registry'
import { GUIDE_CONTENT, publishedSlugs } from '@/content/guides'
import GuideShell from '@/components/guides/GuideShell'

const SITE = 'https://uyirly.com'

export function generateStaticParams() {
  return publishedSlugs().map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const meta = getGuide(slug)
  if (!meta || !GUIDE_CONTENT[slug]) return {}

  const title = `${meta.metaTitle ?? meta.title} | Uyirly`
  return {
    title,
    description: meta.description,
    keywords: meta.keywords,
    alternates: { canonical: `/guides/${slug}` },
    openGraph: {
      type: 'article',
      url: `/guides/${slug}`,
      title,
      description: meta.description,
      modifiedTime: meta.updated,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: meta.description,
    },
  }
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const meta = getGuide(slug)
  const loader = GUIDE_CONTENT[slug]
  if (!meta || !loader) notFound()

  const mod = await loader()
  const Content = mod.default
  const faqs = mod.faqs

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
          { '@type': 'ListItem', position: 2, name: 'Guides', item: `${SITE}/guides` },
          { '@type': 'ListItem', position: 3, name: meta.title, item: `${SITE}/guides/${slug}` },
        ],
      },
      {
        '@type': 'Article',
        headline: meta.title,
        description: meta.description,
        datePublished: meta.updated,
        dateModified: meta.updated,
        author: { '@type': 'Organization', name: 'Uyirly' },
        publisher: {
          '@type': 'Organization',
          name: 'Uyirly',
          logo: { '@type': 'ImageObject', url: `${SITE}/icon.png` },
        },
        mainEntityOfPage: `${SITE}/guides/${slug}`,
      },
      ...(faqs && faqs.length > 0 ? [{
        '@type': 'FAQPage',
        mainEntity: faqs.map(({ q, a }) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      }] : []),
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <GuideShell meta={meta} faqs={faqs}>
        <Content />
      </GuideShell>
    </>
  )
}
