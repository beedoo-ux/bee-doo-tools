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
      results.push({ label, status: r.status, ok: r.ok, res: text.slice(0, 200) });
      return r.ok;
    } catch(e) { results.push({ label, error: e.message }); return false; }
  };

  // ── PROVISIONS HISTORIE ───
  await sql('create_provisions_historie', `CREATE TABLE IF NOT EXISTS pay_provisions_historie (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    mitarbeiter_id UUID REFERENCES pay_mitarbeiter(id),
    mitarbeiter_name TEXT NOT NULL,
    gueltig_ab DATE NOT NULL,
    gueltig_bis DATE,
    basis_betrag NUMERIC(10,2) NOT NULL,
    staffel_betrag NUMERIC(10,2),
    staffel_schwelle INTEGER DEFAULT 8,
    eigenlead_betrag NUMERIC(10,2) DEFAULT 0,
    empfehlung_betrag NUMERIC(10,2) DEFAULT 0,
    speicher_betrag NUMERIC(10,2) DEFAULT 0,
    stufenbonus_berechtigt BOOLEAN DEFAULT true,
    ist_flat_rate BOOLEAN DEFAULT false,
    notiz TEXT,
    erstellt_am TIMESTAMPTZ DEFAULT now()
  );`);

  await sql('rls_historie', `ALTER TABLE pay_provisions_historie ENABLE ROW LEVEL SECURITY;`);
  await sql('policy_historie', `DROP POLICY IF EXISTS "pay_provisions_historie_anon_all" ON pay_provisions_historie;
    CREATE POLICY "pay_provisions_historie_anon_all" ON pay_provisions_historie FOR ALL TO anon USING (true) WITH CHECK (true);`);

  // ── INDEX for fast lookups ───
  await sql('idx_historie', `CREATE INDEX IF NOT EXISTS idx_prov_hist_ma_date 
    ON pay_provisions_historie(mitarbeiter_name, gueltig_ab DESC);`);

  // ── SEED: Historical rates for ALL VTs ───
  // HGB Vertriebler Haupt - default rate since beginning
  const hgbVTs = [
    'Janik Voß','Martin Bott','Philipp-Torben Hannigk','Pascal Schallenberg',
    'Lukas Kirschner','Hartmut Seitz','Farshad Nourouzi','Gino Ulitzka',
    'Maxim Horten','Patrick Kalinowski','Nino Rimmler','Klaus Vollmer',
    'Sebastian Mansour','Andreas Klee','Dimitri van Eeuwen','Richard Winzent',
    'Fabian Hindenberg','Marco Bringmann','Calogero Iannuzzo','Daniel Saweljew',
    'Frank Reddig','Christian Seifert','Kevin Kraus'
  ];

  // Standard HGB rates for all regular VTs
  const hgbValues = hgbVTs.map(n => 
    `((SELECT id FROM pay_mitarbeiter WHERE CONCAT(vorname,' ',nachname)='${n}' LIMIT 1),'${n}','2025-01-01',NULL,1400,1700,8,800,500,0,true,false,'Standard HGB Haupt §84')`
  ).join(',\n');

  await sql('seed_hgb_historie', `INSERT INTO pay_provisions_historie 
    (mitarbeiter_id, mitarbeiter_name, gueltig_ab, gueltig_bis, basis_betrag, staffel_betrag, staffel_schwelle, eigenlead_betrag, empfehlung_betrag, speicher_betrag, stufenbonus_berechtigt, ist_flat_rate, notiz)
    VALUES ${hgbValues}
    ON CONFLICT DO NOTHING;`);

  // Angestellte VTs
  const angVTs = ['Miguel Schader','Pascal Meier','Nils Horn','Jannis Pfeiffer','Kadir Danyildiz','Maximilian Koch','Bernd Krahwinkel'];
  const angValues = angVTs.map(n =>
    `((SELECT id FROM pay_mitarbeiter WHERE CONCAT(vorname,' ',nachname)='${n}' LIMIT 1),'${n}','2025-01-01',NULL,500,700,8,400,300,150,false,false,'Standard Angestellt VT')`
  ).join(',\n');

  await sql('seed_ang_historie', `INSERT INTO pay_provisions_historie 
    (mitarbeiter_id, mitarbeiter_name, gueltig_ab, gueltig_bis, basis_betrag, staffel_betrag, staffel_schwelle, eigenlead_betrag, empfehlung_betrag, speicher_betrag, stufenbonus_berechtigt, ist_flat_rate, notiz)
    VALUES ${angValues}
    ON CONFLICT DO NOTHING;`);

  // ── SONDER-VTs: Before + After ───
  // Tayfun: HGB Haupt bis 31.12.2025, then 2700 flat ab 01.01.2026
  await sql('seed_tayfun_alt', `INSERT INTO pay_provisions_historie 
    (mitarbeiter_id, mitarbeiter_name, gueltig_ab, gueltig_bis, basis_betrag, staffel_betrag, staffel_schwelle, eigenlead_betrag, empfehlung_betrag, speicher_betrag, stufenbonus_berechtigt, ist_flat_rate, notiz)
    SELECT (SELECT id FROM pay_mitarbeiter WHERE nachname='Süleymaniye' LIMIT 1),
      'Tayfun Süleymaniye','2025-01-01','2025-12-31',1400,1700,8,800,500,0,true,false,'HGB Haupt (vor Erhöhung)'
    WHERE NOT EXISTS (SELECT 1 FROM pay_provisions_historie WHERE mitarbeiter_name='Tayfun Süleymaniye' AND gueltig_ab='2025-01-01');`);

  await sql('seed_tayfun_neu', `INSERT INTO pay_provisions_historie 
    (mitarbeiter_id, mitarbeiter_name, gueltig_ab, gueltig_bis, basis_betrag, staffel_betrag, staffel_schwelle, eigenlead_betrag, empfehlung_betrag, speicher_betrag, stufenbonus_berechtigt, ist_flat_rate, notiz)
    SELECT (SELECT id FROM pay_mitarbeiter WHERE nachname='Süleymaniye' LIMIT 1),
      'Tayfun Süleymaniye','2026-01-01',NULL,2700,2700,999,0,0,200,false,true,'Flat 2.700€ + Team-Bonus (ab Jan 2026)'
    WHERE NOT EXISTS (SELECT 1 FROM pay_provisions_historie WHERE mitarbeiter_name='Tayfun Süleymaniye' AND gueltig_ab='2026-01-01');`);

  // Christoph Held: HGB Haupt bis 31.12.2025, then 3000 flat ab 01.01.2026
  await sql('seed_christoph_alt', `INSERT INTO pay_provisions_historie 
    (mitarbeiter_id, mitarbeiter_name, gueltig_ab, gueltig_bis, basis_betrag, staffel_betrag, staffel_schwelle, eigenlead_betrag, empfehlung_betrag, speicher_betrag, stufenbonus_berechtigt, ist_flat_rate, notiz)
    SELECT (SELECT id FROM pay_mitarbeiter WHERE nachname='Held' AND vorname='Christoph' LIMIT 1),
      'Christoph Held','2025-01-01','2025-12-31',1400,1700,8,800,500,0,true,false,'HGB Haupt (vor Erhöhung)'
    WHERE NOT EXISTS (SELECT 1 FROM pay_provisions_historie WHERE mitarbeiter_name='Christoph Held' AND gueltig_ab='2025-01-01');`);

  await sql('seed_christoph_neu', `INSERT INTO pay_provisions_historie 
    (mitarbeiter_id, mitarbeiter_name, gueltig_ab, gueltig_bis, basis_betrag, staffel_betrag, staffel_schwelle, eigenlead_betrag, empfehlung_betrag, speicher_betrag, stufenbonus_berechtigt, ist_flat_rate, notiz)
    SELECT (SELECT id FROM pay_mitarbeiter WHERE nachname='Held' AND vorname='Christoph' LIMIT 1),
      'Christoph Held','2026-01-01',NULL,3000,3000,999,800,400,200,false,true,'Flat 3.000€ + Team-Bonus 200€×alle VT (ab Jan 2026)'
    WHERE NOT EXISTS (SELECT 1 FROM pay_provisions_historie WHERE mitarbeiter_name='Christoph Held' AND gueltig_ab='2026-01-01');`);

  // Stefan Hensel: immer 2800 flat
  await sql('seed_stefan', `INSERT INTO pay_provisions_historie 
    (mitarbeiter_id, mitarbeiter_name, gueltig_ab, gueltig_bis, basis_betrag, staffel_betrag, staffel_schwelle, eigenlead_betrag, empfehlung_betrag, speicher_betrag, stufenbonus_berechtigt, ist_flat_rate, notiz)
    SELECT (SELECT id FROM pay_mitarbeiter WHERE nachname='Hensel' AND vorname='Stefan' LIMIT 1),
      'Stefan Hensel','2025-01-01',NULL,2800,2800,999,0,400,200,false,true,'Flat 2.800€, kein Eigenlead (seit immer)'
    WHERE NOT EXISTS (SELECT 1 FROM pay_provisions_historie WHERE mitarbeiter_name='Stefan Hensel' AND gueltig_ab='2025-01-01');`);

  res.json({ ok: true, total: results.length, success: results.filter(r=>r.ok).length, results });
}
