import Image from 'next/image'

const SLATE2 = '#E2E8F0'
const SLATE5 = '#64748B'

/**
 * A real screenshot of the product, taken from the demo hospital.
 *
 * The sibling ScreenMock draws an idealised screen in CSS; this shows the
 * screen as it actually is. Both keep the same frame so a guide can mix them
 * without looking assembled from two different places.
 *
 * Images come from `npm run shots`, which captures them at twice the size so
 * they stay sharp on a retina display. Pass the captured pixel dimensions —
 * Next needs them to reserve the space before the image loads.
 */
export default function Screenshot({
  src, alt, caption, width, height, priority = false,
}: {
  /** Path under /public, e.g. "/guides/pharmacy-stock.png" */
  src: string
  /** What the screenshot shows, for a reader who cannot see it. Not the caption. */
  alt: string
  caption?: string
  width: number
  height: number
  priority?: boolean
}) {
  return (
    <figure style={{ margin: '1.6rem 0' }}>
      <div style={{
        border: `1px solid ${SLATE2}`, borderRadius: 14, overflow: 'hidden',
        boxShadow: '0 8px 30px rgba(2,6,23,0.06)', background: '#fff',
        lineHeight: 0,
      }}>
        <Image
          src={src} alt={alt} width={width} height={height} priority={priority}
          sizes="(max-width: 768px) 100vw, 768px"
          style={{ width: '100%', height: 'auto', display: 'block' }}
        />
      </div>
      {caption && (
        <figcaption style={{ fontSize: 13, color: SLATE5, marginTop: 8, lineHeight: 1.5 }}>
          {caption}
        </figcaption>
      )}
    </figure>
  )
}
