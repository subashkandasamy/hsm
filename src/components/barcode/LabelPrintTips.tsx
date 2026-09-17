// Print-dialog settings that decide whether a label prints at true size.
// Shown next to every label/card print button.
export default function LabelPrintTips({ paper }: { paper: string }) {
  return (
    <ul className="text-xs space-y-0.5 list-disc pl-4" style={{ color: '#64748B' }}>
      <li>Printer: your label printer, paper size <strong style={{ color: '#334155' }}>{paper}</strong></li>
      <li>Scale: <strong style={{ color: '#334155' }}>100% / Actual size</strong> (not &ldquo;Fit to page&rdquo;), margins: none</li>
      <li>Thermal printers: set the driver to 203 or 300 dpi and &ldquo;labels with gaps&rdquo;</li>
    </ul>
  )
}
