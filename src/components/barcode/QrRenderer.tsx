'use client'

import { QRCodeSVG } from 'qrcode.react'

interface Props {
  /** Encoded value — a patient UHID or a lab-order UUID; the scanner resolves both. */
  value: string
  /** Rendered square size in px. */
  size?: number
  bgColor?: string
  fgColor?: string
}

// Square QR label — camera-friendly (phones read QR far better than thin 1D
// bars) and still fine for hardware QR scanners. Encodes the same values the
// resolver already matches, so no scan logic changes.
export default function QrRenderer({ value, size = 96, bgColor = '#ffffff', fgColor = '#000000' }: Props) {
  if (!value) return null
  return (
    <QRCodeSVG
      value={value}
      size={size}
      level="M"
      marginSize={0}
      bgColor={bgColor}
      fgColor={fgColor}
      style={{ maxWidth: '100%', height: 'auto' }}
    />
  )
}
