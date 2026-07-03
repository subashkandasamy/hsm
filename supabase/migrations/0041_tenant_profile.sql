-- Tenant profile: hospital branding, contact info, address for billing documents
CREATE TABLE IF NOT EXISTS tenant_profiles (
  tenant_id       UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL DEFAULT '',
  tagline         TEXT,
  tagline2        TEXT,
  logo_url        TEXT,
  address_line1   TEXT,
  address_line2   TEXT,
  city            TEXT,
  state           TEXT,
  pincode         TEXT,
  phone1          TEXT,
  phone2          TEXT,
  email           TEXT,
  website         TEXT,
  cin_no          TEXT,
  gst_no          TEXT,
  emergency_contact TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_profile_select" ON tenant_profiles
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1)
  );

CREATE POLICY "tenant_profile_upsert" ON tenant_profiles
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1)
  ) WITH CHECK (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1)
  );

-- Storage bucket for tenant logos (one image per tenant, public read)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tenant-logos',
  'tenant-logos',
  TRUE,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "tenant_logo_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'tenant-logos');

CREATE POLICY "tenant_logo_admin_write" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'tenant-logos');

CREATE POLICY "tenant_logo_admin_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'tenant-logos');

CREATE POLICY "tenant_logo_admin_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'tenant-logos');
