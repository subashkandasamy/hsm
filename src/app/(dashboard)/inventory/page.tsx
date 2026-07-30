export const dynamic = 'force-dynamic'
import { listItems, listSuppliers, listPurchaseOrders, getStockAlerts, getExpiryAlerts } from '@/app/actions/inventory'
import InventoryClient from './_components/InventoryClient'

export default async function InventoryPage() {
  const [items, suppliers, purchaseOrders, alerts, expiry] = await Promise.all([
    listItems(),
    listSuppliers(),
    listPurchaseOrders(),
    getStockAlerts(),
    getExpiryAlerts(),
  ])

  return (
    <InventoryClient
      initialItems={items}
      initialSuppliers={suppliers}
      initialPOs={purchaseOrders}
      initialAlerts={alerts}
      initialExpiry={expiry}
    />
  )
}
