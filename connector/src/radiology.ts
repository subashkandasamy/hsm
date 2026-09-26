import type { Config } from './config.js'
import { log } from './log.js'
import type { WorklistItem, ReceivedStudy } from './dicom/server.js'
import { VERSION } from './version.js'

/**
 * The two conversations the connector has with Uyirly about radiology.
 *
 * Deliberately thin. The DICOM side knows nothing about HTTP and this knows
 * nothing about DICOM, so a change in one does not disturb the other — and the
 * protocol work stays testable without a server.
 *
 * ── Why a failed worklist returns an empty list ────────────────────────────
 *
 * If the internet is down we cannot know what is scheduled, and there is no
 * honest answer to give the machine. An empty list means "nothing booked",
 * which is wrong but harmless: the technologist types the patient in, as they
 * did before any of this existed. Returning an error instead makes some
 * consoles stop asking until an engineer restarts them, which is worse and
 * lasts longer.
 */

export async function fetchWorklist(config: Config, modality: string | null): Promise<WorklistItem[]> {
  const base = config.serverUrl.replace(/\/$/, '')
  const url = `${base}/api/device/radiology/worklist${modality ? `?modality=${encodeURIComponent(modality)}` : ''}`
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 12_000)
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${config.token}` },
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) {
      log.warn(`Worklist request refused (HTTP ${res.status}) — the scanner will see an empty list.`)
      return []
    }
    const body = await res.json() as { items?: WorklistItem[] }
    return body.items ?? []
  } catch (e) {
    log.warn(`Could not fetch the worklist (${(e as Error).message}) — `
      + 'the scanner will see an empty list and the patient must be typed in.')
    return []
  }
}

/**
 * Tell Uyirly a study exists. The images are not sent; they stay on this disk.
 *
 * Retried a few times rather than queued to disk like a lab result. The
 * difference is that a lab result exists nowhere else, so losing it loses a
 * measurement — whereas the study itself is safely on this computer, and all
 * that is lost here is the notification. A person can still find it, and a
 * later study from the same machine tells us the machine is alive.
 */
export async function reportStudy(config: Config, study: ReceivedStudy): Promise<void> {
  const url = `${config.serverUrl.replace(/\/$/, '')}/api/device/radiology/studies`

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 20_000)
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.token}`,
        },
        body: JSON.stringify({ ...study, version: VERSION }),
        signal: controller.signal,
      })
      clearTimeout(timer)

      if (res.ok) {
        const body = await res.json().catch(() => ({})) as { status?: string }
        log.info(body.status === 'matched'
          ? `Study attached to its order (${study.accessionNumber}).`
          : `Study recorded but not matched — somebody at the hospital must attach it.`)
        return
      }
      if (res.status === 401 || res.status === 403) {
        log.error('Uyirly does not recognise this computer, so the study could not be '
          + 'recorded. The images are safe on this disk.')
        return
      }
      log.warn(`Could not record the study (HTTP ${res.status}), attempt ${attempt} of 5.`)
    } catch (e) {
      log.warn(`Could not reach Uyirly to record the study (${(e as Error).message}), `
        + `attempt ${attempt} of 5.`)
    }
    await new Promise((r) => setTimeout(r, attempt * 5_000))
  }

  log.error(`Gave up telling Uyirly about study ${study.studyInstanceUid}. `
    + `The images are on this computer at ${study.storagePath} and nothing is lost, `
    + 'but the order will not show them until somebody looks.')
}
