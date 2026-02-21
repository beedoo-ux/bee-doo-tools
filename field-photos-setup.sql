-- ═══════════════════════════════════════════════════════════════════════════
-- bee-doo Field Photos – Supabase Setup
-- Ausführen in: https://hqzpemfaljxcysyqssng.supabase.co → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Tabelle für Foto-Metadaten
CREATE TABLE IF NOT EXISTS field_photos (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id        TEXT NOT NULL,
  photo_key     TEXT NOT NULL,
  photo_label   TEXT,
  storage_path  TEXT,
  file_size     BIGINT,
  mime_type     TEXT,
  customer_name TEXT,
  berater       TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(job_id, photo_key)
);

-- 2) Index für schnelles Abfragen nach job_id
CREATE INDEX IF NOT EXISTS field_photos_job_id_idx ON field_photos(job_id);

-- 3) RLS aktivieren (Row Level Security)
ALTER TABLE field_photos ENABLE ROW LEVEL SECURITY;

-- 4) Policy: Anon kann lesen und schreiben (für Field App – kein Login nötig)
CREATE POLICY "field_photos_anon_read"  ON field_photos FOR SELECT USING (true);
CREATE POLICY "field_photos_anon_write" ON field_photos FOR INSERT WITH CHECK (true);
CREATE POLICY "field_photos_anon_update" ON field_photos FOR UPDATE USING (true);

-- 5) Storage Bucket erstellen
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'field-photos',
  'field-photos',
  false,
  52428800, -- 50 MB pro Datei
  ARRAY['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'video/mp4', 'video/quicktime']
)
ON CONFLICT (id) DO NOTHING;

-- 6) Storage Policy: Anon Upload + Download
CREATE POLICY "field_photos_storage_insert"
  ON storage.objects FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'field-photos');

CREATE POLICY "field_photos_storage_select"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'field-photos');

CREATE POLICY "field_photos_storage_update"
  ON storage.objects FOR UPDATE
  TO anon
  USING (bucket_id = 'field-photos');

-- ═══════════════════════════════════════════════════════════════════════════
-- FERTIG! Tabelle + Bucket sind bereit.
-- Teste mit: SELECT * FROM field_photos LIMIT 10;
-- ═══════════════════════════════════════════════════════════════════════════
