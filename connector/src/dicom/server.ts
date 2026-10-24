import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { requests, responses, association } from 'dcmjs-dimse'
import { log } from '../log.js'
import type { Config } from '../config.js'
import { dataDir } from '../config.js'
import { DiskWatch } from './disk.js'

/**
 * dcmjs-dimse ships as a minified CommonJS bundle with ESM-style type
 * declarations. Node cannot detect its named exports from that, so importing
 * `{ Server }` compiles and then fails at startup. It is loaded here instead,
 * which also keeps it out of the way of a connector that has no scanners.
 */
type Dimse = typeof import('dcmjs-dimse')

/**
 * Where the scanners connect.
 *
 * Two services, both of which the machine starts. We only ever listen.
 *
 *   C-FIND on the worklist  the scanner asks what it should be doing today
 *   C-STORE                 the scanner sends the images it just took
 *   C-ECHO                  "are you there?", which every engineer tries first
 *
 * ── Why the worklist is the valuable half ──────────────────────────────────
 *
 * Without it a technologist types the patient's name and hospital number into
 * the console by hand. A typo there files the study against the wrong patient,
 * which is the most dangerous routine error in a radiology department and is
 * not noticed until somebody reads the wrong chest. With it, they pick a line
 * off a list and every image is born carrying the right identifiers.
 *
 * ── What happens to the images ─────────────────────────────────────────────
 *
 * They are written to this computer's disk and stay there. A CT study runs to
 * hundreds of megabytes and a busy hospital makes several gigabytes a day;
 * sending that to a server would cost more every month than the software. Only
 * a description of the study travels — what it is, how big, and where it sits.
 */

interface Handlers {
  /** Today's list, already shaped for DICOM by the caller. */
  getWorklist: (modality: string | null, callingAe: string | null) => Promise<WorklistItem[]>
  /** Called once a study has gone quiet, with everything held on disk. */
  onStudyComplete: (study: ReceivedStudy) => void
}

/** Exposed so the status page and --check can report the same numbers. */
export let diskWatch: DiskWatch | null = null

export interface WorklistItem {
  accessionNumber: string
  patientId: string
  patientName: string
  patientBirthDate: string | null
  patientSex: string
  modality: string | null
  studyDescription: string | null
  scheduledFor: string
  referringPhysician: string | null
}

export interface ReceivedStudy {
  studyInstanceUid: string
  accessionNumber: string | null
  aeTitle: string
  patientNameRaw: string | null
  patientIdRaw: string | null
  modality: string | null
  studyDescription: string | null
  studyDateTime: string | null
  manufacturer: string | null
  model: string | null
  stationName: string | null
  instanceCount: number
  sizeBytes: number
  storagePath: string
  series: Array<{
    seriesInstanceUid: string
    seriesNumber: number | null
    modality: string | null
    description: string | null
    instanceCount: number
    storagePath: string
  }>
}

/** DICOM wants YYYYMMDD, and is unforgiving about it. */
function toDicomDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

function toDicomTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`
}

/**
 * "Surname^Given" is how DICOM writes a name, and a console shows the caret as
 * a comma. A name sent as one lump appears as a surname with no given name,
 * which is how a worklist entry becomes hard to find on a busy morning.
 */
function toDicomName(full: string): string {
  const parts = full.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]
  return `${parts[parts.length - 1]}^${parts.slice(0, -1).join(' ')}`
}

/**
 * Which kind of work the machine is asking for.
 *
 * In a worklist query Modality is not a top-level key: it lives inside
 * ScheduledProcedureStepSequence, because what has a modality is the step, not
 * the patient. Reading it from the top level finds nothing, every query looks
 * unfiltered, and the X-ray console is handed the ultrasound list too — which
 * is exactly what a DX console in Karur showed, an obstetric ultrasound two
 * rows above the chest it was waiting for.
 *
 * Still tolerant of the top level: some consoles put it in both places, and a
 * query that asks twice should not be harder to answer than one that asks once.
 */
function askedModality(query: Record<string, unknown>): string | null {
  const sps = query.ScheduledProcedureStepSequence
  const step = Array.isArray(sps) ? sps[0] as Record<string, unknown> | undefined : undefined
  const fromStep = typeof step?.Modality === 'string' ? step.Modality : null
  const fromTop = typeof query.Modality === 'string' ? query.Modality : null
  return (fromStep || fromTop || '').trim() || null
}

/**
 * A study arrives as a stream of individual images over minutes, with no
 * message to say it has finished — DICOM has no "that was the last one". So
 * each study is held open and considered complete once it has been quiet for a
 * while, the same judgement the lab link layer makes when a machine sends no
 * EOT.
 */
const STUDY_IDLE_MS = 30_000

interface OpenStudy {
  info: ReceivedStudy
  seriesSeen: Map<string, { count: number; number: number | null; modality: string | null; description: string | null; dir: string }>
  timer: NodeJS.Timeout | null
}

export async function startDicom(
  config: Config, handlers: Handlers,
): Promise<{ close: () => void }> {
  const dimse = ((await import('dcmjs-dimse')) as unknown as { default: Dimse }).default
  const { Server, Scp, Dataset, responses: res, constants } = dimse
  const { CFindResponse, CStoreResponse, CEchoResponse } = res
  const { Status, SopClass, StorageClass, TransferSyntax, PresentationContextResult } = constants

  const aeTitle = config.dicomAeTitle ?? 'UYIRLY'
  const port = config.dicomPort ?? 11112
  const root = path.join(dataDir(), 'dicom')
  const open = new Map<string, OpenStudy>()

  const disk = new DiskWatch(root)
  await disk.start()
  diskWatch = disk

  const flush = (uid: string) => {
    const s = open.get(uid)
    if (!s) return
    open.delete(uid)
    if (s.timer) clearTimeout(s.timer)
    s.info.series = [...s.seriesSeen.entries()].map(([seriesUid, v]) => ({
      seriesInstanceUid: seriesUid,
      seriesNumber: v.number,
      modality: v.modality,
      description: v.description,
      instanceCount: v.count,
      storagePath: v.dir,
    }))
    log.info(`Study complete: ${s.info.instanceCount} image(s) in ${s.info.series.length} series `
      + `from ${s.info.aeTitle}${s.info.accessionNumber ? `, accession ${s.info.accessionNumber}` : ''}`)
    handlers.onStudyComplete(s.info)
  }

  class UyirlyScp extends Scp {
    private callingAe = 'UNKNOWN'

    associationRequested(assoc: association.Association) {
      this.callingAe = assoc.getCallingAeTitle() || 'UNKNOWN'

      // Deliberately not checking the called AE title. Getting it wrong is the
      // commonest reason an engineer cannot connect, and refusing on that basis
      // produces a support call rather than any security — the connector is on
      // the hospital's own network and its token is what authorises anything.
      log.info(`DICOM association from ${this.callingAe} (to ${assoc.getCalledAeTitle()})`)

      for (const pc of assoc.getPresentationContexts()) {
        const ctx = pc.context
        const sop = ctx.getAbstractSyntaxUid()
        const accept = sop === SopClass.Verification
          || sop === SopClass.ModalityWorklistInformationModelFind
          || Object.values(StorageClass).includes(sop)

        if (!accept) {
          ctx.setResult(PresentationContextResult.RejectAbstractSyntaxNotSupported)
          continue
        }
        // Accept whatever encoding the machine offers, including the
        // compressed ones — refusing those makes a modern CT fall back to
        // uncompressed and send several times the data, or give up.
        const offered = ctx.getTransferSyntaxUids()
        const preferred = offered.find((t) => t === TransferSyntax.ExplicitVRLittleEndian)
          ?? offered.find((t) => t === TransferSyntax.ImplicitVRLittleEndian)
          ?? offered[0]
        ctx.setResult(PresentationContextResult.Accept, preferred)
      }

      this.sendAssociationAccept()
    }

    /**
     * The machine is finished and is hanging up.
     *
     * Not optional, although it looks it: without this the library logs
     * "associationReleaseRequested method must be implemented" as an ERROR on
     * every single query, before releasing anyway. A radiology department
     * polls the worklist every few seconds, so the log fills with errors
     * produced by nothing going wrong — and a log that is always full of
     * errors is a log nobody reads when something is.
     */
    associationReleaseRequested() {
      this.sendAssociationReleaseResponse()
    }

    /** Every engineer tries this first. Answering it proves the wiring. */
    cEchoRequest(request: requests.CEchoRequest, callback: (r: responses.CEchoResponse) => void) {
      log.info(`DICOM echo from ${this.callingAe} — answered`)
      const response = CEchoResponse.fromRequest(request)
      response.setStatus(Status.Success)
      callback(response)
    }

    cFindRequest(request: requests.CFindRequest,
                 callback: (r: responses.CFindResponse[]) => void) {
      const query = (request.getDataset()?.getElements() ?? {}) as Record<string, unknown>
      // A machine usually asks only for its own kind of work.
      const asked = askedModality(query)

      // The calling AE goes with it. A machine asking for its worklist has
      // announced itself just as surely as one sending images, and until now
      // we threw that away — so a scanner stayed invisible in Uyirly until the
      // day somebody took a picture with it.
      handlers.getWorklist(asked, this.callingAe === 'UNKNOWN' ? null : this.callingAe)
        .then((items) => {
        log.info(`Worklist asked by ${this.callingAe}`
          + `${asked ? ` for ${asked}` : ''} — ${items.length} patient(s) sent`)

        const out = items.map((w) => {
          const r = CFindResponse.fromRequest(request)
          r.setStatus(Status.Pending)
          r.setDataset(new Dataset({
            AccessionNumber: w.accessionNumber,
            PatientID: w.patientId,
            PatientName: toDicomName(w.patientName),
            PatientBirthDate: toDicomDate(w.patientBirthDate),
            PatientSex: w.patientSex,
            StudyInstanceUID: '',
            RequestedProcedureID: w.accessionNumber,
            RequestedProcedureDescription: w.studyDescription ?? '',
            // Not worklist keys, and sent anyway. The E-COM console's grid
            // reads its "Study Description" and "Study Date Time" columns from
            // the top level, so with only the scheduled-step copies below it
            // showed two names and no examination — the technologist could see
            // who, but had to go back to the paper slip to learn which scan.
            StudyDescription: w.studyDescription ?? '',
            StudyDate: toDicomDate(w.scheduledFor),
            StudyTime: toDicomTime(w.scheduledFor),
            ReferringPhysicianName: w.referringPhysician ? toDicomName(w.referringPhysician) : '',
            // The scheduled step is a sequence, and a console reads the
            // modality and time from inside it rather than the top level.
            ScheduledProcedureStepSequence: [{
              Modality: w.modality ?? '',
              ScheduledStationAETitle: '',
              ScheduledProcedureStepStartDate: toDicomDate(w.scheduledFor),
              ScheduledProcedureStepStartTime: toDicomTime(w.scheduledFor),
              ScheduledProcedureStepDescription: w.studyDescription ?? '',
              ScheduledProcedureStepID: w.accessionNumber,
            }],
          }))
          return r
        })

        const done = CFindResponse.fromRequest(request)
        done.setStatus(Status.Success)
        callback([...out, done])
      }).catch((e: Error) => {
        // An empty list, not an error: a machine that gets a failure here often
        // stops asking until somebody restarts it.
        log.error(`Could not build the worklist: ${e.message}`)
        const done = CFindResponse.fromRequest(request)
        done.setStatus(Status.Success)
        callback([done])
      })
    }

    cStoreRequest(request: requests.CStoreRequest, callback: (r: responses.CStoreResponse) => void) {
      void (async () => {
        const response = CStoreResponse.fromRequest(request)
        try {
          // Checked before writing, not after. A disk that fills mid-study
          // leaves half a study on disk and a scanner that believes it sent a
          // whole one — refusing up front makes the machine report the failure
          // in the room, to the person who just did the scan.
          if (!disk.accepting) {
            // The DICOM status a store SCP uses when it has nowhere to put it.
            response.setStatus(Status.ResourceLimitation)
            callback(response)
            return
          }

          const ds = request.getDataset()
          if (!ds) throw new Error('store request carried no dataset')
          const el = ds.getElements() as Record<string, unknown>

          const studyUid = String(el.StudyInstanceUID ?? '')
          const seriesUid = String(el.SeriesInstanceUID ?? 'unknown')
          const sopUid = String(el.SOPInstanceUID ?? `${Date.now()}`)
          if (!studyUid) throw new Error('image carried no StudyInstanceUID')

          const seriesDir = path.join(root, studyUid, seriesUid)
          await fs.mkdir(seriesDir, { recursive: true })
          const file = path.join(seriesDir, `${sopUid}.dcm`)
          await ds.toFile(file)
          const { size } = await fs.stat(file)

          let s = open.get(studyUid)
          if (!s) {
            s = {
              info: {
                studyInstanceUid: studyUid,
                accessionNumber: (el.AccessionNumber as string) || null,
                aeTitle: this.callingAe,
                patientNameRaw: (el.PatientName as string) || null,
                patientIdRaw: (el.PatientID as string) || null,
                modality: (el.Modality as string) || null,
                studyDescription: (el.StudyDescription as string) || null,
                studyDateTime: (el.StudyDate as string) || null,
                manufacturer: (el.Manufacturer as string) || null,
                model: (el.ManufacturerModelName as string) || null,
                stationName: (el.StationName as string) || null,
                instanceCount: 0,
                sizeBytes: 0,
                storagePath: path.join(root, studyUid),
                series: [],
              },
              seriesSeen: new Map(),
              timer: null,
            }
            open.set(studyUid, s)
            log.info(`Receiving a study from ${this.callingAe}`
              + `${s.info.accessionNumber ? `, accession ${s.info.accessionNumber}` : ' with no accession number'}`)
          }

          s.info.instanceCount += 1
          s.info.sizeBytes += size
          const seen = s.seriesSeen.get(seriesUid)
          if (seen) { seen.count += 1 } else {
            s.seriesSeen.set(seriesUid, {
              count: 1,
              number: el.SeriesNumber != null ? Number(el.SeriesNumber) : null,
              modality: (el.Modality as string) || null,
              description: (el.SeriesDescription as string) || null,
              dir: seriesDir,
            })
          }

          if (s.timer) clearTimeout(s.timer)
          s.timer = setTimeout(() => flush(studyUid), STUDY_IDLE_MS)

          response.setStatus(Status.Success)
        } catch (e) {
          // Refusing tells the machine to try again, which is what we want —
          // an image we failed to write is one nobody will ever see.
          log.error(`Could not store an image: ${(e as Error).message}`)
          response.setStatus(Status.ProcessingFailure)
        }
        callback(response)
      })()
    }
  }

  const server = new Server(UyirlyScp as never)
  server.on('networkError', (e: Error) => log.warn(`DICOM network: ${e.message}`))

  try {
    server.listen(port, { securityOptions: undefined })
    log.info(`Listening for scanners on port ${port} as "${aeTitle}"`)
  } catch (e) {
    log.error(`Could not listen for scanners on port ${port}: ${(e as Error).message}. `
      + 'Another program may be using it, or the port needs administrator rights.')
  }

  return {
    close: () => {
      for (const uid of [...open.keys()]) flush(uid)
      disk.stop()
      diskWatch = null
      server.close()
    },
  }
}
