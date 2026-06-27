'use client'

import { useEffect } from 'react'
import { upsertPushToken } from '@/app/actions/pushTokens'

export default function PushRegistration() {
  useEffect(() => {
    async function register() {
      const { Capacitor } = await import('@capacitor/core')
      if (!Capacitor.isNativePlatform()) return

      const { PushNotifications } = await import('@capacitor/push-notifications')

      let permResult: { receive: string }
      try {
        permResult = await PushNotifications.requestPermissions()
      } catch {
        return
      }
      if (permResult.receive !== 'granted') return

      try {
        await PushNotifications.register()
      } catch (err) {
        console.warn('[Push] register error:', err)
        return
      }

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
