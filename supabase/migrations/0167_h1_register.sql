-- The Schedule H1 register ────────────────────────────────────────────────────
--
-- Rule 65(11A) of the Drugs and Cosmetics Rules requires a pharmacy to keep a
-- separate register for Schedule H1 medicines: who it was supplied to, who
-- prescribed it, what and how much, on what date — kept for three years. Most
-- pharmacies keep it as a paper logbook and write it up from memory at the end
-- of the day, which is exactly how entries go missing.
--
-- The catalogue already knows each drug's schedule (954 H1 and 17 X entries), so
-- the register can write itself as medicines are dispensed.
--
-- This is a trigger rather than application code on purpose. Medicines leave
-- stock down three different paths today — the sale counter, a prescription
-- dispensed at the window, and a vaccine given on the ward — and a legal record
-- that depends on every future path remembering to call a function is a record
-- that will eventually be incomplete.

-- A hospital's own drugs can carry a schedule too, not just the shared catalogue.
ALTER TABLE drugs ADD COLUMN IF NOT EXISTS schedule TEXT;

CREATE TABLE IF NOT EXISTS h1_register (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  /** Serial number in this hospital's register, as the inspector reads it. */
  entry_no        INTEGER NOT NULL,
  supplied_on     DATE NOT NULL,
  /** Which schedule triggered the entry — H1, or X, which is stricter still. */
  schedule        TEXT NOT NULL,

  -- The people, copied in rather than referenced. A register entry has to say
  -- what was true on the day it was made, even if a record is edited later.
  patient_id      UUID REFERENCES patients(id) ON DELETE SET NULL,
  patient_name    TEXT NOT NULL,
  patient_uhid    TEXT,
  patient_address TEXT,
  prescriber_name TEXT,

  -- The medicine, likewise.
  drug_name       TEXT NOT NULL,
  brand_name      TEXT,
  batch_no        TEXT,
  qty             INTEGER NOT NULL,

  dispense_id     UUID REFERENCES dispenses(id) ON DELETE SET NULL,
  supplied_by     UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS h1_register_tenant_entry ON h1_register (tenant_id, entry_no);
CREATE INDEX IF NOT EXISTS h1_register_tenant_date ON h1_register (tenant_id, supplied_on DESC);
-- One entry per dispense, so a retry cannot double-enter the same supply.
CREATE UNIQUE INDEX IF NOT EXISTS h1_register_dispense ON h1_register (dispense_id) WHERE dispense_id IS NOT NULL;

ALTER TABLE h1_register ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY h1_register_tenant_read ON h1_register FOR SELECT
    USING (tenant_id = (select current_tenant_id()) AND (select auth.role()) = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
REVOKE ALL ON h1_register FROM anon;
-- Deliberately no INSERT/UPDATE/DELETE policy: the register is written only by
-- the trigger below, which runs as definer. A register anyone can edit is not a
-- register.

/**
 * Writes the register entry for a supply of a Schedule H1 or X medicine.
 * Silent for everything else, which is the overwhelming majority of dispensing.
 */
CREATE OR REPLACE FUNCTION log_h1_supply()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule  text;
  v_drug      text;
  v_brand     text;
  v_batch     text;
  v_patient   record;
  v_prescriber text;
  v_next      integer;
BEGIN
  -- What is it, and does it need a register entry?
  IF NEW.drug_master_id IS NOT NULL THEN
    SELECT m.schedule, m.name INTO v_schedule, v_drug FROM drug_master m WHERE m.id = NEW.drug_master_id;
  ELSIF NEW.drug_id IS NOT NULL THEN
    SELECT d.schedule, d.name INTO v_schedule, v_drug FROM drugs d WHERE d.id = NEW.drug_id;
  END IF;

  IF upper(coalesce(v_schedule, '')) NOT IN ('H1', 'X') THEN
    RETURN NEW;
  END IF;

  SELECT b.brand_name, b.batch_no INTO v_brand, v_batch
    FROM drug_batches b WHERE b.id = NEW.drug_batch_id;

  SELECT p.full_name, p.uhid, p.address INTO v_patient
    FROM patients p WHERE p.id = NEW.patient_id;

  -- The prescriber is the doctor on the visit the prescription belongs to;
  -- failing that, whoever supplied it.
  SELECT pr.full_name INTO v_prescriber
    FROM prescriptions rx
    JOIN visits v ON v.id = rx.visit_id
    JOIN profiles pr ON pr.id = v.doctor_id
   WHERE rx.id = NEW.prescription_id;

  IF v_prescriber IS NULL THEN
    SELECT pr.full_name INTO v_prescriber FROM profiles pr WHERE pr.id = NEW.dispensed_by;
  END IF;

  -- Serial numbers run per hospital and never reuse a number.
  SELECT coalesce(max(entry_no), 0) + 1 INTO v_next FROM h1_register WHERE tenant_id = NEW.tenant_id;

  INSERT INTO h1_register (
    tenant_id, entry_no, supplied_on, schedule,
    patient_id, patient_name, patient_uhid, patient_address,
    prescriber_name, drug_name, brand_name, batch_no, qty,
    dispense_id, supplied_by
  ) VALUES (
    NEW.tenant_id, v_next, (NEW.dispensed_at AT TIME ZONE 'Asia/Kolkata')::date, upper(v_schedule),
    NEW.patient_id, coalesce(v_patient.full_name, 'Unknown'), v_patient.uhid, v_patient.address,
    v_prescriber, coalesce(v_drug, 'Unknown'), v_brand, v_batch, NEW.qty,
    NEW.id, NEW.dispensed_by
  )
  ON CONFLICT (dispense_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dispenses_h1_register ON dispenses;
CREATE TRIGGER trg_dispenses_h1_register
  AFTER INSERT ON dispenses
  FOR EACH ROW EXECUTE FUNCTION log_h1_supply();

NOTIFY pgrst, 'reload schema';
