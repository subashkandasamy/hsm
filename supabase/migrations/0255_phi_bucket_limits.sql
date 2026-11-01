-- F-58 — the two buckets holding patient files had no type limit and no size
-- limit, at either layer.
--
-- Read from the live catalog before writing this:
--
--   bucket              public  file_size_limit  allowed_mime_types
--   documents           false   NULL             NULL
--   radiology           false   NULL             NULL
--   tenant-logos        true    2 MB             {image/png,image/jpeg,image/webp}
--   connector-downloads true    250 MB           NULL
--
-- The bucket holding the hospital's logo was capped at 2 MB with three MIME
-- types. The buckets holding patient records had nothing. Anyone with
-- `emr:document:upload` — which includes the receptionist — could put a file of
-- any type and any size into either one.
--
-- Both are private and served only through signed URLs, so the realistic harm
-- is cost and abuse rather than disclosure. `radiology` is not named in F-58;
-- it has the identical defect and is fixed here rather than filed separately.
--
-- WHY THESE NUMBERS
--
-- Measured, not guessed. Everything in storage today:
--
--   documents    1 object   PDF    1.4 MB
--   radiology    2 objects  JPEG   ~600 kB
--
-- So both allowlists are already generous for what the hospital does, and no
-- existing object violates them. The limits are a ceiling on abuse, not a
-- constraint anyone will meet in normal use.
--
-- The values mirror `src/lib/upload/allowedFiles.ts`, which the two server
-- actions check against so the person uploading gets an actionable message
-- instead of a storage error after the attempt. The bucket settings here are
-- the control that cannot be argued with by a crafted client; the code check is
-- the courtesy. If one of them changes, change both — the TypeScript file is
-- the authority and carries the reasoning.
--
-- Office formats are deliberately excluded. A discharge summary belongs in the
-- record as a PDF, and allowing .docx into a PHI bucket means accepting a macro
-- container that nothing here will scan.

BEGIN;

UPDATE storage.buckets
   SET file_size_limit = 25 * 1024 * 1024,
       allowed_mime_types = ARRAY[
         'application/pdf',
         'image/heic', 'image/heif',
         'image/jpeg', 'image/png', 'image/tiff', 'image/webp'
       ]
 WHERE id = 'documents';

-- Wider, and larger: a modality emits TIFF or DICOM, and scan images are bigger
-- than a scanned consent form.
UPDATE storage.buckets
   SET file_size_limit = 50 * 1024 * 1024,
       allowed_mime_types = ARRAY[
         'application/dicom', 'application/pdf',
         'image/jpeg', 'image/png', 'image/tiff', 'image/webp'
       ]
 WHERE id = 'radiology';

-- Refuse to apply silently if either bucket has gone missing or been renamed,
-- rather than reporting success for an UPDATE that matched nothing — the same
-- failure mode as F-63 and as 0253.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM storage.buckets
   WHERE id IN ('documents', 'radiology')
     AND file_size_limit IS NOT NULL
     AND allowed_mime_types IS NOT NULL;
  IF n <> 2 THEN
    RAISE EXCEPTION 'F-58: expected both PHI buckets to be limited, found %', n;
  END IF;
END $$;

COMMIT;
