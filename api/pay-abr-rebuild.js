export default async function handler(req, res) {
  const p1 = 'EtQkiOCgyug_';
  const p2 = 'ZY8aeY01';
  if (req.headers['x-migrate-token'] !== p1 + p2) return res.status(401).json({error:'unauthorized'});
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
      results.push({ label, ok: r.ok, res: text.slice(0, 200) });
    } catch(e) { results.push({ label, error: e.message }); }
  };

  await sql('drop_pos', 'DROP TABLE IF EXISTS pay_abrechnungen_positionen CASCADE;');
  await sql('drop_abr', 'DROP TABLE IF EXISTS pay_abrechnungen CASCADE;');

  await sql('create_abr', `CREATE TABLE pay_abrechnungen (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    periode TEXT NOT NULL,
    mitarbeiter_name TEXT NOT NULL,
    mitarbeiter_id TEXT,
    kuerzel TEXT,
    beschaeftigungsart TEXT DEFAULT 'hgb',
    status TEXT DEFAULT 'entwurf',
    anzahl_sales INTEGER DEFAULT 0,
    rate_je_sale NUMERIC(10,2) DEFAULT 0,
    brutto_provisionen NUMERIC(12,2) DEFAULT 0,
    systemgebuehr_netto NUMERIC(10,2) DEFAULT 0,
    systemgebuehr_ust NUMERIC(10,2) DEFAULT 0,
    einmalzahlungen_summe NUMERIC(12,2) DEFAULT 0,
    nettobetrag NUMERIC(12,2) DEFAULT 0,
    ust_satz NUMERIC(5,2) DEFAULT 19.0,
    ust_betrag NUMERIC(12,2) DEFAULT 0,
    auszahlungssumme NUMERIC(12,2) DEFAULT 0,
    notizen TEXT DEFAULT '',
    stb_kommentar TEXT DEFAULT '',
    freigegeben_am TIMESTAMPTZ,
    freigegeben_von TEXT,
    ausgezahlt_am TIMESTAMPTZ,
    belegnummer TEXT,
    erstellt_am TIMESTAMPTZ DEFAULT now(),
    geaendert_am TIMESTAMPTZ DEFAULT now(),
    UNIQUE(periode, mitarbeiter_name)
  );`);

  await sql('idx_abr', 'CREATE INDEX idx_pay_abr_periode ON pay_abrechnungen(periode, status);');
  await sql('rls_abr', 'ALTER TABLE pay_abrechnungen ENABLE ROW LEVEL SECURITY;');
  await sql('pol_abr', `CREATE POLICY "pay_abr_anon" ON pay_abrechnungen FOR ALL TO anon USING (true) WITH CHECK (true);`);

  await sql('create_pos', `CREATE TABLE pay_abrechnungen_positionen (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    abrechnung_id UUID REFERENCES pay_abrechnungen(id) ON DELETE CASCADE,
    typ TEXT DEFAULT 'provision',
    auftrag_nr TEXT,
    kunde TEXT,
    produkt TEXT,
    original_betrag NUMERIC(10,2) NOT NULL,
    override_betrag NUMERIC(10,2),
    aktiv BOOLEAN DEFAULT true,
    zurueckgestellt BOOLEAN DEFAULT false,
    notiz TEXT DEFAULT '',
    erstellt_am TIMESTAMPTZ DEFAULT now()
  );`);

  await sql('idx_pos', 'CREATE INDEX idx_pay_pos_abr ON pay_abrechnungen_positionen(abrechnung_id, aktiv);');
  await sql('rls_pos', 'ALTER TABLE pay_abrechnungen_positionen ENABLE ROW LEVEL SECURITY;');
  await sql('pol_pos', `CREATE POLICY "pay_pos_anon" ON pay_abrechnungen_positionen FOR ALL TO anon USING (true) WITH CHECK (true);`);

  res.json({ ok: true, results });
}