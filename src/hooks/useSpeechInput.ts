'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

interface Options {
  onAppend: (text: string) => void
  lang?: string
}

export function useSpeechInput({ onAppend, lang = 'en-IN' }: Options) {
  const [listening, setListening] = useState(false)
  const [supported, setSupported] = useState(false)
  const [interim, setInterim] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null)
  const onAppendRef = useRef(onAppend)
  useEffect(() => { onAppendRef.current = onAppend })

  useEffect(() => {
    setSupported(
      typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
    )
  }, [])

  const stop = useCallback(() => {
    recRef.current?.stop()
    recRef.current = null
    setListening(false)
    setInterim('')
  }, [])

  const start = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SR) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec: any = new SR()
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true   // real-time partial results

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interimText = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        if (result.isFinal) {
          onAppendRef.current(result[0].transcript.trim())
          setInterim('')
        } else {
          interimText += result[0].transcript
        }
      }
      if (interimText) setInterim(interimText)
    }
    rec.onerror = () => { setListening(false); setInterim(''); recRef.current = null }
    rec.onend   = () => { setListening(false); setInterim(''); recRef.current = null }

    recRef.current = rec
    rec.start()
    setListening(true)
  }, [lang])

  const toggle = useCallback(() => {
    if (listening) stop(); else start()
  }, [listening, start, stop])

  return { listening, supported, toggle, stop, interim }
}
