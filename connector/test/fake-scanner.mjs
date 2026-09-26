/**
 * A pretend ultrasound machine speaking real DICOM.
 *
 * Asks for its worklist the way a console does, then sends an image back.
 * Proves the two things a hospital cares about without a scanner in the room.
 *
 *   node fake-scanner.mjs [host] [port] [aeTitle]
 */
// dcmjs-dimse is a minified CommonJS bundle, so Node cannot see named exports
// on it. Take the whole module and destructure at runtime.
const dimse = (await import('dcmjs-dimse')).default
const { Client, Dataset, requests, constants } = dimse
const { CEchoRequest, CFindRequest, CStoreRequest } = requests
const { SopClass, Status, StorageClass } = constants

const host = process.argv[2] ?? '127.0.0.1'
const port = Number(process.argv[3] ?? 11112)
const callingAe = process.argv[4] ?? 'GE_LOGIQ_P9'

function run(request, label) {
  return new Promise((resolve, reject) => {
    const client = new Client()
    const found = []
    client.addRequest(request)
    request.on('response', (r) => {
      if (r.getStatus() === Status.Pending && r.getDataset()) found.push(r.getDataset().getElements())
    })
    client.on('networkError', (e) => reject(new Error(`${label}: ${e.message}`)))
    client.on('closed', () => resolve(found))
    client.send(host, port, callingAe, 'UYIRLY')
  })
}

// 1. Is anyone there? Every engineer tries this first.
await run(new CEchoRequest(), 'echo')
console.log('  echo      : answered')

// 2. What am I scanning today?
// A worklist query is its own SOP class — createWorklistFindRequest sets it.
// Building a plain CFindRequest asks for StudyRoot instead, which a worklist
// server rightly refuses.
const find = CFindRequest.createWorklistFindRequest({
  AccessionNumber: '', PatientID: '', PatientName: '', PatientBirthDate: '', PatientSex: '',
  ScheduledProcedureStepSequence: [{ Modality: 'US', ScheduledProcedureStepStartDate: '' }],
})
const list = await run(find, 'worklist')
console.log(`  worklist  : ${list.length} patient(s)`)
for (const p of list) {
  const step = p.ScheduledProcedureStepSequence?.[0] ?? {}
  console.log(`              ${p.AccessionNumber}  ${p.PatientName}  ${p.PatientID}  ${step.Modality}  ${step.ScheduledProcedureStepDescription ?? ''}`)
}

// 3. Send the image, carrying the accession the worklist gave us.
const picked = list[0]
if (!picked) { console.log('  nothing scheduled — cannot send a study'); process.exit(0) }

const store = new CStoreRequest(new Dataset({
  SOPClassUID: StorageClass.UltrasoundImageStorage,
  SOPInstanceUID: '1.2.826.0.1.3680043.8.498.' + Date.now(),
  StudyInstanceUID: '1.2.826.0.1.3680043.8.498.10000001',
  SeriesInstanceUID: '1.2.826.0.1.3680043.8.498.10000001.1',
  AccessionNumber: picked.AccessionNumber,
  PatientID: picked.PatientID,
  PatientName: picked.PatientName,
  Modality: 'US',
  SeriesNumber: 1,
  SeriesDescription: 'OB Survey',
  StudyDescription: 'Obstetric Ultrasound',
  Manufacturer: 'GE Healthcare',
  ManufacturerModelName: 'LOGIQ P9',
  StationName: 'USG-ROOM-2',
  Rows: 8, Columns: 8, BitsAllocated: 8, BitsStored: 8, HighBit: 7,
  SamplesPerPixel: 1, PhotometricInterpretation: 'MONOCHROME2', PixelRepresentation: 0,
  PixelData: [new Uint8Array(64).fill(128).buffer],
}))
await run(store, 'store')
console.log(`  image sent: accession ${picked.AccessionNumber}`)
