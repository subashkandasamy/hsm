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
  const recRef          = useRef<any>(null)
  const onAppendRef     = useRef(onAppend)
  const listeningRef    = useRef(false)
  const langRef         = useRef(lang)
  // tracks how many final results we've committed — blocks Chrome Android's duplicate-fire bug
  const processedCount  = useRef(0)

  useEffect(() => { onAppendRef.current = onAppend })
  useEffect(() => { langRef.current = lang }, [lang])

  useEffect(() => {
    setSupported(
      typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
    )
  }, [])

  const createSession = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SR || !listeningRef.current) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec: any = new SR()
    rec.lang           = langRef.current
    rec.continuous     = true   // no gaps — mic stays open the whole time
    rec.interimResults = true

    rec.onstart = () => {
      processedCount.current = 0  // fresh result list for this session
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interimText = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        if (result.isFinal) {
          // skip if we already committed this index (Chrome Android duplicate-fire bug)
          if (i < processedCount.current) continue
          processedCount.current = i + 1
          onAppendRef.current(result[0].transcript.trim())
          setInterim('')
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
        // transient errors — restart session
        recRef.current = null
        processedCount.current = 0
        createSession()
      } else {
        // aborted / network / not-allowed — stop
        listeningRef.current = false
        setListening(false)
        recRef.current = null
      }
    }

    rec.onend = () => {
      setInterim('')
      recRef.current = null
      processedCount.current = 0
      if (listeningRef.current) {
        // session timed out (30-60s) — restart immediately, no gap
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
  }, [])

  const stop = useCallback(() => {
    listeningRef.current = false
    recRef.current?.stop()
    recRef.current = null
    processedCount.current = 0
    setListening(false)
    setInterim('')
  }, [])

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
