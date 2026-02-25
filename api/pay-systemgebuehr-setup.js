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

  // ── 1. Systemgebühr-Konfiguration ───
  await sql('create_systemgebuehr', `CREATE TABLE IF NOT EXISTS pay_systemgebuehr (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    bezeichnung TEXT NOT NULL DEFAULT 'Systemgebühr',
    prozent NUMERIC(5,2) NOT NULL DEFAULT 3.0,
    max_netto NUMERIC(10,2) NOT NULL DEFAULT 200.0,
    ust_satz NUMERIC(5,2) NOT NULL DEFAULT 19.0,
    gilt_fuer TEXT NOT NULL DEFAULT 'hgb_alle',
    beschreibung TEXT DEFAULT 'Systemgebühr Netto (3% auf Provisionen, max. 200€) zzgl. 19% USt. Wird als separate Rechnung der bee-doo GmbH abgerechnet (Ziff. 4.2 HVV).',
    aktiv BOOLEAN DEFAULT true,
    gueltig_ab DATE DEFAULT '2025-01-01',
    erstellt_am TIMESTAMPTZ DEFAULT now()
  );`);

  await sql('rls_sg', `ALTER TABLE pay_systemgebuehr ENABLE ROW LEVEL SECURITY;`);
  await sql('policy_sg', `DROP POLICY IF EXISTS "pay_systemgebuehr_anon_all" ON pay_systemgebuehr;
    CREATE POLICY "pay_systemgebuehr_anon_all" ON pay_systemgebuehr FOR ALL TO anon USING (true) WITH CHECK (true);`);

  await sql('seed_sg', `INSERT INTO pay_systemgebuehr (bezeichnung, prozent, max_netto, ust_satz, gilt_fuer, beschreibung)
    SELECT 'Systemgebühr', 3.0, 200.0, 19.0, 'hgb_alle',
      'Systemgebühr Netto (3% auf Provisionen, max. 200€) zzgl. 19% USt. Wird als separate Rechnung der bee-doo GmbH abgerechnet (Ziff. 4.2 HVV).'
    WHERE NOT EXISTS (SELECT 1 FROM pay_systemgebuehr WHERE bezeichnung='Systemgebühr');`);

  // ── 2. PDF-Vorlagen-Referenz ───
  await sql('create_pdf_vorlagen', `CREATE TABLE IF NOT EXISTS pay_pdf_vorlagen (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    typ TEXT NOT NULL CHECK(typ IN ('gutschrift_hgb','entgelt_angestellt','gutschrift_kleinunternehmer')),
    version TEXT NOT NULL DEFAULT '1.0',
    beschreibung TEXT,
    seiten INTEGER DEFAULT 2,
    felder JSONB DEFAULT '{}',
    beispiel_html TEXT,
    aktiv BOOLEAN DEFAULT true,
    erstellt_am TIMESTAMPTZ DEFAULT now(),
    geaendert_am TIMESTAMPTZ DEFAULT now()
  );`);

  await sql('rls_pv', `ALTER TABLE pay_pdf_vorlagen ENABLE ROW LEVEL SECURITY;`);
  await sql('policy_pv', `DROP POLICY IF EXISTS "pay_pdf_vorlagen_anon_all" ON pay_pdf_vorlagen;
    CREATE POLICY "pay_pdf_vorlagen_anon_all" ON pay_pdf_vorlagen FOR ALL TO anon USING (true) WITH CHECK (true);`);

  await sql('seed_pv', `INSERT INTO pay_pdf_vorlagen (typ, version, beschreibung, seiten, felder)
    SELECT 'gutschrift_hgb', '2.0', 'Gutschrift für HGB §84 Vertriebler (MwSt-pflichtig) mit Systemgebühr', 2,
      '{
        "seite1": {
          "header": "bee-doo Logo + Datum + Leistungszeitraum",
          "empfaenger": "Name, Adresse, Steuernr, USt-IdNr",
          "belegnummer": "YYYY-MM-Kürzel",
          "finanztabelle": ["Provisionen (X Sales)", "Brutto-Provisionen", "./. Systemgebühr Netto (3% max 200€)", "./. USt 19% auf Systemgebühr", "Nettobetrag", "+ USt 19% Provisionen", "AUSZAHLUNGSSUMME (Brutto)"],
          "sidebar_rechts": ["Sales-Info (Anzahl, Rate, Netto, USt, Brutto)", "Systemgebühr-Info (Netto, USt, Brutto)"],
          "hinweis": "Gutschrift gem. §14 Abs. 2 UStG",
          "footer": "Firmensitz, Kontakt, Bank, GF"
        },
        "seite2": {
          "header": "Provisionen Monat Jahr + VT Name",
          "tabelle": ["Auftrag-Nr", "Kunde", "Art (Produkt)", "Netto"],
          "summen": ["Netto-Summe", "./. Systemgebühr + USt", "Nettobetrag", "+ USt 19%", "BRUTTO-AUSZAHLUNG"],
          "footer": "Firmensitz, Kontakt, Bank, GF"
        },
        "systemgebuehr": {"prozent": 3, "max_netto": 200, "ust": 19},
        "ust_satz": 19,
        "belegnummer_format": "YYYY-MM-KÜRZEL"
      }'::jsonb
    WHERE NOT EXISTS (SELECT 1 FROM pay_pdf_vorlagen WHERE typ='gutschrift_hgb' AND version='2.0');`);

  res.json({ ok: true, total: results.length, success: results.filter(r=>r.ok).length, results });
}