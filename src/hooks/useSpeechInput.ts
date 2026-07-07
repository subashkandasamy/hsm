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
  const recRef       = useRef<any>(null)
  const onAppendRef  = useRef(onAppend)
  const listeningRef = useRef(false)   // mutable — avoids stale-state race in onend
  const langRef      = useRef(lang)

  useEffect(() => { onAppendRef.current = onAppend })
  useEffect(() => { langRef.current = lang }, [lang])

  useEffect(() => {
    setSupported(
      typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
    )
  }, [])

  // createSession is stable (empty deps) — refs keep it current
  const createSession = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SR || !listeningRef.current) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec: any = new SR()
    rec.lang           = langRef.current
    rec.continuous     = false  // one utterance per session — prevents mobile duplicate results
    rec.interimResults = true

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      setInterim('')
      if (!listeningRef.current) { recRef.current = null; return }
      if (e.error === 'no-speech') {
        // silence timeout is normal on mobile — just restart
        recRef.current = null
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
      if (listeningRef.current) {
        createSession()   // still listening — spin up a fresh session for the next utterance
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
