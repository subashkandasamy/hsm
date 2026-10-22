-- Groundwork for the PC&PNDT and MTP statutory registers.
--
-- Nothing here is a register yet. These are the fields the registers will read
-- from, added first because every one of them is also useful on its own, and
-- because a half-built Form F that cannot name the patient's husband is worth
-- nothing.
--
-- ── Why a hospital cares ───────────────────────────────────────────────────
--
-- A hospital with a scan machine files a return every month under the
-- Pre-Conception and Pre-Natal Diagnostic Techniques Act 1994, by the 5th. The
-- Act is enforced criminally: up to three years' imprisonment, and courts have
-- held that a blank column in Form F is itself the offence rather than a
-- clerical slip. The same hospital files a monthly MTP statement under the
-- Medical Termination of Pregnancy Act.
--
-- Form F is central law and identical in every state. Only the summary sheets
-- differ, which is why the data lives here and the paper layout will live
-- somewhere replaceable.

-- ── Patients: who they are, in the form's own words ────────────────────────
--
-- Form F field 5 asks for "Husband's/Wife's/Father's/Mother's Name", and the
-- Tamil Nadu summary writes the same thing as (w/o, D/o, S/o). It is an
-- ordinary Indian registration field, not an obstetric one, so it belongs on
-- the patient and is typed once rather than per pregnancy.

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS relation_type text,
  ADD COLUMN IF NOT EXISTS relation_name text,
  ADD COLUMN IF NOT EXISTS state         text,
  ADD COLUMN IF NOT EXISTS district      text,
  ADD COLUMN IF NOT EXISTS pincode       text;

-- Deliberately not NOT NULL. Reception must be able to register a walk-in with
-- a fever in fifteen seconds; it is the Form F that will refuse to complete
-- without them, not the front desk.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patients_relation_type_check') THEN
    ALTER TABLE patients ADD CONSTRAINT patients_relation_type_check
      CHECK (relation_type IS NULL OR relation_type = ANY (ARRAY['husband','wife','father','mother']));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patients_pincode_check') THEN
    ALTER TABLE patients ADD CONSTRAINT patients_pincode_check
      CHECK (pincode IS NULL OR pincode ~ '^[1-9][0-9]{5}$');
  END IF;
END $$;

COMMENT ON COLUMN patients.relation_type IS
  'Husband/Wife/Father/Mother — Form F field 5, written as W/o, D/o, S/o on the Tamil Nadu summary.';
COMMENT ON COLUMN patients.district IS
  'The authority traces women who travel across district lines for a scan, so this is read closely.';

-- District and pincode are the two parts of an address an Appropriate Authority
-- actually checks. The rest of a postal address stays free text, because a
-- receptionist typing a door number into seven boxes at a busy counter is how
-- addresses stop being recorded at all.
CREATE INDEX IF NOT EXISTS patients_tenant_district_idx
  ON patients (tenant_id, district) WHERE district IS NOT NULL;

-- ── The hospital's own registration ────────────────────────────────────────
--
-- Form F carries the clinic's registered name, address and PC&PNDT number, and
-- every summary sheet carries a named reporting person. Alongside
-- blood_bank_license, which is the same kind of fact.

ALTER TABLE tenant_profiles
  ADD COLUMN IF NOT EXISTS pcpndt_reg_no                 text,
  ADD COLUMN IF NOT EXISTS pcpndt_registered_name        text,
  ADD COLUMN IF NOT EXISTS pcpndt_registered_address     text,
  ADD COLUMN IF NOT EXISTS pcpndt_valid_upto             date,
  ADD COLUMN IF NOT EXISTS pcpndt_reporting_person_name  text,
  ADD COLUMN IF NOT EXISTS pcpndt_reporting_person_phone text;

COMMENT ON COLUMN tenant_profiles.pcpndt_registered_name IS
  'The name on the PC&PNDT certificate, which is often not the trading name. Form F must carry this one.';
COMMENT ON COLUMN tenant_profiles.pcpndt_reporting_person_name IS
  'The person the Act expects to be answerable for the monthly return — printed at the head of every report.';

-- ── The MTP drugs are Schedule H ───────────────────────────────────────────
--
-- Mifepristone and misoprostol require a registered medical practitioner's
-- written prescription under the Drugs and Cosmetics Act, and only a doctor
-- qualified under the MTP Act may prescribe them for a termination.
--
-- They were sitting with no schedule at all while 3,274 other drugs carried
-- theirs correctly, so they were passing straight through the Schedule H
-- checks the pharmacy already does. Nothing to do with the registers; wrong
-- today regardless.

UPDATE drug_master
   SET schedule = 'H'
 WHERE schedule IS NULL
   AND (name ILIKE '%mifepristone%' OR name ILIKE '%misoprostol%');
