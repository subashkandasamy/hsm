import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode
  actions?: ReactNode
}

export default function PageHeader({ title, subtitle, action, actions }: PageHeaderProps) {
  const actionContent = actions ?? action
  return (
    <div className="mb-5 md:mb-6">
      {/* Mobile: title above action (stacked); Desktop: side-by-side */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold truncate" style={{ color: '#0F172A' }}>{title}</h1>
          {subtitle && (
            <p className="mt-0.5 text-sm" style={{ color: '#64748B' }}>{subtitle}</p>
          )}
        </div>
        {actionContent && (
          <div className="flex-shrink-0 flex flex-wrap gap-2">
            {actionContent}
          </div>
        )}
      </div>
    </div>
  )
}
