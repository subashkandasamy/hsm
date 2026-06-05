'use client'

import type { ReactNode } from 'react'

interface FormFieldProps {
  label: string
  htmlFor?: string
  error?: string
  required?: boolean
  children: ReactNode
  hint?: string
}

export default function FormField({ label, htmlFor, error, required, children, hint }: FormFieldProps) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium"
        style={{ color: '#0F172A' }}
      >
        {label}
        {required && <span className="ml-0.5" style={{ color: '#DC2626' }}>*</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="text-xs" style={{ color: '#94A3B8' }}>{hint}</p>
      )}
      {error && (
        <p className="text-xs font-medium" style={{ color: '#DC2626' }}>{error}</p>
      )}
    </div>
  )
}
