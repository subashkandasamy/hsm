-- An operation theatre's status must be one the app can read.
--
-- `status` was added as plain TEXT with a default and nothing else, so the
-- database accepted whatever it was handed. The demo seed handed it
-- 'available', three colours short of the three the screen knows, and the Wards
-- → OT Rooms tab died on the colour lookup: "This page couldn't load", with no
-- hint that one row's status was the cause.
--
-- The screen now falls back for an unknown status, which is the right belt. The
-- braces belong here: a value the app cannot render has no business reaching the
-- table in the first place, and a constraint says so at the moment it is
-- written rather than hours later in somebody's browser.
UPDATE ot_rooms
   SET status = CASE WHEN is_active THEN 'active' ELSE 'inactive' END
 WHERE status IS NULL OR status NOT IN ('active', 'maintenance', 'inactive');

ALTER TABLE ot_rooms DROP CONSTRAINT IF EXISTS ot_rooms_status_check;
ALTER TABLE ot_rooms ADD CONSTRAINT ot_rooms_status_check
  CHECK (status IN ('active', 'maintenance', 'inactive'));
