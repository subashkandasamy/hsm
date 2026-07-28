'use client'

import { useRef } from 'react'
import { useSpeechInput } from '@/hooks/useSpeechInput'
import MicButton from '@/components/ui/MicButton'

interface Props {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  rows?: number
  className?: string
  style?: React.CSSProperties
  lang?: string
}

// Textarea with built-in browser speech-to-text dictation. Dictated speech is
// appended to the current value. The mic only renders where the browser supports
// SpeechRecognition and the field is writable, so it degrades gracefully.
export default function SpeechTextarea({
  value, onChange, disabled = false, placeholder, rows = 2, className, style, lang,
}: Props) {
  // Track the latest value synchronously so rapid dictation deltas append to the
  // running text (not the value captured at the last render) and none are lost.
  const valueRef = useRef(value)
  valueRef.current = value

  const speech = useSpeechInput({
    onAppend: (t) => {
      const base = valueRef.current
      const next = base ? `${base} ${t}` : t
      valueRef.current = next
      onChange(next)
    },
    ...(lang ? { lang } : {}),
  })

  const showMic = speech.supported && !disabled

  return (
    <div>
      <div className="relative">
        <textarea
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className={className}
          style={{ ...style, paddingRight: showMic ? '2.25rem' : style?.paddingRight }}
        />
        {showMic && (
          <div className="absolute" style={{ top: '0.5rem', right: '0.5rem' }}>
            <MicButton listening={speech.listening} onToggle={speech.toggle} />
          </div>
        )}
      </div>
      {speech.interim && (
        <p className="text-xs mt-1 italic" style={{ color: '#0D9488' }}>🎤 {speech.interim}…</p>
      )}
    </div>
  )
}
