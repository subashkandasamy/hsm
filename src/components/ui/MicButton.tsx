import { Mic, MicOff } from 'lucide-react'

interface Props {
  listening: boolean
  onToggle: () => void
  disabled?: boolean
}

export default function MicButton({ listening, onToggle, disabled = false }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      title={listening ? 'Stop recording' : 'Dictate'}
      className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mic-btn"
      style={{
        background: listening ? '#FEE2E2' : 'rgba(13,148,136,0.08)',
        color: listening ? '#DC2626' : '#64748B',
        border: `1px solid ${listening ? '#FECACA' : '#E2E8F0'}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        animation: listening ? 'mic-pulse 1.2s ease-in-out infinite' : 'none',
      }}
    >
      {listening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
    </button>
  )
}
