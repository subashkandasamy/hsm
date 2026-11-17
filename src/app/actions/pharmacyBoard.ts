'use server'

import { listPendingPrescriptions, getStockAndAlerts, listPackedAwaitingDispatch, listDispatchedHistory } from '@/app/actions/pharmacy'
import { listPharmacySales } from '@/app/actions/pharmacySale'
import { listIpdPharmacyRequests } from '@/app/actions/ipdTreatment'

/**
 * Everything the Pharmacy page reads again after a dispense or a sale, in one
 * request. Sent from the browser as seven calls, they ran one after another:
 * Next.js runs a page's server actions one at a time.
 */
export async function refreshPharmacyBoard() {
  const [pending, { stock, alerts }, awaiting, ipd, history, fulfilled] = await Promise.all([
    listPendingPrescriptions(),
    getStockAndAlerts(),
    listPackedAwaitingDispatch(),
    listIpdPharmacyRequests(),
    listDispatchedHistory(),
    listPharmacySales({ status: 'fulfilled' }),
  ])
  return { pending, stock, alerts, awaiting, ipd, history, fulfilled }
}
