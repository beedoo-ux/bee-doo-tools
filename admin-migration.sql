-- ============================================================
-- bee-doo Scout Admin – Migration
-- Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- 1. Gebiete Tabelle erweitern
ALTER TABLE gebiete 
  ADD COLUMN IF NOT EXISTS polygon_coords TEXT,
  ADD COLUMN IF NOT EXISTS einheiten INTEGER DEFAULT 500,
  ADD COLUMN IF NOT EXISTS plz TEXT,
  ADD COLUMN IF NOT EXISTS ort TEXT;

-- 2. Admin-Policies (Service Role hat bereits vollen Zugriff)
-- Aber wir brauchen Policies damit Admin-Key alle Daten lesen kann

-- Admin kann alles auf gebiete
DROP POLICY IF EXISTS "Admin full gebiete" ON gebiete;
CREATE POLICY "Admin full gebiete" ON gebiete
  USING (true) WITH CHECK (true);

-- Admin kann alles auf zuweisungen  
DROP POLICY IF EXISTS "Admin full zuweisungen" ON zuweisungen;
CREATE POLICY "Admin full zuweisungen" ON zuweisungen
  USING (true) WITH CHECK (true);

-- Admin kann alles auf scouter
DROP POLICY IF EXISTS "Admin full scouter" ON scouter;
CREATE POLICY "Admin full scouter" ON scouter
  USING (true) WITH CHECK (true);

-- Admin kann qualifizierungen lesen
DROP POLICY IF EXISTS "Admin read qualifizierungen" ON qualifizierungen;
CREATE POLICY "Admin read qualifizierungen" ON qualifizierungen
  USING (true);

-- Admin kann adressen lesen
DROP POLICY IF EXISTS "Admin read adressen" ON adressen;
CREATE POLICY "Admin read adressen" ON adressen
  USING (true) WITH CHECK (true);

-- 3. Scouter email view (join mit auth.users)
CREATE OR REPLACE VIEW scouter_with_email AS
  SELECT s.*, u.email, u.created_at as user_created_at
  FROM scouter s
  JOIN auth.users u ON s.id = u.id;

-- 4. Index für polygon lookup
CREATE INDEX IF NOT EXISTS idx_gebiete_active ON gebiete(active);
CREATE INDEX IF NOT EXISTS idx_zuweisungen_gebiet ON zuweisungen(gebiet_id);

