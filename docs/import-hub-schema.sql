-- ============================================================
-- bee-doo Daten-Import Schema v1.0
-- Ausführen im Supabase SQL Editor: https://supabase.com/dashboard
-- ============================================================

-- Alte Tabellen entfernen
DROP TABLE IF EXISTS import_leads CASCADE;
DROP TABLE IF EXISTS import_appointments CASCADE;
DROP TABLE IF EXISTS import_provisions CASCADE;
DROP TABLE IF EXISTS import_logs CASCADE;

-- 1. LEADS (5.651 Datensätze aus Leads_Incoming CSV)
CREATE TABLE import_leads (
  id BIGSERIAL PRIMARY KEY,
  lead_id INTEGER UNIQUE NOT NULL,
  leadstatus TEXT,
  mitarbeiter TEXT,
  indikator TEXT,
  letzter_bearbeitungsstatus TEXT,
  projektstatus TEXT,
  anrede TEXT,
  vorname TEXT,
  nachname TEXT,
  name TEXT,
  firma TEXT,
  strasse TEXT,
  hausnummer TEXT,
  plz TEXT,
  ort TEXT,
  telefon TEXT,
  mobil TEXT,
  email TEXT,
  quelle TEXT,
  projekt TEXT,
  gruppe TEXT,
  anmerkung TEXT,
  tags TEXT,
  erreichbarkeit TEXT,
  nicht_erreicht INTEGER DEFAULT 0,
  rueckruf TEXT,
  importiert TEXT,
  verifizierung TEXT,
  aktive_wiedervorlagen INTEGER DEFAULT 0,
  mvpp_name TEXT,
  mvpp_id TEXT,
  qualitaetscall TEXT,
  qualitaetscall_notizen TEXT,
  externe_lead_id TEXT,
  externe_lead_id_2 TEXT,
  externe_lead_id_3 TEXT,
  zuweisungsstatus TEXT,
  qcells_zahlungsstatus TEXT,
  qcells_fortschritt TEXT,
  lieferdatum TEXT,
  auftragsbestaetigung TEXT,
  slots_verfuegbar TEXT,
  importierte_medien INTEGER DEFAULT 0,
  datum_qualifiziert TEXT,
  datum_abgeschlossen TEXT,
  datum_importiert TEXT,
  import_batch_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. APPOINTMENTS (Created + Closed = ~2.288 Datensätze)
CREATE TABLE import_appointments (
  id BIGSERIAL PRIMARY KEY,
  termin_id INTEGER NOT NULL,
  lead_id INTEGER,
  extern_id TEXT,
  csv_quelle TEXT NOT NULL,
  UNIQUE(termin_id, csv_quelle),
  leadquelle TEXT,
  mvpp_name TEXT,
  mvpp_id TEXT,
  leadkunde TEXT,
  leadadresse TEXT,
  terminiert_von TEXT,
  terminiert_an_name TEXT,
  terminiert_an_email TEXT,
  terminstatus TEXT,
  aktueller_status TEXT,
  angebotsstatus TEXT,
  angebot_angenommen TEXT,
  provisionsstatus TEXT,
  terminausfall_begruendung TEXT,
  abschlussstatus TEXT,
  abschlussbemerkung TEXT,
  bestaetigt_durch TEXT,
  indikator TEXT,
  datum_terminerstellung TEXT,
  datum_termin_beginn TEXT,
  datum_termin_ende TEXT,
  datum_abgeschlossen TEXT,
  datum_bestaetigt_partner TEXT,
  datum_bestaetigt_kunde TEXT,
  import_batch_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. PROVISIONS (171 Datensätze aus Provisionsrelevant CSV)
CREATE TABLE import_provisions (
  id BIGSERIAL PRIMARY KEY,
  an_nr INTEGER UNIQUE NOT NULL,
  lead_id INTEGER,
  auftragsstatus TEXT,
  typ TEXT,
  speichererweiterung TEXT,
  dokumentstatus TEXT,
  beedoo_fortschritt TEXT,
  workflow_history TEXT,
  ablehnung_freigabe_grund TEXT,
  angebot_erstellt_von TEXT,
  kundenberater TEXT,
  vp_nummer TEXT,
  mvpp_id TEXT,
  mvpp_name TEXT,
  termine_agenten TEXT,
  termine_berater TEXT,
  kunde TEXT,
  kunde_plz TEXT,
  kundennummer TEXT,
  quelle TEXT,
  an_wert_netto TEXT,
  auszahlungsrelevant TEXT,
  ausgezahlt_am TEXT,
  efs_prozent TEXT,
  finanzierung_gewuenscht TEXT,
  angebot_kwp TEXT,
  angebot_module TEXT,
  angebot_solarmodule TEXT,
  angebot_batteriekapazitaet TEXT,
  metrify TEXT,
  lieferdatum TEXT,
  auftragsbestaetigung TEXT,
  datum_erstellt TEXT,
  datum_an_kunde_gesendet TEXT,
  datum_gelesen TEXT,
  datum_angenommen TEXT,
  zeit_vergangen TEXT,
  import_batch_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. IMPORT LOGS
CREATE TABLE import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL,
  csv_typ TEXT NOT NULL,
  dateiname TEXT,
  zeilen_gesamt INTEGER DEFAULT 0,
  zeilen_neu INTEGER DEFAULT 0,
  zeilen_aktualisiert INTEGER DEFAULT 0,
  zeilen_fehler INTEGER DEFAULT 0,
  fehler_details JSONB,
  importiert_von TEXT DEFAULT 'system',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

-- INDEXES
CREATE INDEX idx_il_plz ON import_leads(plz);
CREATE INDEX idx_il_status ON import_leads(leadstatus);
CREATE INDEX idx_il_quelle ON import_leads(quelle);
CREATE INDEX idx_il_mitarbeiter ON import_leads(mitarbeiter);
CREATE INDEX idx_il_mvpp ON import_leads(mvpp_id);
CREATE INDEX idx_il_batch ON import_leads(import_batch_id);
CREATE INDEX idx_ia_lead ON import_appointments(lead_id);
CREATE INDEX idx_ia_status ON import_appointments(aktueller_status);
CREATE INDEX idx_ia_terminstatus ON import_appointments(terminstatus);
CREATE INDEX idx_ia_abschluss ON import_appointments(abschlussstatus);
CREATE INDEX idx_ia_berater ON import_appointments(terminiert_an_name);
CREATE INDEX idx_ia_batch ON import_appointments(import_batch_id);
CREATE INDEX idx_ip_lead ON import_provisions(lead_id);
CREATE INDEX idx_ip_status ON import_provisions(auftragsstatus);
CREATE INDEX idx_ip_berater ON import_provisions(kundenberater);
CREATE INDEX idx_ip_batch ON import_provisions(import_batch_id);
CREATE INDEX idx_ilog_batch ON import_logs(batch_id);
CREATE INDEX idx_ilog_typ ON import_logs(csv_typ);

-- RLS POLICIES
ALTER TABLE import_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_provisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_import_leads" ON import_leads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_import_appointments" ON import_appointments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_import_provisions" ON import_provisions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_import_logs" ON import_logs FOR ALL USING (true) WITH CHECK (true);
