'use client'

import { useEffect, useState } from 'react'
import { Images } from 'lucide-react'
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
 * So it works inside the hospital and nowhere else. A doctor at home sees no
 * button, which is honest: there is nothing for them to open yet.
 */
export default function ViewScanButton({ orderId }: { orderId: string }) {
  const [link, setLink] = useState<StudyLink | null>(null)

  useEffect(() => {
    let alive = true
    getStudyViewerLink(orderId).then((l) => { if (alive) setLink(l) }).catch(() => {})
    return () => { alive = false }
  }, [orderId])

  if (!link) return null

  return (
    <a href={link.url} target="_blank" rel="noreferrer"
      title="Opens the images stored on your hospital's computer"
      className="px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
      style={{ background: '#0F172A', color: '#fff', textDecoration: 'none' }}>
      <Images className="w-3.5 h-3.5" />
      {link.images} image{link.images === 1 ? '' : 's'}
    </a>
  )
}
