interface DateTextProps {
  date: string | Date | null | undefined
  className?: string
}

export default function DateText({ date, className = '' }: DateTextProps) {
  if (!date) return <span className={className}>—</span>

  const d = new Date(date)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()

  return <span className={className}>{`${day}-${month}-${year}`}</span>
}
