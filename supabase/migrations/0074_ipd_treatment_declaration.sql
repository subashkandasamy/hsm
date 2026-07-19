-- =====================================================================
-- 0074_ipd_treatment_declaration.sql
-- A signed treatment declaration (consent + financial responsibility +
-- liability waiver) is required before any clinical action can be recorded
-- against an IPD admission — separate from and unrelated to insurance.
-- Also makes the declaration text itself a per-tenant, editable template
-- (managed from Settings → IPD Billing), with a default seeded for every
-- tenant so the feature works out of the box.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Per-admission declaration record
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ipd_declarations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  admission_id          UUID NOT NULL UNIQUE REFERENCES admissions(id) ON DELETE CASCADE,
  status                TEXT NOT NULL DEFAULT 'pending',
  sign_method           TEXT,
  signer_name           TEXT,
  signer_relationship   TEXT,
  signature_data        TEXT,          -- data-URI if digitally drawn; null for typed-name-only or physical upload
  declaration_text_snapshot TEXT,       -- the tenant's template text AS IT WAS when first generated for this
                                         -- admission — never re-rendered from a later-edited template, so what
                                         -- the patient actually saw/signed stays legally accurate over time
  document_id           UUID REFERENCES patient_documents(id) ON DELETE SET NULL,
  signed_at             TIMESTAMPTZ,
  marked_manual_by      UUID REFERENCES profiles(id),
  marked_manual_at      TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID REFERENCES profiles(id),
  CONSTRAINT ipd_declarations_status_chk CHECK (status IN ('pending','manual_pending_upload','signed')),
  CONSTRAINT ipd_declarations_sign_method_chk CHECK (sign_method IS NULL OR sign_method IN ('digital','physical_upload')),
  CONSTRAINT ipd_declarations_relationship_chk CHECK (signer_relationship IS NULL OR signer_relationship IN ('self','spouse','parent','child','sibling','other'))
);

CREATE INDEX IF NOT EXISTS idx_ipd_declarations_tenant ON ipd_declarations (tenant_id);

ALTER TABLE ipd_declarations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ipd_declarations_tenant_all ON ipd_declarations;
CREATE POLICY ipd_declarations_tenant_all ON ipd_declarations
  USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
  WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');

-- ---------------------------------------------------------------------
-- 2. The gate flag on admissions — NULL blocks every clinical action;
--    set (by either digital signing or a manual override) unlocks them.
-- ---------------------------------------------------------------------
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS treatment_started_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------
-- 3. Per-tenant editable declaration template, on the existing IPD
--    billing config table (Settings → IPD Billing already lives there).
-- ---------------------------------------------------------------------
ALTER TABLE ipd_billing_config ADD COLUMN IF NOT EXISTS declaration_template TEXT;

UPDATE ipd_billing_config SET declaration_template = $DEFAULT$DECLARATION AND CONSENT FOR ADMISSION AND TREATMENT

I/We, the undersigned, hereby give my/our informed consent for the admission and treatment of the patient named above at this hospital, under the care of the treating doctor(s) and their team.

1. CONSENT TO TREATMENT
I understand that treatment may include examination, investigations, medication, procedures, and — where necessary — surgery, and I consent to such treatment being administered as considered necessary by the treating medical team.

2. FINANCIAL RESPONSIBILITY
I understand and agree that I am financially responsible for all charges incurred during this admission, including room rent, nursing, medicines, investigations, procedures, and any other hospital charges, except to the extent covered by a valid, approved insurance policy. Where insurance cover is partial or not approved, the balance amount is payable by me.

3. SURGICAL PROCEDURES (where applicable)
If a surgical procedure is required during this admission, I have been explained the nature of the procedure, its expected benefits, and material risks involved, in a language I understand, and I consent to the same, including any additional or alternative procedures the surgical team may consider necessary during the course of surgery.

4. LIABILITY
I understand that medical and surgical treatment carries inherent risks, and that no guarantee has been made regarding the outcome of treatment. The hospital and its staff will exercise reasonable skill and care; however, the hospital shall not be held responsible for outcomes arising from the known risks and complications of the disease or the treatment, where reasonable care has been exercised.

I confirm that I have read (or had read to me) and understood the above, and I sign this declaration voluntarily.$DEFAULT$
WHERE declaration_template IS NULL;

ALTER TABLE ipd_billing_config ALTER COLUMN declaration_template SET DEFAULT $DEFAULT2$DECLARATION AND CONSENT FOR ADMISSION AND TREATMENT

I/We, the undersigned, hereby give my/our informed consent for the admission and treatment of the patient named above at this hospital, under the care of the treating doctor(s) and their team.

1. CONSENT TO TREATMENT
I understand that treatment may include examination, investigations, medication, procedures, and — where necessary — surgery, and I consent to such treatment being administered as considered necessary by the treating medical team.

2. FINANCIAL RESPONSIBILITY
I understand and agree that I am financially responsible for all charges incurred during this admission, including room rent, nursing, medicines, investigations, procedures, and any other hospital charges, except to the extent covered by a valid, approved insurance policy. Where insurance cover is partial or not approved, the balance amount is payable by me.

3. SURGICAL PROCEDURES (where applicable)
If a surgical procedure is required during this admission, I have been explained the nature of the procedure, its expected benefits, and material risks involved, in a language I understand, and I consent to the same, including any additional or alternative procedures the surgical team may consider necessary during the course of surgery.

4. LIABILITY
I understand that medical and surgical treatment carries inherent risks, and that no guarantee has been made regarding the outcome of treatment. The hospital and its staff will exercise reasonable skill and care; however, the hospital shall not be held responsible for outcomes arising from the known risks and complications of the disease or the treatment, where reasonable care has been exercised.

I confirm that I have read (or had read to me) and understood the above, and I sign this declaration voluntarily.$DEFAULT2$;

NOTIFY pgrst, 'reload schema';
