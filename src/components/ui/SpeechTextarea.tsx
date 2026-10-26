'use client'

import { useRef } from 'react'
import { useSpeechInput } from '@/hooks/useSpeechInput'
import MicButton from '@/components/ui/MicButton'
import PhrasePicker from '@/components/ui/PhrasePicker'
import Textarea from '@/components/ui/Textarea'
import type { ClinicalTemplate } from '@/lib/types'

interface Props {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  rows?: number
  className?: string
  style?: React.CSSProperties
  lang?: string
  // 'plain' is a bare textarea dressed by the caller's own class names, which is
  // what the clinical panels do. 'field' borrows the shared Textarea so a note
  // box sitting in a FormField keeps the focus ring every other control has —
  // without that, moving those fields onto this component would be a visible
  // downgrade, and the whole point is that every note field shares one box.
  variant?: 'plain' | 'field'
  // A key from lib/noteFields turns on the saved-phrase picker for this box.
  // Without one the component behaves exactly as it always has, so a field
  // opts in rather than inheriting a dropdown nobody asked for.
  fieldKey?: string
  department?: ClinicalTemplate | null
}

// Textarea with built-in browser speech-to-text dictation. Dictated speech is
// appended to the current value. The mic only renders where the browser supports
// SpeechRecognition and the field is writable, so it degrades gracefully.
export default function SpeechTextarea({
  value, onChange, disabled = false, placeholder, rows = 2, className, style, lang,
  variant = 'plain', fieldKey, department,
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

  const showMic     = speech.supported && !disabled
  const showPhrases = !!fieldKey && !disabled
  // Both buttons live inside the box, so the text has to stop short of them.
  const buttons = (showMic ? 1 : 0) + (showPhrases ? 1 : 0)

  const boxProps = {
    value,
    disabled,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value),
    placeholder,
    rows,
    className,
    style: {
      ...style,
      paddingRight: buttons ? `${1.25 + buttons * 1.75}rem` : style?.paddingRight,
    },
  }

  return (
    <div>
      <div className="relative">
        {variant === 'field' ? <Textarea {...boxProps} /> : <textarea {...boxProps} />}
        {buttons > 0 && (
          <div className="absolute flex items-start gap-1" style={{ top: '0.5rem', right: '0.5rem' }}>
            {showPhrases && (
              <PhrasePicker
                fieldKey={fieldKey!}
                department={department}
                currentText={value}
                onInsert={(t) => onChange(value.trim() ? `${value.trimEnd()} ${t}` : t)}
              />
            )}
            {showMic && <MicButton listening={speech.listening} onToggle={speech.toggle} />}
          </div>
        )}
      </div>
      {speech.interim && (
        <p className="text-xs mt-1 italic" style={{ color: '#0D9488' }}>🎤 {speech.interim}…</p>
      )}
    </div>
  )
}
