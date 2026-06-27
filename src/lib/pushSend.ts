// Server-side push notification sender.
// Replace the stub body below with your FCM/APNS provider call.
//
// FCM example (handles both Android and iOS via APNs gateway):
//   POST https://fcm.googleapis.com/v1/projects/{project_id}/messages:send
//   Authorization: Bearer {google_access_token}
//
// To get started:
//   1. Create a Firebase project → add iOS & Android apps
//   2. Add GOOGLE_SERVICE_ACCOUNT_JSON env var (service account key JSON, base64 encoded)
//   3. Replace the stub below with the FCM HTTP v1 send call

export async function sendPushNotification(
  token: string,
  platform: 'ios' | 'android',
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  const fcmKey = process.env.FCM_SERVER_KEY

  if (!fcmKey) {
    // Dev stub
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`  [PUSH STUB] → ${platform} token …${token.slice(-8)}`)
    console.log(`  Title: ${title}`)
    console.log(`  Body:  ${body}`)
    if (data) console.log(`  Data:  ${JSON.stringify(data)}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    return
  }

  // FCM Legacy HTTP (replace with v1 API once service account is configured)
  const res = await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      Authorization: `key=${fcmKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: token,
      notification: { title, body },
      data: data ?? {},
      priority: 'high',
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error(`[Push] FCM error ${res.status}: ${text}`)
  }
}
