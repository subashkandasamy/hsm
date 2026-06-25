import { listNotifications } from '@/app/actions/notifications'
import NotificationsClient from './_components/NotificationsClient'

export default async function NotificationsPage() {
  const notifications = await listNotifications({ limit: 200 })
  return <NotificationsClient initialNotifications={notifications} />
}
