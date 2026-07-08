'use client'

import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'

interface Props {
  value: string
  height?: number
  width?: number       // bar width multiplier (1–3)
  fontSize?: number
  displayValue?: boolean
  background?: string
  lineColor?: string
}

export default function BarcodeRenderer({
  value,
  height = 48,
  width = 1.5,
  fontSize = 10,
  displayValue = false,
  background = 'transparent',
  lineColor = '#000000',
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || !value) return
    try {
      JsBarcode(svgRef.current, value, {
        format: 'CODE128',
        height,
        width,
        fontSize,
        displayValue,
        margin: 2,
        background,
        lineColor,
      })
    } catch {
      // value rejected by CODE128 encoder (shouldn't happen with UHID/UUID)
    }
  }, [value, height, width, fontSize, displayValue, background, lineColor])

  return <svg ref={svgRef} style={{ maxWidth: '100%' }} />
}
