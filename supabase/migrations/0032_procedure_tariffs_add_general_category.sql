-- Migration 0032: Add 'general' to procedure_tariffs category check constraint
--
-- The UI offered 'general' as a category option but the DB constraint only
-- allowed ('surgery','procedure','package'). Drop and recreate the constraint
-- to include 'general'.

alter table procedure_tariffs
  drop constraint if exists procedure_tariffs_category_check;

alter table procedure_tariffs
  add constraint procedure_tariffs_category_check
  check (category in ('general','surgery','procedure','package'));
