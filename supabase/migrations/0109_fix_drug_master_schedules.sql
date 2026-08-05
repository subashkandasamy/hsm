-- Migration 0109: correct drug_master.schedule seed errors from 0044
--
-- 0044 hard-coded schedules with rules that mislabeled several drugs
-- (benzodiazepines as X instead of H1; ciprofloxacin/cefuroxime as H1
-- instead of H; many prescription drugs defaulted to OTC). These UPDATEs
-- align drug_master with the curated catalogue used by the public
-- Schedule-lookup tool (src/lib/drugs/catalogue.ts). Idempotent.

-- Schedule H1
UPDATE drug_master SET schedule='H1' WHERE name IN ('Alprazolam','Cefixime','Clonazepam','Diazepam','Midazolam','Tramadol','Zolpidem');

-- Schedule G (under medical supervision)
UPDATE drug_master SET schedule='G' WHERE name IN ('Insulin Aspart','Insulin Glargine','Insulin Regular');

-- Schedule H (prescription)
UPDATE drug_master SET schedule='H' WHERE name IN ('Allopurinol','Amiodarone','Artemether + Lumefantrine','Cefuroxime','Ciprofloxacin','Clopidogrel','Digoxin','Esomeprazole','Finasteride','Furosemide','Haloperidol','Hydroxychloroquine','Isosorbide Mononitrate','Ivermectin','Levothyroxine','Nitroglycerin','Omeprazole','Pantoprazole','Piperacillin + Tazobactam','Rabeprazole','Salbutamol','Spironolactone','Tamsulosin','Theophylline','Vancomycin','Warfarin');

-- OTC
UPDATE drug_master SET schedule='OTC' WHERE name IN ('Clotrimazole');

