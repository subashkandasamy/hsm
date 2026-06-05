'use client'

import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean
}

export default function Input({ hasError, style, onFocus, onBlur, ...props }: InputProps) {
  return (
    <input
      style={{
        width: '100%',
        minHeight: '44px',
        padding: '0.625rem 0.875rem',
        borderRadius: '0.75rem',
        fontSize: '0.875rem',
        background: 'rgba(255,255,255,0.85)',
        border: `1px solid ${hasError ? '#DC2626' : '#E2E8F0'}`,
        color: '#0F172A',
        outline: 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        ...style,
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = hasError ? '#DC2626' : '#0D9488'
        e.currentTarget.style.boxShadow = hasError
          ? '0 0 0 3px rgba(220,38,38,0.1)'
          : '0 0 0 3px rgba(13,148,136,0.1)'
        onFocus?.(e)
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = hasError ? '#DC2626' : '#E2E8F0'
        e.currentTarget.style.boxShadow = 'none'
        onBlur?.(e)
      }}
      {...props}
    />
  )
}
