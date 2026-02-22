-- bee-doo Netzanmeldungs Tool: Migration
-- Einmalig im Supabase SQL Editor ausführen

CREATE TABLE IF NOT EXISTS netzanmeldungen (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Verknüpfung zum Auftrag
  auftrag_id UUID REFERENCES pay_auftraege(id) ON DELETE SET NULL,
  auftrag_nr TEXT,
  
  -- Kundendaten (denormalisiert für schnellen Zugriff)
  kunde_name TEXT NOT NULL,
  kunde_adresse TEXT,
  plz TEXT,
  ort TEXT,
  
  -- Anlagendaten
  kwp NUMERIC,
  zaehler_nr TEXT,
  netzbetreiber TEXT,
  malo_id TEXT,        -- Marktlokations-ID
  mastr_nr TEXT,       -- Marktstammdatenregister-Nummer
  
  -- Status-Workflow
  status TEXT DEFAULT 'erfasst' CHECK (
    status IN (
      'erfasst',
      'unterlagen_angefordert',
      'eingereicht',
      'in_pruefung',
      'genehmigt',
      'abgelehnt',
      'inbetrieb'
    )
  ),
  status_history JSONB DEFAULT '[]',
  
  -- Wichtige Daten
  anmeldung_datum DATE,
  genehmigung_datum DATE,
  inbetriebnahme_datum DATE,
  
  -- EEG / Einspeisevergütung
  einspeisevergütung_beantragt BOOLEAN DEFAULT false,
  einspeisevergütung_datum DATE,
  
  -- Unterlagen-Checkliste (JSONB: {name, erhalten, datum})
  unterlagen JSONB DEFAULT '[]',
  unterlagen_vollstaendig BOOLEAN DEFAULT false,
  
  -- Sonstiges
  notizen TEXT,
  verantwortlich TEXT,
  
  -- Timestamps
  erstellt_am TIMESTAMPTZ DEFAULT NOW(),
  geaendert_am TIMESTAMPTZ DEFAULT NOW()
);

-- RLS deaktivieren für interne Nutzung (wie andere bee-doo Tabellen)
ALTER TABLE netzanmeldungen DISABLE ROW LEVEL SECURITY;

-- Trigger für geaendert_am
CREATE OR REPLACE FUNCTION update_geaendert_am()
RETURNS TRIGGER AS $$
BEGIN NEW.geaendert_am = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER netzanmeldungen_geaendert_am
  BEFORE UPDATE ON netzanmeldungen
  FOR EACH ROW EXECUTE FUNCTION update_geaendert_am();

-- Testdaten (optional)
-- INSERT INTO netzanmeldungen (auftrag_nr, kunde_name, kunde_adresse, plz, ort, kwp, netzbetreiber, status)
-- VALUES ('BD-2026-001', 'Hans Müller', 'Musterstraße 1', '33602', 'Bielefeld', 9.8, 'Stadtwerke Bielefeld', 'eingereicht');
