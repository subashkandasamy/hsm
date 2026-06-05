type StatusVariant =
  | 'success' | 'active' | 'available' | 'paid' | 'completed'
  | 'pending' | 'partial' | 'waiting'
  | 'error' | 'cancelled' | 'critical' | 'inactive'
  | 'info' | 'scheduled'
  | string

const VARIANT_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  success:   { bg: '#DCFCE7', color: '#15803D', border: '#BBF7D0' },
  active:    { bg: '#DCFCE7', color: '#15803D', border: '#BBF7D0' },
  available: { bg: '#DCFCE7', color: '#15803D', border: '#BBF7D0' },
  paid:      { bg: '#DCFCE7', color: '#15803D', border: '#BBF7D0' },
  completed: { bg: '#DCFCE7', color: '#15803D', border: '#BBF7D0' },

  pending:   { bg: '#FEF3C7', color: '#B45309', border: '#FDE68A' },
  partial:   { bg: '#FEF3C7', color: '#B45309', border: '#FDE68A' },
  waiting:   { bg: '#FEF3C7', color: '#B45309', border: '#FDE68A' },

  error:     { bg: '#FEE2E2', color: '#B91C1C', border: '#FECACA' },
  cancelled: { bg: '#FEE2E2', color: '#B91C1C', border: '#FECACA' },
  critical:  { bg: '#FEE2E2', color: '#B91C1C', border: '#FECACA' },
  inactive:  { bg: '#FEE2E2', color: '#B91C1C', border: '#FECACA' },

  info:      { bg: '#DBEAFE', color: '#1D4ED8', border: '#BFDBFE' },
  scheduled: { bg: '#DBEAFE', color: '#1D4ED8', border: '#BFDBFE' },
}

interface StatusBadgeProps {
  status: StatusVariant
  label?: string
}

export default function StatusBadge({ status, label }: StatusBadgeProps) {
  const style = VARIANT_STYLES[status.toLowerCase()] ?? {
    bg: '#F1F5F9', color: '#475569', border: '#E2E8F0',
  }

  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
      style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}
    >
      {label ?? status}
    </span>
  )
}
