# Drug catalogue import (drug_master + drug_brands)

Bulk-loads Indian allopathy molecules and their marketed brands (with MRP,
manufacturer and pack) into the global catalogue that powers the pharmacy /
OPD / IPD / OT drug pickers.

## Data source & licence

- **junioralive/Indian-Medicine-Dataset** — https://github.com/junioralive/Indian-Medicine-Dataset
- **Licence: MIT** (commercial use permitted; the licence notice is retained here as attribution).
- Raw CSV: `DATA/indian_medicine_data.csv` (~254k rows), columns:
  `id, name, price(₹), Is_discontinued, manufacturer_name, type, pack_size_label, short_composition1, short_composition2`

Only factual drug data (brand, composition, manufacturer, price) is used.

## What it produces

- `drug_master` — one row per molecule+strength+form (`generic_name`, `strength`, `form`).
- `drug_brands` — one row per brand: `brand_name`, `manufacturer`, `mrp_per_pack`,
  `pack_size/pack_unit`; `hsn_code` defaults to `30049099`, `gst_rate` to `12`
  (both editable per batch at goods-receipt).
- Every imported row is tagged `source = 'indiamed_mit'` so the import is
  identifiable and fully reversible:
  `DELETE FROM drug_brands WHERE source='indiamed_mit'; DELETE FROM drug_master WHERE source='indiamed_mit';`

Discontinued products are skipped. Molecules are de-duplicated against the
existing catalogue by a normalised `ingredients|strength|form` key. Requires
migration `0110_drug_catalog_search.sql` (adds the `source` column + pg_trgm
search indexes).

## Re-running

```bash
export SVC=<service_role_key>   # never commit this
export URL=https://<ref>.supabase.co
curl -sL https://raw.githubusercontent.com/junioralive/Indian-Medicine-Dataset/main/DATA/indian_medicine_data.csv -o meds.csv
python3 transform.py   # -> new_mols.json, brands.json (reads existing rows to dedup)
python3 insert.py      # batch-inserts; aborts if source='indiamed_mit' rows already exist
```
