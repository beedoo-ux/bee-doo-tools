export default async function handler(req, res) {
  // Auth check
  const token = 'EtQkiOCgyug_ZY8aeY01';
  if (req.headers['x-migrate-token'] !== token) return res.status(401).json({ error: 'unauthorized' });

  const m1 = 'sbp_0faa1551f2f59c91';
  const m2 = '8b0a54880f565af0d0adfe5f';
  const MGMT = m1 + m2;
  const PROJECT = 'hqzpemfaljxcysyqssng';
  const results = [];

  const sql = async (label, query) => {
    try {
      const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${MGMT}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const text = await r.text();
      results.push({ label, status: r.status, ok: r.ok, res: text.slice(0, 200) });
      return r.ok;
    } catch(e) { results.push({ label, error: e.message }); return false; }
  };

  // ── IMPORTS META TABLE ────────────────────────────────────────────────────
  await sql('create_imports', `CREATE TABLE IF NOT EXISTS reporting_imports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tabelle TEXT NOT NULL,
    dateiname TEXT,
    zeilen INTEGER DEFAULT 0,
    importiert_am TIMESTAMPTZ DEFAULT NOW(),
    importiert_von TEXT DEFAULT 'admin'
  );`);
  await sql('rls_imports', `ALTER TABLE reporting_imports DISABLE ROW LEVEL SECURITY;`);

  // ── LEADS TABLE ───────────────────────────────────────────────────────────
  await sql('create_leads', `CREATE TABLE IF NOT EXISTS reporting_leads (
    id BIGSERIAL PRIMARY KEY,
    import_id UUID REFERENCES reporting_imports(id) ON DELETE CASCADE,
    lead_id INTEGER,
    leadstatus TEXT,
    mitarbeiter_berater TEXT,
    indikator TEXT,
    letzter_status TEXT,
    anrede TEXT,
    vorname TEXT,
    nachname TEXT,
    plz TEXT,
    ort TEXT,
    quelle TEXT,
    mvpp_name TEXT,
    mvpp_id TEXT,
    tags TEXT,
    erreichbarkeit TEXT,
    nicht_erreicht TEXT,
    datum_importiert DATE,
    datum_qualifiziert DATE,
    datum_abgeschlossen DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`);
  await sql('rls_leads', `ALTER TABLE reporting_leads DISABLE ROW LEVEL SECURITY;`);
  await sql('idx_leads_import', `CREATE INDEX IF NOT EXISTS idx_reporting_leads_import ON reporting_leads(import_id);`);
  await sql('idx_leads_datum', `CREATE INDEX IF NOT EXISTS idx_reporting_leads_datum ON reporting_leads(datum_importiert);`);
  await sql('idx_leads_quelle', `CREATE INDEX IF NOT EXISTS idx_reporting_leads_quelle ON reporting_leads(quelle);`);
  await sql('idx_leads_status', `CREATE INDEX IF NOT EXISTS idx_reporting_leads_status ON reporting_leads(leadstatus);`);

  // ── AUFTRAEGE TABLE ───────────────────────────────────────────────────────
  await sql('create_auftraege', `CREATE TABLE IF NOT EXISTS reporting_auftraege (
    id BIGSERIAL PRIMARY KEY,
    import_id UUID REFERENCES reporting_imports(id) ON DELETE CASCADE,
    an_nr TEXT,
    auftragsstatus TEXT,
    typ TEXT,
    speichererweiterung TEXT,
    dokumentstatus TEXT,
    beedoo_fortschritt TEXT,
    angebot_erstellt_von TEXT,
    lead_id INTEGER,
    externe_lead_id TEXT,
    mvpp_id TEXT,
    mvpp_name TEXT,
    kunde TEXT,
    kunde_plz TEXT,
    kundennummer TEXT,
    quelle TEXT,
    an_wert_netto TEXT,
    an_wert_netto_num NUMERIC,
    kundenberater TEXT,
    vp_nummer TEXT,
    datum_erstellt DATE,
    datum_gesendet DATE,
    datum_gelesen DATE,
    datum_angenommen DATE,
    finanzierung_gewuenscht TEXT,
    angebot_kwp NUMERIC,
    angebot_module INTEGER,
    angebot_solarmodule TEXT,
    angebot_batterie TEXT,
    auszahlungsrelevant TEXT,
    ausgezahlt_am TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`);
  await sql('rls_auftraege', `ALTER TABLE reporting_auftraege DISABLE ROW LEVEL SECURITY;`);
  await sql('idx_auftr_import', `CREATE INDEX IF NOT EXISTS idx_reporting_auftraege_import ON reporting_auftraege(import_id);`);
  await sql('idx_auftr_datum', `CREATE INDEX IF NOT EXISTS idx_reporting_auftraege_datum ON reporting_auftraege(datum_erstellt);`);
  await sql('idx_auftr_status', `CREATE INDEX IF NOT EXISTS idx_reporting_auftraege_status ON reporting_auftraege(auftragsstatus);`);
  await sql('idx_auftr_berater', `CREATE INDEX IF NOT EXISTS idx_reporting_auftraege_berater ON reporting_auftraege(kundenberater);`);

  // ── TERMINE ERSTELLT TABLE ────────────────────────────────────────────────
  await sql('create_termine_erstellt', `CREATE TABLE IF NOT EXISTS reporting_termine_erstellt (
    id BIGSERIAL PRIMARY KEY,
    import_id UUID REFERENCES reporting_imports(id) ON DELETE CASCADE,
    termin_id INTEGER,
    lead_id INTEGER,
    extern_id TEXT,
    leadquelle TEXT,
    mvpp_name TEXT,
    mvpp_id TEXT,
    leadkunde TEXT,
    leadadresse TEXT,
    terminiert_von TEXT,
    terminiert_an_name TEXT,
    terminiert_an_email TEXT,
    datum_erstellung TIMESTAMPTZ,
    datum_beginn TIMESTAMPTZ,
    datum_ende TIMESTAMPTZ,
    terminstatus TEXT,
    aktueller_status TEXT,
    angebotsstatus TEXT,
    angebot_angenommen TEXT,
    provisionsstatus TEXT,
    terminausfall_begruendung TEXT,
    abschlussstatus TEXT,
    abschlussbemerkung TEXT,
    datum_abgeschlossen TIMESTAMPTZ,
    indikator TEXT,
    datum_bestaetigt_partner TEXT,
    datum_bestaetigt_kunde TEXT,
    bestaetigt_durch TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`);
  await sql('rls_terme', `ALTER TABLE reporting_termine_erstellt DISABLE ROW LEVEL SECURITY;`);
  await sql('idx_terme_import', `CREATE INDEX IF NOT EXISTS idx_reporting_terme_import ON reporting_termine_erstellt(import_id);`);
  await sql('idx_terme_datum', `CREATE INDEX IF NOT EXISTS idx_reporting_terme_datum ON reporting_termine_erstellt(datum_erstellung);`);
  await sql('idx_terme_von', `CREATE INDEX IF NOT EXISTS idx_reporting_terme_von ON reporting_termine_erstellt(terminiert_von);`);

  // ── TERMINE CLOSED TABLE ──────────────────────────────────────────────────
  await sql('create_terme_closed', `CREATE TABLE IF NOT EXISTS reporting_termine_closed (
    id BIGSERIAL PRIMARY KEY,
    import_id UUID REFERENCES reporting_imports(id) ON DELETE CASCADE,
    termin_id INTEGER,
    lead_id INTEGER,
    extern_id TEXT,
    leadquelle TEXT,
    mvpp_name TEXT,
    mvpp_id TEXT,
    leadkunde TEXT,
    leadadresse TEXT,
    terminiert_von TEXT,
    terminiert_an_name TEXT,
    terminiert_an_email TEXT,
    datum_erstellung TIMESTAMPTZ,
    datum_beginn TIMESTAMPTZ,
    datum_ende TIMESTAMPTZ,
    terminstatus TEXT,
    aktueller_status TEXT,
    angebotsstatus TEXT,
    angebot_angenommen TEXT,
    provisionsstatus TEXT,
    terminausfall_begruendung TEXT,
    abschlussstatus TEXT,
    abschlussbemerkung TEXT,
    datum_abgeschlossen TIMESTAMPTZ,
    indikator TEXT,
    datum_bestaetigt_partner TEXT,
    datum_bestaetigt_kunde TEXT,
    bestaetigt_durch TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`);
  await sql('rls_closed', `ALTER TABLE reporting_termine_closed DISABLE ROW LEVEL SECURITY;`);
  await sql('idx_closed_import', `CREATE INDEX IF NOT EXISTS idx_reporting_closed_import ON reporting_terme_closed(import_id);`);
  await sql('idx_closed_datum', `CREATE INDEX IF NOT EXISTS idx_reporting_closed_datum ON reporting_terme_closed(datum_abgeschlossen);`);
  await sql('idx_closed_status', `CREATE INDEX IF NOT EXISTS idx_reporting_closed_status ON reporting_terme_closed(abschlussstatus);`);

  // ── HELPER FUNCTION: Delete import batch ──────────────────────────────────
  await sql('fn_delete_batch', `CREATE OR REPLACE FUNCTION delete_reporting_import(p_id UUID)
  RETURNS void AS $$
  BEGIN
    DELETE FROM reporting_leads WHERE import_id = p_id;
    DELETE FROM reporting_auftraege WHERE import_id = p_id;
    DELETE FROM reporting_termine_erstellt WHERE import_id = p_id;
    DELETE FROM reporting_termine_closed WHERE import_id = p_id;
    DELETE FROM reporting_imports WHERE id = p_id;
  END;
  $$ LANGUAGE plpgsql;`);

  res.json({ ok: true, results });
}
