interface DateTextProps {
  date: string | Date | null | undefined
  className?: string
}

// Always the hospital's (IST) calendar day. Without the time zone the server
// (UTC) and the browser (IST) disagree for anything stamped between midnight
// and 05:30 IST, and React throws a hydration error (#418) — BUG-003.
const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' })

export default function DateText({ date, className = '' }: DateTextProps) {
  if (!date) return <span className={className}>—</span>

  const d = new Date(date)
  if (isNaN(d.getTime())) return <span className={className}>—</span>
  const p = Object.fromEntries(parts.formatToParts(d).map((x) => [x.type, x.value]))

  return <span className={className}>{`${p.day}-${p.month}-${p.year}`}</span>
}
