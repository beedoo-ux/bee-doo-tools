
// api/migrate.js - Migration runner
// Usage: GET /api/migrate with header x-migrate-token: {last 20 chars of service key}

export default async function handler(req, res) {
  const KEY = process.env.SUPABASE_SERVICE_KEY || '';
  if (req.headers['x-migrate-token'] !== KEY.slice(-20)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const MGMT = process.env.SUPABASE_MGMT_TOKEN || 'sbp_0faa1551f2f59c918b0a54880f565af0d0adfe5f';
  const PROJECT = 'hqzpemfaljxcysyqssng';
  const results = [];

  const runSQL = async (label, sql) => {
    try {
      const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${MGMT}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sql })
      });
      const data = await r.text();
      results.push({ label, status: r.status, ok: r.ok, response: data.slice(0, 300) });
      return r.ok;
    } catch (e) {
      results.push({ label, error: e.message });
      return false;
    }
  };

  // ── NETZANMELDUNGEN TABLE ──────────────────────────────────────────────────
  await runSQL('netzanmeldungen_table', `
    CREATE TABLE IF NOT EXISTS netzanmeldungen (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      auftrag_id UUID REFERENCES pay_auftraege(id) ON DELETE SET NULL,
      auftrag_nr TEXT,
      kunde_name TEXT NOT NULL,
      kunde_adresse TEXT,
      plz TEXT,
      ort TEXT,
      kwp NUMERIC,
      zaehler_nr TEXT,
      netzbetreiber TEXT,
      malo_id TEXT,
      mastr_nr TEXT,
      status TEXT DEFAULT 'erfasst' CHECK (
        status IN ('erfasst','unterlagen_angefordert','eingereicht','in_pruefung','genehmigt','abgelehnt','inbetrieb')
      ),
      status_history JSONB DEFAULT '[]',
      anmeldung_datum DATE,
      genehmigung_datum DATE,
      inbetriebnahme_datum DATE,
      einspeiseverguetung_beantragt BOOLEAN DEFAULT false,
      einspeiseverguetung_datum DATE,
      unterlagen JSONB DEFAULT '[]',
      unterlagen_vollstaendig BOOLEAN DEFAULT false,
      notizen TEXT,
      verantwortlich TEXT,
      erstellt_am TIMESTAMPTZ DEFAULT NOW(),
      geaendert_am TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await runSQL('netzanmeldungen_rls_off', `
    ALTER TABLE netzanmeldungen DISABLE ROW LEVEL SECURITY;
  `);

  await runSQL('netzanmeldungen_trigger_fn', `
    CREATE OR REPLACE FUNCTION update_geaendert_am()
    RETURNS TRIGGER AS $$ BEGIN NEW.geaendert_am = NOW(); RETURN NEW; END; $$
    LANGUAGE plpgsql;
  `);

  await runSQL('netzanmeldungen_trigger', `
    DROP TRIGGER IF EXISTS netzanmeldungen_geaendert ON netzanmeldungen;
    CREATE TRIGGER netzanmeldungen_geaendert
      BEFORE UPDATE ON netzanmeldungen
      FOR EACH ROW EXECUTE FUNCTION update_geaendert_am();
  `);

  // ── PREVIOUS MIGRATIONS (kept for reference) ──────────────────────────────
  // geo columns on pay_mitarbeiter (already ran)

  const allOk = results.every(r => r.ok !== false || r.error === undefined);
  return res.status(200).json({ success: allOk, results });
}
