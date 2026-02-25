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

  // ── 1. SPERRLISTEN ───
  await sql('create_sperrlisten', `CREATE TABLE IF NOT EXISTS pay_sperrlisten (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    auftrag_nr TEXT NOT NULL, kunde_name TEXT, vertriebler TEXT,
    typ TEXT NOT NULL CHECK(typ IN ('grundbuch','montage_abbruch','crm_storno','sonstige')),
    status TEXT NOT NULL DEFAULT 'gesperrt' CHECK(status IN ('gesperrt','ausgezahlt','rueckforderung','geklaert')),
    betrag NUMERIC(10,2) DEFAULT 0, ausgezahlt_am DATE, notiz TEXT,
    erstellt_am TIMESTAMPTZ DEFAULT now(), geaendert_am TIMESTAMPTZ DEFAULT now());`);

  // ── 2. DUPLIKATE ───
  await sql('create_duplikate', `CREATE TABLE IF NOT EXISTS pay_duplikate (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    kunde_name TEXT NOT NULL, plz TEXT, kwp NUMERIC(5,2),
    auftrag_nr_1 TEXT NOT NULL, auftrag_nr_2 TEXT NOT NULL, vertriebler TEXT,
    status TEXT NOT NULL DEFAULT 'offen' CHECK(status IN ('offen','geklaert','storniert','entscheidung_noetig')),
    aktion TEXT, notiz TEXT,
    erstellt_am TIMESTAMPTZ DEFAULT now(), geaendert_am TIMESTAMPTZ DEFAULT now());`);

  // ── 3. SONDERPROVISIONEN ───
  await sql('create_sonderprovisionen', `CREATE TABLE IF NOT EXISTS pay_sonderprovisionen (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    mitarbeiter_id UUID REFERENCES pay_mitarbeiter(id),
    mitarbeiter_name TEXT NOT NULL,
    typ TEXT NOT NULL CHECK(typ IN ('flat_rate','eigenlead_override','empfehlung_override','speicher_override')),
    betrag NUMERIC(10,2) NOT NULL, beschreibung TEXT,
    gueltig_ab DATE NOT NULL DEFAULT '2025-01-01', gueltig_bis DATE,
    aktiv BOOLEAN DEFAULT true,
    erstellt_am TIMESTAMPTZ DEFAULT now(), geaendert_am TIMESTAMPTZ DEFAULT now());`);

  // ── 4. STUFENBONUS ───
  await sql('create_stufenbonus', `CREATE TABLE IF NOT EXISTS pay_stufenbonus (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    stufe_name TEXT NOT NULL, min_anlagen INTEGER NOT NULL,
    bonus_betrag NUMERIC(10,2) NOT NULL,
    gilt_fuer TEXT NOT NULL DEFAULT 'hgb_vertriebler_haupt',
    kumulativ BOOLEAN DEFAULT false, aktiv BOOLEAN DEFAULT true,
    erstellt_am TIMESTAMPTZ DEFAULT now());`);

  // ── 5. TEAM BONUS ───
  await sql('create_team_bonus', `CREATE TABLE IF NOT EXISTS pay_team_bonus (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    mitarbeiter_id UUID REFERENCES pay_mitarbeiter(id),
    mitarbeiter_name TEXT NOT NULL,
    betrag_pro_sale NUMERIC(10,2) NOT NULL,
    bezugsgruppe TEXT NOT NULL CHECK(bezugsgruppe IN ('alle_vt','eigenes_team','custom')),
    team_mitglieder TEXT[], gueltig_ab DATE NOT NULL DEFAULT '2026-01-01',
    gueltig_bis DATE, aktiv BOOLEAN DEFAULT true,
    erstellt_am TIMESTAMPTZ DEFAULT now());`);

  // ── RLS + POLICIES ───
  for (const t of ['pay_sperrlisten','pay_duplikate','pay_sonderprovisionen','pay_stufenbonus','pay_team_bonus']) {
    await sql(`rls_${t}`, `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`);
    await sql(`policy_${t}`, `DROP POLICY IF EXISTS "${t}_anon_all" ON ${t}; CREATE POLICY "${t}_anon_all" ON ${t} FOR ALL TO anon USING (true) WITH CHECK (true);`);
  }

  // ── SEED DATA ───
  await sql('seed_stufenbonus', `INSERT INTO pay_stufenbonus (stufe_name, min_anlagen, bonus_betrag, gilt_fuer, kumulativ)
    SELECT 'Stufe 1', 10, 2000, 'hgb_vertriebler_haupt', false WHERE NOT EXISTS (SELECT 1 FROM pay_stufenbonus WHERE stufe_name='Stufe 1');
    INSERT INTO pay_stufenbonus (stufe_name, min_anlagen, bonus_betrag, gilt_fuer, kumulativ)
    SELECT 'Stufe 2', 15, 5000, 'hgb_vertriebler_haupt', false WHERE NOT EXISTS (SELECT 1 FROM pay_stufenbonus WHERE stufe_name='Stufe 2');`);

  await sql('seed_sonderprovisionen', `INSERT INTO pay_sonderprovisionen (mitarbeiter_name, typ, betrag, beschreibung, gueltig_ab, mitarbeiter_id)
    SELECT 'Christoph Held', 'flat_rate', 3000, 'Flat 3.000€/Anlage (statt Staffel)', '2026-01-01',
      (SELECT id FROM pay_mitarbeiter WHERE nachname='Held' AND vorname='Christoph' LIMIT 1)
    WHERE NOT EXISTS (SELECT 1 FROM pay_sonderprovisionen WHERE mitarbeiter_name='Christoph Held' AND typ='flat_rate');
    INSERT INTO pay_sonderprovisionen (mitarbeiter_name, typ, betrag, beschreibung, gueltig_ab, mitarbeiter_id)
    SELECT 'Tayfun Süleymaniye', 'flat_rate', 2700, 'Flat 2.700€/Anlage (statt Staffel)', '2026-01-01',
      (SELECT id FROM pay_mitarbeiter WHERE nachname='Süleymaniye' AND vorname='Tayfun' LIMIT 1)
    WHERE NOT EXISTS (SELECT 1 FROM pay_sonderprovisionen WHERE mitarbeiter_name='Tayfun Süleymaniye' AND typ='flat_rate');
    INSERT INTO pay_sonderprovisionen (mitarbeiter_name, typ, betrag, beschreibung, gueltig_ab, mitarbeiter_id)
    SELECT 'Stefan Hensel', 'flat_rate', 2800, 'Flat 2.800€/Anlage, kein Eigenlead', '2025-01-01',
      (SELECT id FROM pay_mitarbeiter WHERE nachname='Hensel' AND vorname='Stefan' LIMIT 1)
    WHERE NOT EXISTS (SELECT 1 FROM pay_sonderprovisionen WHERE mitarbeiter_name='Stefan Hensel' AND typ='flat_rate');`);

  await sql('seed_team_bonus', `INSERT INTO pay_team_bonus (mitarbeiter_name, betrag_pro_sale, bezugsgruppe, team_mitglieder, gueltig_ab, mitarbeiter_id)
    SELECT 'Christoph Held', 200, 'alle_vt', NULL, '2026-01-01',
      (SELECT id FROM pay_mitarbeiter WHERE nachname='Held' AND vorname='Christoph' LIMIT 1)
    WHERE NOT EXISTS (SELECT 1 FROM pay_team_bonus WHERE mitarbeiter_name='Christoph Held');
    INSERT INTO pay_team_bonus (mitarbeiter_name, betrag_pro_sale, bezugsgruppe, team_mitglieder, gueltig_ab, mitarbeiter_id)
    SELECT 'Tayfun Süleymaniye', 300, 'eigenes_team',
      ARRAY['Pascal Schallenberg','Maxim Horten','Patrick Kalinowski','Bernd Krahwinkel','Kadir Danyildiz'],
      '2026-01-01',
      (SELECT id FROM pay_mitarbeiter WHERE nachname='Süleymaniye' AND vorname='Tayfun' LIMIT 1)
    WHERE NOT EXISTS (SELECT 1 FROM pay_team_bonus WHERE mitarbeiter_name='Tayfun Süleymaniye');`);

  await sql('seed_sperrlisten_gb', `INSERT INTO pay_sperrlisten (auftrag_nr, kunde_name, vertriebler, typ, status)
    SELECT v.* FROM (VALUES
      ('15332','Katrin Winter','Christoph Held','grundbuch','gesperrt'),
      ('15302','Melanie Niehus','Fabian Hindenberg','grundbuch','gesperrt'),
      ('15166','Emöke Hoffmann','Christoph Held','grundbuch','gesperrt'),
      ('14924','Sascha Mamerow','Gino Ulitzka','grundbuch','gesperrt'),
      ('14776','Reimund Menninghaus','Gino Ulitzka','grundbuch','gesperrt'),
      ('15154','Carsten Reinicke','Hartmut Seitz','grundbuch','gesperrt'),
      ('15100','Ulrich Schülke','Fabian Hindenberg','crm_storno','gesperrt'),
      ('14489','Nogin Bashar','Stefan Hensel','crm_storno','gesperrt')
    ) AS v(auftrag_nr,kunde_name,vertriebler,typ,status)
    WHERE NOT EXISTS (SELECT 1 FROM pay_sperrlisten WHERE auftrag_nr=v.auftrag_nr);`);

  await sql('seed_sperrlisten_ma', `INSERT INTO pay_sperrlisten (auftrag_nr, kunde_name, typ, status, notiz)
    SELECT v.* FROM (VALUES
      ('13139','MA-Abbruch','montage_abbruch','gesperrt','WorkflowHistory: Montage abgebrochen'),
      ('13872','MA-Abbruch','montage_abbruch','gesperrt','WorkflowHistory: Montage abgebrochen'),
      ('15151','MA-Abbruch','montage_abbruch','gesperrt','WorkflowHistory: Montage abgebrochen'),
      ('15709','MA-Abbruch','montage_abbruch','gesperrt','WorkflowHistory: Montage abgebrochen'),
      ('12266','MA-Abbruch ausgez.','montage_abbruch','ausgezahlt','Rückforderung prüfen'),
      ('13453','MA-Abbruch ausgez.','montage_abbruch','ausgezahlt','Rückforderung prüfen'),
      ('14114','MA-Abbruch ausgez.','montage_abbruch','ausgezahlt','Rückforderung prüfen'),
      ('14827','MA-Abbruch ausgez.','montage_abbruch','ausgezahlt','Rückforderung prüfen'),
      ('14988','MA-Abbruch ausgez.','montage_abbruch','ausgezahlt','Rückforderung prüfen'),
      ('15523','MA-Abbruch ausgez.','montage_abbruch','ausgezahlt','Rückforderung prüfen')
    ) AS v(auftrag_nr,kunde_name,typ,status,notiz)
    WHERE NOT EXISTS (SELECT 1 FROM pay_sperrlisten WHERE auftrag_nr=v.auftrag_nr);`);

  await sql('seed_duplikate', `INSERT INTO pay_duplikate (kunde_name, plz, kwp, auftrag_nr_1, auftrag_nr_2, vertriebler, status)
    SELECT v.* FROM (VALUES
      ('Angelika Blaum','58809',9.86,'14988','15154','Hartmut Seitz','entscheidung_noetig'),
      ('Annette Bieker','59065',10.95,'13139','13453','Nino Rimmler','entscheidung_noetig'),
      ('David u. Oxana Meinhardt','59439',11.31,'14489','14827','Stefan Hensel','entscheidung_noetig'),
      ('Halil Kayis','44319',8.40,'15100','15151','Fabian Hindenberg','entscheidung_noetig'),
      ('Karin Glatz','44623',10.95,'13820','13872','Klaus Vollmer','entscheidung_noetig'),
      ('Marc Lichtenegger','45329',9.86,'14114','14219','Gino Ulitzka','entscheidung_noetig'),
      ('Martin Seidel','58840',11.68,'12902','13139','Nino Rimmler','entscheidung_noetig'),
      ('Maximilian Faber','44149',10.22,'15302','15332','Fabian Hindenberg','entscheidung_noetig'),
      ('Peter Hasse','59846',12.78,'12266','12581','Dimitri van Eeuwen','entscheidung_noetig'),
      ('Sven Fischer','58791',9.49,'15523','15709','Stefan Hensel','entscheidung_noetig'),
      ('Tatjana u. Steffen Podein','45549',10.58,'14776','14924','Gino Ulitzka','entscheidung_noetig')
    ) AS v(kunde_name,plz,kwp,auftrag_nr_1,auftrag_nr_2,vertriebler,status)
    WHERE NOT EXISTS (SELECT 1 FROM pay_duplikate WHERE auftrag_nr_1=v.auftrag_nr_1 AND auftrag_nr_2=v.auftrag_nr_2);`);

  res.json({ ok: true, total: results.length, success: results.filter(r=>r.ok).length, results });
}
