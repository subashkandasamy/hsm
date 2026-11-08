'use client'

import { useState } from 'react'
import {
  Plus, RefreshCw, AlertTriangle, Package, Truck, ClipboardList,
  Edit2, ArrowDownCircle, SlidersHorizontal, CheckCircle2, CalendarClock,
} from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import DataTable from '@/components/ui/DataTable'
import StatusBadge from '@/components/ui/StatusBadge'
import Money from '@/components/ui/Money'
import DateText from '@/components/ui/DateText'
import GlassCard from '@/components/ui/GlassCard'
import EmptyState from '@/components/ui/EmptyState'
import {
  listItems, listSuppliers, listPurchaseOrders, getStockAlerts, getExpiryAlerts,
  markOrdered,
} from '@/app/actions/inventory'
import { useAuth } from '@/context/AuthContext'
import { hasPermission } from '@/lib/rbac'
import type { InventoryItem, Supplier, PurchaseOrder, POStatus, InventoryBatch } from '@/lib/types'

type ExpiryAlert = InventoryBatch & { days_to_expiry: number }
import ItemFormModal from './ItemFormModal'
import SupplierFormModal from './SupplierFormModal'
import PoBuilderModal from './PoBuilderModal'
import ReceivePOModal from './ReceivePOModal'
import StockActionModal from './StockActionModal'

type Tab = 'items' | 'suppliers' | 'orders' | 'alerts' | 'expiry'

const PO_STATUS_MAP: Record<POStatus, string> = {
  draft: 'pending',
  ordered: 'info',
  partially_received: 'partial',
  received: 'success',
  cancelled: 'cancelled',
}

const PO_STATUS_LABEL: Record<POStatus, string> = {
  draft: 'Draft',
  ordered: 'Ordered',
  partially_received: 'Partial',
  received: 'Received',
  cancelled: 'Cancelled',
}

interface Props {
  initialItems: InventoryItem[]
  initialSuppliers: Supplier[]
  initialPOs: PurchaseOrder[]
  initialAlerts: InventoryItem[]
  initialExpiry: ExpiryAlert[]
}

