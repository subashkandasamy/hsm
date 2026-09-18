'use client'

import { useEffect, useRef } from 'react'

/**
 * Catches a hardware barcode scanner anywhere on the screen.
 *
 * A keyboard-wedge scanner is a keyboard that types very fast and presses Enter.
 * That is the whole trick: characters arriving closer together than a person can
 * type, ending in Enter, are a scan. Nobody has to click into a box first.
 *
 * While the cursor is in a text field the keystrokes are left alone — there the
 * scanner is simply typing into whatever the user chose.
 */
export function useScanListener(onScan: (code: string) => void, enabled = true) {
  const buffer = useRef('')
  const lastAt = useRef(0)
  const startedAt = useRef(0)
  const handler = useRef(onScan)
  useEffect(() => { handler.current = onScan }, [onScan])

  useEffect(() => {
    if (!enabled) return

    function isTyping(target: EventTarget | null): boolean {
      const el = target as HTMLElement | null
      if (!el || !el.tagName) return false
      const tag = el.tagName.toLowerCase()
      return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable
    }

    function onKeyDown(e: KeyboardEvent) {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return

      const now = Date.now()
      // A pause means a person, not a scanner: start again.
      if (now - lastAt.current > 60) { buffer.current = ''; startedAt.current = now }
      lastAt.current = now

      if (e.key === 'Enter' || e.key === 'Tab') {
        const code = buffer.current
        buffer.current = ''
        // Long enough to be a code, and delivered faster than hands can type.
        if (code.length >= 6 && now - startedAt.current < 900) {
          e.preventDefault()
          handler.current(code)
        }
        return
      }

      if (e.key.length === 1) buffer.current += e.key
      else if (e.key !== 'Shift') buffer.current = ''
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
