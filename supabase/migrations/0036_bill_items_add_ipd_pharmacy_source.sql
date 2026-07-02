-- Add 'ipd_pharmacy' to the bill_items source check constraint
alter table bill_items drop constraint if exists bill_items_source_check;
alter table bill_items add constraint bill_items_source_check
  check (source in (
    'consultation','bed','lab','radiology','pharmacy','ipd_pharmacy',
    'ot','ot_consumable','blood','manual',
    'dental','pharmacy_sale_item'
  ));