export default function InventoryClient({ initialItems, initialSuppliers, initialPOs, initialAlerts, initialExpiry }: Props) {
  const { profile } = useAuth()
  const role = profile?.role
  const canManage = !!role && hasPermission(role, 'inventory:manage', profile?.granted_permissions)

  const [tab, setTab]           = useState<Tab>('items')
  const [items, setItems]       = useState(initialItems)
  const [suppliers, setSuppliers] = useState(initialSuppliers)
  const [orders, setOrders]     = useState(initialPOs)
  const [alerts, setAlerts]     = useState(initialAlerts)
  const [expiry, setExpiry]     = useState<ExpiryAlert[]>(initialExpiry)
  const [loading, setLoading]   = useState(false)

  // Modals
  const [showItemForm, setShowItemForm]     = useState(false)
  const [editItem, setEditItem]             = useState<InventoryItem | null>(null)
  const [showSupplierForm, setShowSupplierForm] = useState(false)
  const [editSupplier, setEditSupplier]     = useState<Supplier | null>(null)
  const [showPoBuilder, setShowPoBuilder]   = useState(false)
  const [receivePO, setReceivePO]           = useState<PurchaseOrder | null>(null)
  const [stockActionItem, setStockActionItem] = useState<InventoryItem | null>(null)
  const [stockActionType, setStockActionType] = useState<'issue' | 'adjust'>('issue')

  async function refresh() {
    setLoading(true)
    const [i, s, o, a, e] = await Promise.all([listItems(), listSuppliers(), listPurchaseOrders(), getStockAlerts(), getExpiryAlerts()])
    setItems(i); setSuppliers(s); setOrders(o); setAlerts(a); setExpiry(e)
    setLoading(false)
  }

  function openItemForm(item?: InventoryItem) {
    setEditItem(item ?? null)
    setShowItemForm(true)
  }

  function openSupplierForm(sup?: Supplier) {
    setEditSupplier(sup ?? null)
    setShowSupplierForm(true)
  }

  function openStockAction(item: InventoryItem, type: 'issue' | 'adjust') {
    setStockActionItem(item)
    setStockActionType(type)
  }

  async function handleMarkOrdered(poId: string) {
    const res = await markOrdered(poId)
    if (res.success) refresh()
  }

  const TABS: { key: Tab; label: string; icon: React.ReactNode; count?: number; urgent?: boolean }[] = [
    { key: 'items',     label: 'Items',     icon: <Package className="w-4 h-4" />,       count: items.length },
    { key: 'suppliers', label: 'Suppliers', icon: <Truck className="w-4 h-4" />,          count: suppliers.length },
    { key: 'orders',    label: 'Orders',    icon: <ClipboardList className="w-4 h-4" />,  count: orders.length },
    { key: 'alerts',    label: 'Low stock', icon: <AlertTriangle className="w-4 h-4" />,  count: alerts.length, urgent: alerts.length > 0 },
    { key: 'expiry',    label: 'Expiry',    icon: <CalendarClock className="w-4 h-4" />,  count: expiry.length, urgent: expiry.some((e) => e.days_to_expiry <= 30) },
  ]

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle="General stores, purchase orders, and stock levels"
        action={
          <div className="flex items-center gap-2">
            <button onClick={refresh}
              className="p-2 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#64748B', cursor: 'pointer' }}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {canManage && tab === 'items' && (
              <button onClick={() => openItemForm()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#0F766E' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#0D9488' }}>
                <Plus className="w-4 h-4" /> Add Item
              </button>
            )}
            {canManage && tab === 'suppliers' && (
              <button onClick={() => openSupplierForm()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#0F766E' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#0D9488' }}>
                <Plus className="w-4 h-4" /> Add Supplier
              </button>
            )}
            {canManage && tab === 'orders' && (
              <button onClick={() => setShowPoBuilder(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#0F766E' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#0D9488' }}>
                <Plus className="w-4 h-4" /> New PO
              </button>
            )}
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl max-w-full overflow-x-auto"
        style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid #E2E8F0' }}>
        {TABS.map(({ key, label, icon, count, urgent }) => (
          <button key={key} onClick={() => setTab(key)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap relative flex-shrink-0"
            style={tab === key
              ? { background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }
              : { background: 'transparent', color: '#64748B', border: 'none', cursor: 'pointer' }}>
            {icon}
            {label}
            {count !== undefined && count > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold ml-0.5"
                style={{
                  background: tab === key ? 'rgba(255,255,255,0.25)' : urgent ? 'rgba(239,68,68,0.12)' : 'rgba(13,148,136,0.1)',
                  color: tab === key ? '#fff' : urgent ? '#DC2626' : '#0D9488',
                }}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Items Tab */}
      {tab === 'items' && (
        <DataTable
          data={items as unknown as Record<string, unknown>[]}
          searchKeys={['name', 'category']}
          searchPlaceholder="Search items…"
          emptyTitle="No items"
          emptyDescription="Add inventory items to track stock"
          columns={[
            {
              key: 'name', header: 'Item', sortable: true,
              render: (row) => {
                const item = row as unknown as InventoryItem
                return (
                  <div>
                    <p className="font-medium text-sm" style={{ color: '#0F172A' }}>{item.name}</p>
                    {item.category && <p className="text-xs" style={{ color: '#94A3B8' }}>{item.category}</p>}
                  </div>
                )
              },
            },
            {
              key: 'qty_in_stock', header: 'Stock', sortable: true,
              render: (row) => {
                const item = row as unknown as InventoryItem
                const low = item.qty_in_stock <= item.reorder_level
                return (
                  <span className="font-semibold text-sm" style={{ color: low ? '#DC2626' : '#0F172A' }}>
                    {item.qty_in_stock} {item.unit ?? ''}
                    {low && <span className="ml-1 text-xs" style={{ color: '#DC2626' }}>⚠</span>}
                  </span>
                )
              },
            },
            {
              key: 'reorder_level', header: 'Reorder At', sortable: true,
              render: (row) => {
                const item = row as unknown as InventoryItem
                return <span className="text-sm" style={{ color: '#64748B' }}>{item.reorder_level} {item.unit ?? ''}</span>
              },
            },
            {
              key: 'actions', header: '',
              render: (row) => {
                const item = row as unknown as InventoryItem
                if (!canManage) return null
                return (
                  <div className="flex items-center gap-1.5 justify-end">
                    <button onClick={() => openStockAction(item, 'issue')} title="Issue Stock"
                      className="w-8 h-8 flex items-center justify-center rounded-lg"
                      style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: 'none', cursor: 'pointer' }}>
                      <ArrowDownCircle className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => openStockAction(item, 'adjust')} title="Adjust Stock"
                      className="w-8 h-8 flex items-center justify-center rounded-lg"
                      style={{ background: 'rgba(100,116,139,0.08)', color: '#64748B', border: 'none', cursor: 'pointer' }}>
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => openItemForm(item)} title="Edit"
                      className="w-8 h-8 flex items-center justify-center rounded-lg"
                      style={{ background: 'rgba(100,116,139,0.08)', color: '#64748B', border: 'none', cursor: 'pointer' }}>
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              },
            },
          ]}
        />
      )}

      {/* Suppliers Tab */}
      {tab === 'suppliers' && (
        <DataTable
          data={suppliers as unknown as Record<string, unknown>[]}
          searchKeys={['name', 'contact_person']}
          searchPlaceholder="Search suppliers…"
          emptyTitle="No suppliers"
          emptyDescription="Add suppliers to attach them to purchase orders"
          columns={[
            {
              key: 'name', header: 'Supplier', sortable: true,
              render: (row) => {
                const s = row as unknown as Supplier
                return (
                  <div>
                    <p className="font-medium text-sm" style={{ color: '#0F172A' }}>{s.name}</p>
                    {s.contact_person && <p className="text-xs" style={{ color: '#94A3B8' }}>{s.contact_person}</p>}
                  </div>
                )
              },
            },
            {
              key: 'phone', header: 'Phone', sortable: false,
              render: (row) => {
                const s = row as unknown as Supplier
                return <span className="text-sm" style={{ color: '#475569' }}>{s.phone ?? '—'}</span>
              },
            },
            {
              key: 'email', header: 'Email', sortable: false, mobileHidden: true,
              render: (row) => {
                const s = row as unknown as Supplier
                return <span className="text-sm" style={{ color: '#475569' }}>{s.email ?? '—'}</span>
              },
            },
            {
              key: 'actions', header: '',
              render: (row) => {
                const s = row as unknown as Supplier
                if (!canManage) return null
                return (
                  <div className="flex justify-end">
                    <button onClick={() => openSupplierForm(s)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg"
                      style={{ background: 'rgba(100,116,139,0.08)', color: '#64748B', border: 'none', cursor: 'pointer' }}>
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              },
            },
          ]}
        />
      )}

      {/* Purchase Orders Tab */}
      {tab === 'orders' && (
        <DataTable
          data={orders as unknown as Record<string, unknown>[]}
          searchKeys={['po_no']}
          searchPlaceholder="Search PO number…"
          emptyTitle="No purchase orders"
          emptyDescription="Create a PO to start ordering items"
          columns={[
            {
              key: 'po_no', header: 'PO #', sortable: true,
              render: (row) => {
                const po = row as unknown as PurchaseOrder
                return (
                  <div>
                    <p className="font-medium text-sm" style={{ color: '#0F172A' }}>{po.po_no}</p>
                    <p className="text-xs" style={{ color: '#94A3B8' }}>{po.supplier?.name ?? 'No supplier'}</p>
                  </div>
                )
              },
            },
            {
              key: 'status', header: 'Status',
              render: (row) => {
                const po = row as unknown as PurchaseOrder
                return <StatusBadge status={PO_STATUS_MAP[po.status]} label={PO_STATUS_LABEL[po.status]} />
              },
            },
            {
              key: 'total', header: 'Total', sortable: true, mobileHidden: true,
              render: (row) => {
                const po = row as unknown as PurchaseOrder
                return <Money amount={po.total} />
              },
            },
            {
              key: 'created_at', header: 'Created', sortable: true, mobileHidden: true,
              render: (row) => {
                const po = row as unknown as PurchaseOrder
                return <DateText date={po.created_at.slice(0, 10)} />
              },
            },
            {
              key: 'actions', header: '',
              render: (row) => {
                const po = row as unknown as PurchaseOrder
                if (!canManage) return null
                return (
                  <div className="flex items-center gap-1.5 justify-end">
                    {po.status === 'draft' && (
                      <button onClick={() => handleMarkOrdered(po.id)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium"
                        style={{ background: 'rgba(59,130,246,0.08)', color: '#2563EB', border: 'none', cursor: 'pointer' }}>
                        Mark Ordered
                      </button>
                    )}
                    {(po.status === 'ordered' || po.status === 'partially_received') && (
                      <button onClick={() => setReceivePO(po)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium"
                        style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: 'none', cursor: 'pointer' }}>
                        <CheckCircle2 className="w-3.5 h-3.5" /> Receive
                      </button>
                    )}
                  </div>
                )
              },
            },
          ]}
        />
      )}

      {/* Alerts Tab */}
      {tab === 'alerts' && (
        alerts.length === 0 ? (
          <GlassCard className="p-8">
            <EmptyState
              title="No stock alerts"
              description="All items are above their reorder levels"
            />
          </GlassCard>
        ) : (
          <div className="space-y-3">
            {alerts.map((item) => (
              <GlassCard key={item.id} className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 flex-shrink-0 rounded-xl flex items-center justify-center"
                      style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
                      <AlertTriangle className="w-4 h-4" style={{ color: '#DC2626' }} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm break-words" style={{ color: '#0F172A' }}>{item.name}</p>
                      <p className="text-xs" style={{ color: '#94A3B8' }}>
                        {item.category ?? 'Uncategorised'} · Reorder at {item.reorder_level} {item.unit ?? ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 sm:flex-shrink-0">
                    <div className="text-right">
                      <p className="text-lg font-bold" style={{ color: '#DC2626' }}>{item.qty_in_stock}</p>
                      <p className="text-xs" style={{ color: '#94A3B8' }}>{item.unit ?? 'units'} in stock</p>
                    </div>
                    {canManage && (
                      <button onClick={() => openStockAction(item, 'adjust')}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium"
                        style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.15)', cursor: 'pointer' }}>
                        Adjust
                      </button>
                    )}
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        )
      )}

      {tab === 'expiry' && (
        expiry.length === 0 ? (
          <GlassCard className="p-8">
            <EmptyState
              title="Nothing expiring soon"
              description="No batches are expired or due within 90 days."
            />
          </GlassCard>
        ) : (
          <div className="space-y-3">
            {expiry.map((b) => {
              const expired = b.days_to_expiry < 0
              const soon = b.days_to_expiry >= 0 && b.days_to_expiry <= 30
              const tone = expired ? '#DC2626' : soon ? '#B45309' : '#0D9488'
              const bg = expired ? 'rgba(239,68,68,0.08)' : soon ? 'rgba(251,191,36,0.12)' : 'rgba(13,148,136,0.08)'
              return (
                <GlassCard key={b.id} className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 flex-shrink-0 rounded-xl flex items-center justify-center"
                        style={{ background: bg, border: `1px solid ${tone}30` }}>
                        <CalendarClock className="w-4 h-4" style={{ color: tone }} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate" style={{ color: '#0F172A' }}>{b.item?.name ?? 'Item'}</p>
                        <p className="text-xs" style={{ color: '#94A3B8' }}>
                          Batch {b.batch_no ?? '—'} · Expiry {b.expiry}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0 text-right">
                      <div>
                        <p className="text-sm font-bold" style={{ color: tone }}>
                          {expired ? `Expired ${-b.days_to_expiry}d ago` : `${b.days_to_expiry}d left`}
                        </p>
                        <p className="text-xs" style={{ color: '#94A3B8' }}>{b.qty_available} {b.item?.unit ?? 'units'}</p>
                      </div>
                    </div>
                  </div>
                </GlassCard>
              )
            })}
          </div>
        )
      )}

      {/* Modals */}
      <ItemFormModal
        open={showItemForm}
        onClose={() => setShowItemForm(false)}
        onSuccess={refresh}
        item={editItem}
      />
      <SupplierFormModal
        open={showSupplierForm}
        onClose={() => setShowSupplierForm(false)}
        onSuccess={refresh}
        supplier={editSupplier}
      />
      <PoBuilderModal
        open={showPoBuilder}
        onClose={() => setShowPoBuilder(false)}
        onSuccess={refresh}
        suppliers={suppliers}
        items={items}
      />
      <ReceivePOModal
        open={!!receivePO}
        onClose={() => setReceivePO(null)}
        onSuccess={refresh}
        po={receivePO}
      />
      <StockActionModal
        open={!!stockActionItem}
        onClose={() => setStockActionItem(null)}
        onSuccess={refresh}
        item={stockActionItem}
        action={stockActionType}
      />
    </div>
  )
}
