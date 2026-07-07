'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

interface Options {
  onAppend: (text: string) => void
  lang?: string
}

export function useSpeechInput({ onAppend, lang = 'en-IN' }: Options) {
  const [listening, setListening] = useState(false)
  const [supported, setSupported]  = useState(false)
  const [interim, setInterim]      = useState('')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef         = useRef<any>(null)
  const onAppendRef    = useRef(onAppend)
  const listeningRef   = useRef(false)
  const langRef        = useRef(lang)
  // Mobile Chrome sends cumulative final results ("to", "to let", "to let me"…).
  // We track the last committed text and only append the delta.
  const lastCommitted  = useRef('')
  // Also track processed indices to block same-index duplicate fires (desktop Chrome bug).
  const processedCount = useRef(0)

  useEffect(() => { onAppendRef.current = onAppend })
  useEffect(() => { langRef.current = lang }, [lang])

  useEffect(() => {
    setSupported(
      typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
    )
  }, [])

  const resetSession = useCallback(() => {
    lastCommitted.current  = ''
    processedCount.current = 0
  }, [])

  const createSession = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SR || !listeningRef.current) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec: any = new SR()
    rec.lang           = langRef.current
    rec.continuous     = true
    rec.interimResults = true

    rec.onstart = () => { resetSession() }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interimText = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        if (result.isFinal) {
          // block same-index duplicate fires
          if (i < processedCount.current) continue
          processedCount.current = i + 1

          const fullText = result[0].transcript.trim()

          // Mobile sends cumulative text — extract only the new part
          let delta = fullText
          if (lastCommitted.current && fullText.startsWith(lastCommitted.current)) {
            delta = fullText.slice(lastCommitted.current.length).trim()
          }
          lastCommitted.current = fullText

          if (delta) {
            onAppendRef.current(delta)
            setInterim('')
          }
        } else {
          interimText += result[0].transcript
        }
      }
      if (interimText) setInterim(interimText)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      setInterim('')
      if (!listeningRef.current) { recRef.current = null; return }
      if (e.error === 'no-speech' || e.error === 'audio-capture') {
        recRef.current = null
        resetSession()
        createSession()
      } else {
        listeningRef.current = false
        setListening(false)
        recRef.current = null
      }
    }

    rec.onend = () => {
      setInterim('')
      recRef.current = null
      resetSession()
      if (listeningRef.current) {
        createSession()
      } else {
        setListening(false)
      }
    }

    recRef.current = rec
    try {
      rec.start()
    } catch {
      listeningRef.current = false
      setListening(false)
      recRef.current = null
    }
  }, [resetSession])

  const stop = useCallback(() => {
    listeningRef.current = false
    recRef.current?.stop()
    recRef.current = null
    resetSession()
    setListening(false)
    setInterim('')
  }, [resetSession])

  const start = useCallback(() => {
    if (listeningRef.current) return
    listeningRef.current = true
    setListening(true)
    createSession()
  }, [createSession])

  const toggle = useCallback(() => {
    if (listeningRef.current) stop(); else start()
  }, [stop, start])

  return { listening, supported, toggle, stop, interim }
}
