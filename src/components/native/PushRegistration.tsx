'use client'

import { useEffect } from 'react'
import { upsertPushToken } from '@/app/actions/pushTokens'

// Registers for push notifications on native platforms only.
// Renders nothing — mount this once inside the authenticated dashboard layout.
export default function PushRegistration() {
  useEffect(() => {
    async function register() {
      // @capacitor/core — dynamic import keeps web bundle clean
      const { Capacitor } = await import('@capacitor/core')
      if (!Capacitor.isNativePlatform()) return

      const { PushNotifications } = await import('@capacitor/push-notifications')

      // Request permission
      let permResult: { receive: string }
      try {
        permResult = await PushNotifications.requestPermissions()
      } catch {
        // Firebase not configured (no google-services.json) — skip silently
        return
      }
      if (permResult.receive !== 'granted') return

      try {
        await PushNotifications.register()
      } catch {
        return
      }

      // Token received
      PushNotifications.addListener('registration', async ({ value: token }) => {
        const platform = Capacitor.getPlatform() as 'ios' | 'android'
        await upsertPushToken(token, platform)
      })

      PushNotifications.addListener('registrationError', (err) => {
        console.warn('[Push] registration error:', err)
      })
    }

    register().catch(console.warn)
  }, [])

  return null
}
