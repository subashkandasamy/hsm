'use client'

import { useEffect, useState } from 'react'
import { Images, MoonStar } from 'lucide-react'
import { getStudyViewerLink, type StudyLink } from '@/app/actions/radiology'

/**
 * A way into the scan images, when there are any.
 *
 * Shows nothing at all unless a study has arrived from a machine AND the
 * computer holding it has told us its address. Both are required: the images
 * are on that computer and this is a link to it, not a picture.
 *
 * It opens in a new tab on purpose. The images sit on the hospital's own
 * network, and a normal link reaches them where an embedded image would be
 * blocked — a public site may not ask a private address for a subresource
 * without permission, but navigating to one is untouched by that rule.
 *
 * From outside the hospital the same button opens the images through the
 * computer's internet link, when an admin has switched that on (Settings →
 * Devices). Otherwise the link only opens on the hospital network, and the
 * tooltip says so.
 */
export default function ViewScanButton({ orderId }: { orderId: string }) {
  const [link, setLink] = useState<StudyLink | null>(null)

  useEffect(() => {
    let alive = true
    getStudyViewerLink(orderId).then((l) => { if (alive) setLink(l) }).catch(() => {})
    return () => { alive = false }
  }, [orderId])

  if (!link) return null

  const label = `${link.images} image${link.images === 1 ? '' : 's'}`
  if (link.quietSince) {
    const at = new Date(link.quietSince).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
    })
    // Still a link: if only the hospital's internet is down, the computer is
    // awake and the images open from inside the building.
    return (
      <a href={link.url} target="_blank" rel="noreferrer"
        title={`The computer holding these images has not been in touch since ${at}. It is probably asleep or switched off — wake it, then open the images.`}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
        style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A', textDecoration: 'none' }}>
        <MoonStar className="w-3.5 h-3.5" aria-hidden />
        {label} · computer asleep since {at}
      </a>
    )
  }

  return (
    <a href={link.url} target="_blank" rel="noreferrer"
      title={link.where === 'internet'
        ? "Opens the images on your hospital's computer, over the internet"
        : "Opens the images on your hospital's computer — works on the hospital network"}
      className="px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
      style={{ background: '#0F172A', color: '#fff', textDecoration: 'none' }}>
      <Images className="w-3.5 h-3.5" />
      {label}
    </a>
  )
}
