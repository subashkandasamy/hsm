import { listItems, listSuppliers, listPurchaseOrders, getStockAlerts } from '@/app/actions/inventory'
import InventoryClient from './_components/InventoryClient'

export default async function InventoryPage() {
  const [items, suppliers, purchaseOrders, alerts] = await Promise.all([
    listItems(),
    listSuppliers(),
    listPurchaseOrders(),
    getStockAlerts(),
  ])

  return (
    <InventoryClient
      initialItems={items}
      initialSuppliers={suppliers}
      initialPOs={purchaseOrders}
      initialAlerts={alerts}
    />
  )
}
