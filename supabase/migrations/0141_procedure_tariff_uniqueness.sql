-- Procedure tariffs: no duplicate names, one active General tariff ────────────
-- Nothing stopped the same tariff being added repeatedly, so identical rows
-- piled up with no way to tell which one staff were picking.
CREATE UNIQUE INDEX IF NOT EXISTS procedure_tariffs_tenant_name_key
  ON procedure_tariffs (tenant_id, lower(btrim(name)));

-- The active General tariff is the default admission charge when no procedure is
-- chosen (admitPatient takes the first one found). With two active there is no
-- telling which price an admission gets.
CREATE UNIQUE INDEX IF NOT EXISTS procedure_tariffs_one_active_general
  ON procedure_tariffs (tenant_id)
  WHERE category = 'general' AND is_active;
