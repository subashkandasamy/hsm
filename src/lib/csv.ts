/**
 * A CSV file from rows, and a way to hand it to the browser.
 *
 * Quoting follows RFC 4180: a cell containing a comma, a quote or a line break
 * is wrapped in quotes, with its quotes doubled. Browser only for `downloadCsv`.
 */

export type CsvCell = string | number | null | undefined

export function toCsv(head: string[], rows: CsvCell[][]): string {
  const cell = (v: CsvCell) => {
    const s = v == null ? '' : String(v)
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [head.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))].join('\n')
}

export function downloadCsv(filename: string, head: string[], rows: CsvCell[][]): void {
  const blob = new Blob([toCsv(head, rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
