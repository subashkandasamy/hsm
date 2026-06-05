interface MoneyProps {
  amount: number
  className?: string
  style?: React.CSSProperties
}

export default function Money({ amount, className = '', style }: MoneyProps) {
  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount)

  return <span className={className} style={style}>{formatted}</span>
}
