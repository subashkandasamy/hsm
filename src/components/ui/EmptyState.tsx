import { InboxIcon } from 'lucide-react'

interface EmptyStateProps {
  title?: string
  description?: string
  icon?: React.ReactNode
}

export default function EmptyState({
  title = 'No data yet',
  description,
  icon,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: 'rgba(226,232,240,0.6)', border: '1px solid #E2E8F0' }}
      >
        {icon ?? <InboxIcon className="w-6 h-6" style={{ color: '#94A3B8' }} />}
      </div>
      <p className="text-base font-semibold" style={{ color: '#475569' }}>{title}</p>
      {description && (
        <p className="mt-1 text-sm max-w-xs" style={{ color: '#94A3B8' }}>{description}</p>
      )}
    </div>
  )
}
