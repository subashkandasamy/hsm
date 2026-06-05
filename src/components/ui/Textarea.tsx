'use client'

import type { TextareaHTMLAttributes } from 'react'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean
}

export default function Textarea({ hasError, style, onFocus, onBlur, ...props }: TextareaProps) {
  return (
    <textarea
      style={{
        width: '100%',
        padding: '0.625rem 0.875rem',
        borderRadius: '0.75rem',
        fontSize: '0.875rem',
        background: 'rgba(255,255,255,0.85)',
        border: `1px solid ${hasError ? '#DC2626' : '#E2E8F0'}`,
        color: '#0F172A',
        outline: 'none',
        resize: 'vertical',
        minHeight: '5rem',
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
