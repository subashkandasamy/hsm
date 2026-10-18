-- Do not invent a letter into a hospital's own code.
--
-- 0198 padded the four-character tag with 'X' so every number came out the
-- same width. For a hospital whose code is three letters that produced
-- JPTX/B2627/00001 — and the X is not theirs. The first person to read their
-- own invoice would ask what it meant, and the honest answer is "nothing".
--
-- Fixed width is worth less than a number a hospital recognises. Dropping the
-- padding shortens such a number to fifteen characters, which is still inside
-- Rule 46(b)'s sixteen.
--
-- Changed now, before the new series has issued a single invoice. Afterwards
-- it would mean opening another series.

CREATE OR REPLACE FUNCTION tenant_doc_prefix_short(p_tenant_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT left(tenant_doc_prefix(p_tenant_id), 4);
$$;

COMMENT ON FUNCTION tenant_doc_prefix_short(uuid) IS
  'Up to four characters of the hospital''s own code, for GST document numbers. Never padded — the tag is theirs, not ours.';
