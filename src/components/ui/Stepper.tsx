import { Check, X } from 'lucide-react'

export interface StepperStep {
  key: string
  label: string
  state: 'done' | 'current' | 'pending'
}

interface StepperProps {
  steps: StepperStep[]
  /** Shows a terminal red "Rejected" node instead of continuing the happy path. */
  rejected?: boolean
  rejectedAtLabel?: string
  /** Clicking a step scrolls to that stage's section — pure navigation, no action triggered. */
  onStepClick?: (key: string) => void
}

export default function Stepper({ steps, rejected, rejectedAtLabel, onStepClick }: StepperProps) {
  return (
    <div className="flex items-center overflow-x-auto pb-1">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1
        const dotStyle =
          step.state === 'done'
            ? { background: '#0D9488', color: '#fff', border: '1px solid #0D9488' }
            : step.state === 'current'
              ? { background: '#fff', color: '#0D9488', border: '2px solid #0D9488' }
              : { background: '#F1F5F9', color: '#94A3B8', border: '1px solid #E2E8F0' }

        return (
          <div key={step.key} className="flex items-center flex-shrink-0">
            <button
              type="button"
              onClick={() => onStepClick?.(step.key)}
              disabled={!onStepClick}
              className="flex flex-col items-center"
              style={{ minWidth: '96px', background: 'none', border: 'none', cursor: onStepClick ? 'pointer' : 'default' }}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                style={dotStyle}
              >
                {step.state === 'done' ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span
                className="mt-1.5 text-xs font-medium text-center"
                style={{ color: step.state === 'pending' ? '#94A3B8' : '#0F172A' }}
              >
                {step.label}
              </span>
            </button>
            {!isLast && (
              <div
                className="flex-shrink-0"
                style={{
                  height: '2px', width: '32px', marginBottom: '18px',
                  background: step.state === 'done' ? '#0D9488' : '#E2E8F0',
                }}
              />
            )}
          </div>
        )
      })}

      {rejected && (
        <div className="flex items-center flex-shrink-0">
          <div
            className="flex-shrink-0"
            style={{ height: '2px', width: '32px', marginBottom: '18px', background: '#DC2626' }}
          />
          <div className="flex flex-col items-center" style={{ minWidth: '96px' }}>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: '#DC2626', color: '#fff', border: '1px solid #DC2626' }}
            >
              <X className="w-4 h-4" />
            </div>
            <span className="mt-1.5 text-xs font-semibold text-center" style={{ color: '#DC2626' }}>
              Rejected{rejectedAtLabel ? ` — ${rejectedAtLabel}` : ''}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
