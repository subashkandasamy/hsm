-- 0282 — The surgery record: what happened in theatre, on the surgery itself.
--
-- Until now a surgery held one free-text note and one price. The operation
-- record printout (OtRecordPdf) carried ruled lines for everything else —
-- diagnosis before and after, anaesthesia, incision and closure, findings,
-- blood loss, specimens, implants, swab count — to be written by hand.
-- KMCH has no OT forms of its own, so this follows that printout plus the
-- WHO Surgical Safety Checklist.
--
-- Reuse, not new tables: the record lives on ot_schedules (one row per
-- surgery), implant details on ot_consumables (implants are consumables that
-- also need a lot number), and the fee for each doctor on ot_team_members, next
-- to the role they played. Surgeon and anaesthetist are columns on the
-- schedule, so their fees are too.

ALTER TABLE ot_schedules
  -- Before surgery and the WHO checklist: item lists change with practice, so JSON
  -- (shape in src/lib/surgery.ts), each step stamped with who and when.
  ADD COLUMN IF NOT EXISTS pre_op_checklist  jsonb,
  ADD COLUMN IF NOT EXISTS safety_checklist  jsonb,
  -- Anaesthesia and the clock
  ADD COLUMN IF NOT EXISTS anaesthesia_type  text,
  ADD COLUMN IF NOT EXISTS asa_grade         text,
  ADD COLUMN IF NOT EXISTS anaesthesia_start timestamptz,
  ADD COLUMN IF NOT EXISTS anaesthesia_end   timestamptz,
  ADD COLUMN IF NOT EXISTS incision_at       timestamptz,
  ADD COLUMN IF NOT EXISTS closure_at        timestamptz,
  -- Operation note
  ADD COLUMN IF NOT EXISTS pre_op_diagnosis  text,
  ADD COLUMN IF NOT EXISTS post_op_diagnosis text,
  ADD COLUMN IF NOT EXISTS findings          text,
  ADD COLUMN IF NOT EXISTS procedure_details text,
  ADD COLUMN IF NOT EXISTS blood_loss_ml     integer,
  ADD COLUMN IF NOT EXISTS drains            text,
  ADD COLUMN IF NOT EXISTS specimens         text,
  ADD COLUMN IF NOT EXISTS counts_correct    boolean,
  ADD COLUMN IF NOT EXISTS complications     text,
  ADD COLUMN IF NOT EXISTS post_op_orders    text,
  -- Fees billed as their own lines at completion (0 / NULL = not billed separately)
  ADD COLUMN IF NOT EXISTS surgeon_fee       numeric(12,2),
  ADD COLUMN IF NOT EXISTS anaesthetist_fee  numeric(12,2),
  ADD COLUMN IF NOT EXISTS record_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS record_updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE ot_schedules DROP CONSTRAINT IF EXISTS ot_schedules_anaesthesia_type_check;
ALTER TABLE ot_schedules ADD CONSTRAINT ot_schedules_anaesthesia_type_check CHECK (anaesthesia_type IS NULL OR anaesthesia_type = ANY (ARRAY[
  'general', 'spinal', 'epidural', 'combined_spinal_epidural', 'regional_block', 'local', 'sedation', 'other']));
ALTER TABLE ot_schedules DROP CONSTRAINT IF EXISTS ot_schedules_asa_grade_check;
ALTER TABLE ot_schedules ADD CONSTRAINT ot_schedules_asa_grade_check CHECK (asa_grade IS NULL OR asa_grade ~ '^(I|II|III|IV|V|VI)E?$');
ALTER TABLE ot_schedules DROP CONSTRAINT IF EXISTS ot_schedules_record_numbers_check;
ALTER TABLE ot_schedules ADD CONSTRAINT ot_schedules_record_numbers_check CHECK (
  (blood_loss_ml IS NULL OR blood_loss_ml BETWEEN 0 AND 50000)
  AND (surgeon_fee IS NULL OR surgeon_fee >= 0)
  AND (anaesthetist_fee IS NULL OR anaesthetist_fee >= 0));
ALTER TABLE ot_schedules DROP CONSTRAINT IF EXISTS ot_schedules_record_times_check;
ALTER TABLE ot_schedules ADD CONSTRAINT ot_schedules_record_times_check CHECK (
  (anaesthesia_end IS NULL OR anaesthesia_start IS NULL OR anaesthesia_end >= anaesthesia_start)
  AND (closure_at IS NULL OR incision_at IS NULL OR closure_at >= incision_at));

ALTER TABLE ot_team_members ADD COLUMN IF NOT EXISTS fee numeric(12,2);

-- 0057 gave this table SELECT, INSERT and DELETE policies but no UPDATE, so an
-- update matched no row and said nothing. Setting a fee is the first update;
-- same tenant rule as its siblings, checked on both sides so a row cannot be
-- moved onto another hospital's surgery.
DROP POLICY IF EXISTS "tenant_ot_team_update" ON ot_team_members;
CREATE POLICY "tenant_ot_team_update" ON ot_team_members
  FOR UPDATE
  USING (ot_schedule_id IN (SELECT id FROM ot_schedules WHERE tenant_id = current_tenant_id()))
  WITH CHECK (ot_schedule_id IN (SELECT id FROM ot_schedules WHERE tenant_id = current_tenant_id()));
ALTER TABLE ot_team_members DROP CONSTRAINT IF EXISTS ot_team_members_fee_check;
ALTER TABLE ot_team_members ADD CONSTRAINT ot_team_members_fee_check CHECK (fee IS NULL OR fee >= 0);

ALTER TABLE ot_consumables
  ADD COLUMN IF NOT EXISTS is_implant     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS implant_lot_no text,
  ADD COLUMN IF NOT EXISTS implant_maker  text,
  ADD COLUMN IF NOT EXISTS implant_size   text;

COMMENT ON COLUMN ot_schedules.pre_op_checklist IS 'Before surgery: consent, fasting, site marking, anaesthesia check-up, blood, investigations. Shape: src/lib/surgery.ts.';
COMMENT ON COLUMN ot_schedules.safety_checklist IS 'WHO Surgical Safety Checklist — sign in, time out, sign out; each with its items and who/when. Shape: src/lib/surgery.ts.';
COMMENT ON COLUMN ot_team_members.fee IS 'This doctor''s fee for this surgery, billed as its own line at completion. NULL/0 = not billed separately.';
COMMENT ON COLUMN ot_consumables.implant_lot_no IS 'Lot / batch number of an implant — needed to trace a recalled implant to the patient.';

NOTIFY pgrst, 'reload schema';
