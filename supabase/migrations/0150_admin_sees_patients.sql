-- A clinic owner / administrator who is also a practising doctor: listed with the
-- doctors (appointments, scheduling, OT, IPD, emergency, patient app) and has a
-- consultation fee. Only meaningful for role = 'admin' (doctors always see patients).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sees_patients BOOLEAN NOT NULL DEFAULT false;
NOTIFY pgrst, 'reload schema';
