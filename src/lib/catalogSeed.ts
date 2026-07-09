import { createServiceClient } from '@/lib/supabase/service'

// ─── Radiology seed data ───────────────────────────────────────────────────────

type RadSeed = { name: string; modality: string }

const RADIOLOGY_PROCEDURES: RadSeed[] = [
  // ── X-Ray ─────────────────────────────────────────────────────────────────
  { name: 'Chest X-Ray PA View',              modality: 'xray' },
  { name: 'Chest X-Ray AP View',              modality: 'xray' },
  { name: 'X-Ray Skull (AP / Lateral)',       modality: 'xray' },
  { name: 'X-Ray Cervical Spine (AP / Lateral)',    modality: 'xray' },
  { name: 'X-Ray Thoracic Spine (AP / Lateral)',    modality: 'xray' },
  { name: 'X-Ray Lumbar Spine (AP / Lateral)',      modality: 'xray' },
  { name: 'X-Ray Abdomen (Erect)',            modality: 'xray' },
  { name: 'X-Ray Pelvis',                     modality: 'xray' },
  { name: 'X-Ray Right Shoulder',             modality: 'xray' },
  { name: 'X-Ray Left Shoulder',              modality: 'xray' },
  { name: 'X-Ray Right Hand',                 modality: 'xray' },
  { name: 'X-Ray Left Hand',                  modality: 'xray' },
  { name: 'X-Ray Right Knee',                 modality: 'xray' },
  { name: 'X-Ray Left Knee',                  modality: 'xray' },
  { name: 'X-Ray Right Foot',                 modality: 'xray' },
  { name: 'X-Ray Left Foot',                  modality: 'xray' },
  { name: 'X-Ray Right Hip',                  modality: 'xray' },
  { name: 'X-Ray Left Hip',                   modality: 'xray' },

  // ── Ultrasound ────────────────────────────────────────────────────────────
  { name: 'USG Abdomen (Whole)',               modality: 'usg' },
  { name: 'USG Abdomen & Pelvis',              modality: 'usg' },
  { name: 'USG Pelvis (Lower Abdomen)',        modality: 'usg' },
  { name: 'USG Obstetric (Dating Scan)',       modality: 'usg' },
  { name: 'USG Obstetric (Anomaly Scan)',      modality: 'usg' },
  { name: 'USG Neck / Thyroid',               modality: 'usg' },
  { name: 'USG KUB (Kidneys, Ureters, Bladder)', modality: 'usg' },
  { name: 'USG Scrotum',                       modality: 'usg' },
  { name: 'USG Breast (Bilateral)',            modality: 'usg' },
  { name: 'USG Guided FNAC',                  modality: 'usg' },
  { name: 'Colour Doppler Carotid',           modality: 'usg' },
  { name: 'Colour Doppler Lower Limb Venous', modality: 'usg' },
  { name: 'Colour Doppler Lower Limb Arterial',modality: 'usg' },
  { name: 'Echocardiography (2D Echo)',       modality: 'usg' },

  // ── CT Scan ───────────────────────────────────────────────────────────────
  { name: 'CT Brain (Plain)',                  modality: 'ct' },
  { name: 'CT Brain (With Contrast)',          modality: 'ct' },
  { name: 'CT Chest',                          modality: 'ct' },
  { name: 'CT Chest (With Contrast)',          modality: 'ct' },
  { name: 'CT Abdomen & Pelvis (Plain)',       modality: 'ct' },
  { name: 'CT Abdomen & Pelvis (With Contrast)',modality: 'ct' },
  { name: 'CT KUB',                            modality: 'ct' },
  { name: 'CT Paranasal Sinuses',              modality: 'ct' },
  { name: 'CT Lumbar Spine',                   modality: 'ct' },
  { name: 'CT Cervical Spine',                 modality: 'ct' },
  { name: 'CT Angiography Brain',              modality: 'ct' },
  { name: 'CT Angiography Coronary',          modality: 'ct' },

  // ── MRI ───────────────────────────────────────────────────────────────────
  { name: 'MRI Brain (Plain)',                 modality: 'mri' },
  { name: 'MRI Brain (With Contrast)',         modality: 'mri' },
  { name: 'MRI Cervical Spine',                modality: 'mri' },
  { name: 'MRI Thoracic Spine',               modality: 'mri' },
  { name: 'MRI Lumbar Spine',                  modality: 'mri' },
  { name: 'MRI Right Knee',                    modality: 'mri' },
  { name: 'MRI Left Knee',                     modality: 'mri' },
  { name: 'MRI Right Shoulder',               modality: 'mri' },
  { name: 'MRI Left Shoulder',                modality: 'mri' },
  { name: 'MRI Abdomen & Pelvis',             modality: 'mri' },
  { name: 'MRI Breast (Bilateral)',            modality: 'mri' },
  { name: 'MRI Angiography Brain',            modality: 'mri' },

  // ── Mammography ───────────────────────────────────────────────────────────
  { name: 'Mammography Bilateral',             modality: 'mammography' },
  { name: 'Mammography Unilateral',            modality: 'mammography' },
  { name: 'Mammography with USG Breast',       modality: 'mammography' },
]

// ─── Seed functions ────────────────────────────────────────────────────────────

export async function seedLabCatalog(tenantId: string): Promise<void> {
  const service = createServiceClient()

  // Pull all active master tests and activate them for this tenant at ₹1, inactive.
  // The admin enables and prices each test they actually run.
  const { data: masterTests } = await service
    .from('lab_tests_master')
    .select('id, name, code, category, sample_type, unit, ref_low, ref_high, reference_range')
    .eq('is_active', true)

  if (!masterTests?.length) return

  const rows = masterTests.map(m => ({
    id:              crypto.randomUUID(),
    tenant_id:       tenantId,
    lab_master_id:   m.id,
    name:            m.name,
    code:            m.code ?? null,
    category:        m.category,
    sample_type:     m.sample_type ?? null,
    unit:            m.unit ?? null,
    ref_low:         m.ref_low ?? null,
    ref_high:        m.ref_high ?? null,
    reference_range: m.reference_range ?? null,
    price:           1,
    is_active:       false,
  }))

  for (let i = 0; i < rows.length; i += 50) {
    await service.from('lab_tests_catalog').insert(rows.slice(i, i + 50))
  }
}

export async function seedRadiologyCatalog(tenantId: string): Promise<void> {
  const service = createServiceClient()
  const rows = RADIOLOGY_PROCEDURES.map((t) => ({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    is_active: false,
    price: 1,
    ...t,
  }))
  await service.from('radiology_catalog').insert(rows)
}
