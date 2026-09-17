import type { ReactElement } from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { pdfResponse } from './parts'

/** Renders a PDF document element into an inline (or ?download=1) PDF response. */
export async function renderPdfResponse(request: Request, element: ReactElement, filename: string): Promise<Response> {
  const buffer = await renderToBuffer(element as Parameters<typeof renderToBuffer>[0])
  const download = new URL(request.url).searchParams.get('download') === '1'
  return pdfResponse(buffer, filename, download)
}

/** File-name friendly patient name. */
export const fileSafe = (s: string | null | undefined) => (s ?? 'patient').trim().replace(/\s+/g, '-')
