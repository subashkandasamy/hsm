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
      // App header is always teal — use light icons (white) so they're visible
      // regardless of whether the phone is in dark or light mode
      await StatusBar.setStyle({ style: Style.Dark })
      await StatusBar.setBackgroundColor({ color: '#0D9488' })
    }

    initStatusBar().catch(() => {})
  }, [])

  return null
}
