'use client'

import { useEffect } from 'react'

export default function PwaInit() {
  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((err) => console.warn('[SW] registration failed:', err))
    }

    // Configure native status bar on Capacitor
    async function initStatusBar() {
      const { Capacitor } = await import('@capacitor/core')
      if (!Capacitor.isNativePlatform()) return

      const { StatusBar, Style } = await import('@capacitor/status-bar')
      // App header is always teal — use Light style (white icons) so they're
      // visible on the dark teal background regardless of phone theme
      await StatusBar.setStyle({ style: Style.Light })
      await StatusBar.setBackgroundColor({ color: '#0D9488' })
    }

    initStatusBar().catch(() => {})
  }, [])

  return null
}
