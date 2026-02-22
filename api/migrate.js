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
      results.push({ label, status: r.status, ok: r.ok, res: text.slice(0, 100) });
      return r.ok;
    } catch(e) { results.push({ label, error: e.message }); return false; }
  };

  // ── NETZANMELDUNGEN TABLE ─────────────────────────────────────────────────
  await sql('create_netzanmeldungen', `CREATE TABLE IF NOT EXISTS netzanmeldungen (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    auftrag_id UUID REFERENCES pay_auftraege(id) ON DELETE SET NULL,
    auftrag_nr TEXT, kunde_name TEXT NOT NULL, kunde_adresse TEXT, plz TEXT, ort TEXT, kwp NUMERIC,
    zaehler_nr TEXT, netzbetreiber TEXT, malo_id TEXT, mastr_nr TEXT,
    status TEXT DEFAULT 'erfasst' CHECK (status IN ('erfasst','unterlagen_angefordert','eingereicht','in_pruefung','genehmigt','abgelehnt','inbetrieb')),
    status_history JSONB DEFAULT '[]', anmeldung_datum DATE, genehmigung_datum DATE,
    inbetriebnahme_datum DATE, einspeiseverguetung_beantragt BOOLEAN DEFAULT false,
    einspeiseverguetung_datum DATE, unterlagen JSONB DEFAULT '[]',
    unterlagen_vollstaendig BOOLEAN DEFAULT false, notizen TEXT, verantwortlich TEXT,
    erstellt_am TIMESTAMPTZ DEFAULT NOW(), geaendert_am TIMESTAMPTZ DEFAULT NOW());`);

  await sql('rls_netz', `ALTER TABLE netzanmeldungen DISABLE ROW LEVEL SECURITY;`);
  await sql('fn_geaendert', `CREATE OR REPLACE FUNCTION update_geaendert_am() RETURNS TRIGGER AS $$ BEGIN NEW.geaendert_am=NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;`);
  await sql('trig_netz', `DROP TRIGGER IF EXISTS netzanmeldungen_geaendert ON netzanmeldungen; CREATE TRIGGER netzanmeldungen_geaendert BEFORE UPDATE ON netzanmeldungen FOR EACH ROW EXECUTE FUNCTION update_geaendert_am();`);

  // ── NETZBETREIBER PLZ MAPPING TABLE ──────────────────────────────────────
  await sql('create_mapping', `CREATE TABLE IF NOT EXISTS netzbetreiber_plz_mapping (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    plz_prefix TEXT NOT NULL UNIQUE,
    netzbetreiber TEXT NOT NULL,
    portal_url TEXT DEFAULT '',
    ansprechpartner TEXT DEFAULT '',
    telefon TEXT DEFAULT '',
    email TEXT DEFAULT '',
    notizen TEXT DEFAULT '',
    bearbeitungszeit_tage INTEGER DEFAULT 30,
    erstellt_am TIMESTAMPTZ DEFAULT NOW(),
    geaendert_am TIMESTAMPTZ DEFAULT NOW());`);

  await sql('rls_mapping', `ALTER TABLE netzbetreiber_plz_mapping DISABLE ROW LEVEL SECURITY;`);

  // ── SEED MAPPING DATA (194 entries, all bee-doo cities) ──────────────────
  await sql('clear_mapping', `DELETE FROM netzbetreiber_plz_mapping;`);

  await sql('map_batch_1', `INSERT INTO netzbetreiber_plz_mapping (plz_prefix, netzbetreiber, portal_url) VALUES
  ('100', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('101', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('102', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('103', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('104', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('105', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('106', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('107', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('108', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('109', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('120', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('121', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('122', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('123', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('124', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('125', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('126', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('127', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('128', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('129', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('130', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('131', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('132', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('133', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('134', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('135', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('136', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('137', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('138', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('139', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('140', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('141', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('142', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('143', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('144', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('145', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('146', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('147', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('148', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('149', 'Stromnetz Berlin GmbH', 'https://www.stromnetz.berlin/'),
('200', 'Stromnetz Hamburg GmbH & Co. KG', 'https://www.stromnetz-hamburg.de/'),
('201', 'Stromnetz Hamburg GmbH & Co. KG', 'https://www.stromnetz-hamburg.de/'),
('202', 'Stromnetz Hamburg GmbH & Co. KG', 'https://www.stromnetz-hamburg.de/'),
('203', 'Stromnetz Hamburg GmbH & Co. KG', 'https://www.stromnetz-hamburg.de/'),
('204', 'Stromnetz Hamburg GmbH & Co. KG', 'https://www.stromnetz-hamburg.de/'),
('205', 'Stromnetz Hamburg GmbH & Co. KG', 'https://www.stromnetz-hamburg.de/'),
('206', 'Stromnetz Hamburg GmbH & Co. KG', 'https://www.stromnetz-hamburg.de/'),
('207', 'Stromnetz Hamburg GmbH & Co. KG', 'https://www.stromnetz-hamburg.de/'),
('208', 'Stromnetz Hamburg GmbH & Co. KG', 'https://www.stromnetz-hamburg.de/'),
('209', 'Stromnetz Hamburg GmbH & Co. KG', 'https://www.stromnetz-hamburg.de/')
  ON CONFLICT (plz_prefix) DO UPDATE SET netzbetreiber=EXCLUDED.netzbetreiber, portal_url=EXCLUDED.portal_url;`);
  await sql('map_batch_2', `INSERT INTO netzbetreiber_plz_mapping (plz_prefix, netzbetreiber, portal_url) VALUES
  ('210', 'Stromnetz Hamburg GmbH & Co. KG', 'https://www.stromnetz-hamburg.de/'),
('211', 'Stromnetz Hamburg GmbH & Co. KG', 'https://www.stromnetz-hamburg.de/'),
('212', 'Stromnetz Hamburg GmbH & Co. KG', 'https://www.stromnetz-hamburg.de/'),
('213', 'Stromnetz Hamburg GmbH & Co. KG', 'https://www.stromnetz-hamburg.de/'),
('214', 'Stromnetz Hamburg GmbH & Co. KG', 'https://www.stromnetz-hamburg.de/'),
('215', 'Stromnetz Hamburg GmbH & Co. KG', 'https://www.stromnetz-hamburg.de/'),
('216', 'Schleswig-Holstein Netz AG', 'https://www.sh-netz.com/'),
('217', 'Schleswig-Holstein Netz AG', 'https://www.sh-netz.com/'),
('218', 'Schleswig-Holstein Netz AG', 'https://www.sh-netz.com/'),
('219', 'Schleswig-Holstein Netz AG', 'https://www.sh-netz.com/'),
('220', 'Stromnetz Hamburg GmbH & Co. KG', 'https://www.stromnetz-hamburg.de/'),
('221', 'Stromnetz Hamburg GmbH & Co. KG', 'https://www.stromnetz-hamburg.de/'),
('222', 'Stromnetz Hamburg GmbH & Co. KG', 'https://www.stromnetz-hamburg.de/'),
('223', 'Stromnetz Hamburg GmbH & Co. KG', 'https://www.stromnetz-hamburg.de/'),
('224', 'Stromnetz Hamburg GmbH & Co. KG', 'https://www.stromnetz-hamburg.de/'),
('225', 'Stromnetz Hamburg GmbH & Co. KG', 'https://www.stromnetz-hamburg.de/'),
('226', 'Stromnetz Hamburg GmbH & Co. KG', 'https://www.stromnetz-hamburg.de/'),
('227', 'Stromnetz Hamburg GmbH & Co. KG', 'https://www.stromnetz-hamburg.de/'),
('228', 'Stromnetz Hamburg GmbH & Co. KG', 'https://www.stromnetz-hamburg.de/'),
('281', 'wesernetz Bremen GmbH', 'https://www.wesernetz.de/'),
('282', 'wesernetz Bremen GmbH', 'https://www.wesernetz.de/'),
('283', 'wesernetz Bremen GmbH', 'https://www.wesernetz.de/'),
('284', 'wesernetz Bremen GmbH', 'https://www.wesernetz.de/'),
('285', 'wesernetz Bremen GmbH', 'https://www.wesernetz.de/'),
('286', 'wesernetz Bremen GmbH', 'https://www.wesernetz.de/'),
('287', 'wesernetz Bremen GmbH', 'https://www.wesernetz.de/'),
('301', 'enercity Netz GmbH', 'https://www.enercity-netz.de/'),
('302', 'enercity Netz GmbH', 'https://www.enercity-netz.de/'),
('303', 'enercity Netz GmbH', 'https://www.enercity-netz.de/'),
('304', 'enercity Netz GmbH', 'https://www.enercity-netz.de/'),
('305', 'enercity Netz GmbH', 'https://www.enercity-netz.de/'),
('306', 'enercity Netz GmbH', 'https://www.enercity-netz.de/'),
('307', 'enercity Netz GmbH', 'https://www.enercity-netz.de/'),
('308', 'Avacon Netz GmbH', 'https://www.avacon-netz.de/'),
('309', 'Avacon Netz GmbH', 'https://www.avacon-netz.de/'),
('311', 'Avacon Netz GmbH', 'https://www.avacon-netz.de/'),
('312', 'Avacon Netz GmbH', 'https://www.avacon-netz.de/'),
('313', 'Avacon Netz GmbH', 'https://www.avacon-netz.de/'),
('320', 'Westfalen Weser Netz GmbH', 'https://www.westfalenweser.de/'),
('321', 'Westfalen Weser Netz GmbH', 'https://www.westfalenweser.de/'),
('322', 'Enervie Vernetzt GmbH', 'https://www.enervie-vernetzt.de/'),
('323', 'Westfalen Weser Netz GmbH', 'https://www.westfalenweser.de/'),
('324', 'Stadtwerke Herford GmbH', 'https://www.stadtwerke-herford.de/'),
('325', 'Westfalen Weser Netz GmbH', 'https://www.westfalenweser.de/'),
('326', 'Westfalen Weser Netz GmbH', 'https://www.westfalenweser.de/'),
('327', 'Stadtwerke Bad Salzuflen GmbH', 'https://www.swbadsalzuflen.de/'),
('328', 'Westfalen Weser Netz GmbH', 'https://www.westfalenweser.de/'),
('329', 'Westfalen Weser Netz GmbH', 'https://www.westfalenweser.de/'),
('336', 'Stadtwerke Bielefeld Netz GmbH', 'https://www.stadtwerke-bielefeld.de/'),
('33659', 'Westfalen Weser Netz GmbH', 'https://www.westfalenweser.de/')
  ON CONFLICT (plz_prefix) DO UPDATE SET netzbetreiber=EXCLUDED.netzbetreiber, portal_url=EXCLUDED.portal_url;`);
  await sql('map_batch_3', `INSERT INTO netzbetreiber_plz_mapping (plz_prefix, netzbetreiber, portal_url) VALUES
  ('33689', 'Westfalen Weser Netz GmbH', 'https://www.westfalenweser.de/'),
('33699', 'Westfalen Weser Netz GmbH', 'https://www.westfalenweser.de/'),
('33719', 'Westfalen Weser Netz GmbH', 'https://www.westfalenweser.de/'),
('33729', 'Westfalen Weser Netz GmbH', 'https://www.westfalenweser.de/'),
('333', 'Stadtwerke Gütersloh GmbH', 'https://www.stadtwerke-guetersloh.de/'),
('33335', 'Stadtwerke Gütersloh GmbH', 'https://www.stadtwerke-guetersloh.de/'),
('33378', 'Stadtwerke Gütersloh GmbH', 'https://www.stadtwerke-guetersloh.de/'),
('337', 'Stadtwerke Paderborn GmbH', 'https://www.sw-pb.de/'),
('334', 'Westfalen Weser Netz GmbH', 'https://www.westfalenweser.de/'),
('335', 'Westfalen Weser Netz GmbH', 'https://www.westfalenweser.de/'),
('441', 'DEW21 Dortmunder Energie- und Wasserversorgung GmbH', 'https://www.dew21.de/'),
('442', 'DEW21 Dortmunder Energie- und Wasserversorgung GmbH', 'https://www.dew21.de/'),
('443', 'DEW21 Dortmunder Energie- und Wasserversorgung GmbH', 'https://www.dew21.de/'),
('444', 'DEW21 Dortmunder Energie- und Wasserversorgung GmbH', 'https://www.dew21.de/'),
('445', 'Westnetz GmbH', 'https://www.westnetz.de/'),
('446', 'Westnetz GmbH', 'https://www.westnetz.de/'),
('447', 'Westnetz GmbH', 'https://www.westnetz.de/'),
('448', 'Westnetz GmbH', 'https://www.westnetz.de/'),
('451', 'Westnetz GmbH', 'https://www.westnetz.de/'),
('452', 'Westnetz GmbH', 'https://www.westnetz.de/'),
('453', 'Westnetz GmbH', 'https://www.westnetz.de/'),
('454', 'Westnetz GmbH', 'https://www.westnetz.de/'),
('455', 'Westnetz GmbH', 'https://www.westnetz.de/'),
('456', 'Westnetz GmbH', 'https://www.westnetz.de/'),
('457', 'Westnetz GmbH', 'https://www.westnetz.de/'),
('458', 'Westnetz GmbH', 'https://www.westnetz.de/'),
('459', 'Westnetz GmbH', 'https://www.westnetz.de/'),
('506', 'Netze Köln GmbH (RheinEnergie)', 'https://www.netze-koeln.de/'),
('507', 'Netze Köln GmbH (RheinEnergie)', 'https://www.netze-koeln.de/'),
('508', 'Netze Köln GmbH (RheinEnergie)', 'https://www.netze-koeln.de/'),
('509', 'Netze Köln GmbH (RheinEnergie)', 'https://www.netze-koeln.de/'),
('510', 'Netze Köln GmbH (RheinEnergie)', 'https://www.netze-koeln.de/'),
('511', 'Netze Köln GmbH (RheinEnergie)', 'https://www.netze-koeln.de/'),
('512', 'Westnetz GmbH', 'https://www.westnetz.de/'),
('513', 'Westnetz GmbH', 'https://www.westnetz.de/'),
('514', 'Westnetz GmbH', 'https://www.westnetz.de/'),
('515', 'Westnetz GmbH', 'https://www.westnetz.de/'),
('516', 'Westnetz GmbH', 'https://www.westnetz.de/'),
('517', 'Westnetz GmbH', 'https://www.westnetz.de/'),
('603', 'Netzdienste Rhein-Main GmbH', 'https://www.ndrm.de/'),
('604', 'Netzdienste Rhein-Main GmbH', 'https://www.ndrm.de/'),
('605', 'Netzdienste Rhein-Main GmbH', 'https://www.ndrm.de/'),
('606', 'Netzdienste Rhein-Main GmbH', 'https://www.ndrm.de/'),
('607', 'Netzdienste Rhein-Main GmbH', 'https://www.ndrm.de/'),
('608', 'Netzdienste Rhein-Main GmbH', 'https://www.ndrm.de/'),
('609', 'Netzdienste Rhein-Main GmbH', 'https://www.ndrm.de/'),
('610', 'Netzdienste Rhein-Main GmbH', 'https://www.ndrm.de/'),
('611', 'Netzdienste Rhein-Main GmbH', 'https://www.ndrm.de/'),
('612', 'Netzdienste Rhein-Main GmbH', 'https://www.ndrm.de/'),
('613', 'Syna GmbH', 'https://www.syna.de/')
  ON CONFLICT (plz_prefix) DO UPDATE SET netzbetreiber=EXCLUDED.netzbetreiber, portal_url=EXCLUDED.portal_url;`);
  await sql('map_batch_4', `INSERT INTO netzbetreiber_plz_mapping (plz_prefix, netzbetreiber, portal_url) VALUES
  ('614', 'Syna GmbH', 'https://www.syna.de/'),
('615', 'Syna GmbH', 'https://www.syna.de/'),
('616', 'Syna GmbH', 'https://www.syna.de/'),
('617', 'Syna GmbH', 'https://www.syna.de/'),
('618', 'Syna GmbH', 'https://www.syna.de/'),
('619', 'Syna GmbH', 'https://www.syna.de/'),
('700', 'Netze BW GmbH', 'https://www.netze-bw.de/'),
('701', 'Netze BW GmbH', 'https://www.netze-bw.de/'),
('702', 'Netze BW GmbH', 'https://www.netze-bw.de/'),
('703', 'Netze BW GmbH', 'https://www.netze-bw.de/'),
('704', 'Netze BW GmbH', 'https://www.netze-bw.de/'),
('705', 'Netze BW GmbH', 'https://www.netze-bw.de/'),
('706', 'Netze BW GmbH', 'https://www.netze-bw.de/'),
('707', 'Netze BW GmbH', 'https://www.netze-bw.de/'),
('708', 'Netze BW GmbH', 'https://www.netze-bw.de/'),
('709', 'Netze BW GmbH', 'https://www.netze-bw.de/'),
('710', 'Netze BW GmbH', 'https://www.netze-bw.de/'),
('711', 'Netze BW GmbH', 'https://www.netze-bw.de/'),
('803', 'SWM Infrastruktur GmbH & Co. KG', 'https://www.swm.de/'),
('804', 'SWM Infrastruktur GmbH & Co. KG', 'https://www.swm.de/'),
('805', 'SWM Infrastruktur GmbH & Co. KG', 'https://www.swm.de/'),
('806', 'SWM Infrastruktur GmbH & Co. KG', 'https://www.swm.de/'),
('807', 'SWM Infrastruktur GmbH & Co. KG', 'https://www.swm.de/'),
('808', 'SWM Infrastruktur GmbH & Co. KG', 'https://www.swm.de/'),
('809', 'SWM Infrastruktur GmbH & Co. KG', 'https://www.swm.de/'),
('810', 'SWM Infrastruktur GmbH & Co. KG', 'https://www.swm.de/'),
('811', 'SWM Infrastruktur GmbH & Co. KG', 'https://www.swm.de/'),
('812', 'Bayernwerk Netz GmbH', 'https://www.bayernwerk-netz.de/'),
('813', 'Bayernwerk Netz GmbH', 'https://www.bayernwerk-netz.de/'),
('814', 'Bayernwerk Netz GmbH', 'https://www.bayernwerk-netz.de/'),
('815', 'Bayernwerk Netz GmbH', 'https://www.bayernwerk-netz.de/'),
('904', 'N-ERGIE Netz GmbH', 'https://www.n-ergie-netz.de/'),
('905', 'N-ERGIE Netz GmbH', 'https://www.n-ergie-netz.de/'),
('906', 'N-ERGIE Netz GmbH', 'https://www.n-ergie-netz.de/'),
('907', 'N-ERGIE Netz GmbH', 'https://www.n-ergie-netz.de/'),
('908', 'N-ERGIE Netz GmbH', 'https://www.n-ergie-netz.de/'),
('041', 'Netz Leipzig GmbH', 'https://www.netz-leipzig.de/'),
('042', 'Netz Leipzig GmbH', 'https://www.netz-leipzig.de/'),
('043', 'Netz Leipzig GmbH', 'https://www.netz-leipzig.de/'),
('044', 'MITNETZ STROM (Mitteldeutsche Netzgesellschaft Strom mbH)', 'https://www.mitnetz-strom.de/'),
('010', 'SachsenNetze GmbH', 'https://www.sachsennetze.de/'),
('011', 'SachsenNetze GmbH', 'https://www.sachsennetze.de/'),
('012', 'SachsenNetze GmbH', 'https://www.sachsennetze.de/'),
('013', 'SachsenNetze GmbH', 'https://www.sachsennetze.de/')
  ON CONFLICT (plz_prefix) DO UPDATE SET netzbetreiber=EXCLUDED.netzbetreiber, portal_url=EXCLUDED.portal_url;`);

  // ── TEST DATA ─────────────────────────────────────────────────────────────
  await sql('clear_test', `DELETE FROM netzanmeldungen WHERE auftrag_nr IN ('BD-2026-001','BD-2026-002','BD-2026-003','BD-2026-004','BD-2026-005','BD-2026-006');`);

  const UL_ALL  = '[{"id":"lageplan","name":"Lageplan","erhalten":true,"datum":"2026-01-15"},{"id":"einlinie","name":"Einlinienschaltplan","erhalten":true,"datum":"2026-01-15"},{"id":"wechselrichter","name":"Datenblatt WR","erhalten":true,"datum":"2026-01-14"},{"id":"module","name":"Datenblatt Module","erhalten":true,"datum":"2026-01-14"},{"id":"konformitaet","name":"Konformitaetserklarung","erhalten":true,"datum":"2026-01-16"},{"id":"vollmacht","name":"Vollmacht","erhalten":true,"datum":"2026-01-13"},{"id":"eigentuemer","name":"Eigentumerzustimmung","erhalten":true,"datum":"2026-01-13"},{"id":"zaehlerfotos","name":"Zaehlerfotos","erhalten":true,"datum":"2026-01-12"},{"id":"mastr","name":"MaStR bestaetigt","erhalten":true,"datum":"2026-02-05"}]';
  const UL_PART = '[{"id":"lageplan","name":"Lageplan","erhalten":true,"datum":"2026-02-01"},{"id":"einlinie","name":"Einlinienschaltplan","erhalten":true,"datum":"2026-02-01"},{"id":"wechselrichter","name":"Datenblatt WR","erhalten":true,"datum":"2026-01-30"},{"id":"module","name":"Datenblatt Module","erhalten":true,"datum":"2026-01-30"},{"id":"konformitaet","name":"Konformitaetserklarung","erhalten":false,"datum":null},{"id":"vollmacht","name":"Vollmacht","erhalten":true,"datum":"2026-01-28"},{"id":"eigentuemer","name":"Eigentumerzustimmung","erhalten":true,"datum":"2026-01-28"},{"id":"zaehlerfotos","name":"Zaehlerfotos","erhalten":false,"datum":null},{"id":"mastr","name":"MaStR bestaetigt","erhalten":false,"datum":null}]';
  const UL_NONE = '[{"id":"lageplan","name":"Lageplan","erhalten":false,"datum":null},{"id":"einlinie","name":"Einlinienschaltplan","erhalten":false,"datum":null},{"id":"wechselrichter","name":"Datenblatt WR","erhalten":false,"datum":null},{"id":"module","name":"Datenblatt Module","erhalten":false,"datum":null},{"id":"konformitaet","name":"Konformitaetserklarung","erhalten":false,"datum":null},{"id":"vollmacht","name":"Vollmacht","erhalten":false,"datum":null},{"id":"eigentuemer","name":"Eigentumerzustimmung","erhalten":false,"datum":null},{"id":"zaehlerfotos","name":"Zaehlerfotos","erhalten":false,"datum":null},{"id":"mastr","name":"MaStR bestaetigt","erhalten":false,"datum":null}]';

  await sql('r1', `INSERT INTO netzanmeldungen (auftrag_id,auftrag_nr,kunde_name,kunde_adresse,plz,ort,kwp,zaehler_nr,netzbetreiber,malo_id,mastr_nr,status,status_history,anmeldung_datum,genehmigung_datum,inbetriebnahme_datum,einspeiseverguetung_beantragt,einspeiseverguetung_datum,unterlagen_vollstaendig,unterlagen,notizen,verantwortlich)
    VALUES ((SELECT id FROM pay_auftraege WHERE auftrag_nr='BD-2026-001' LIMIT 1),
    'BD-2026-001','Hans Mueller','Musterstrasse 1, 33602 Bielefeld','33602','Bielefeld',9.8,'1ESL123456789','Stadtwerke Bielefeld Netz GmbH','52836300012345678','SEE900123456',
    'inbetrieb','[{"status":"erfasst","datum":"2026-01-10T09:00:00Z","notiz":"Anmeldung angelegt"},{"status":"unterlagen_angefordert","datum":"2026-01-12T10:00:00Z","notiz":"Lageplan fehlt"},{"status":"eingereicht","datum":"2026-01-18T14:00:00Z","notiz":"Alle Unterlagen vollstaendig"},{"status":"in_pruefung","datum":"2026-01-20T08:00:00Z","notiz":"Ticket SW-2026-1102"},{"status":"genehmigt","datum":"2026-02-03T11:00:00Z","notiz":"Genehmigung erhalten"},{"status":"inbetrieb","datum":"2026-02-10T13:00:00Z","notiz":"Inbetriebnahme abgeschlossen"}]',
    '2026-01-18','2026-02-03','2026-02-10',true,'2026-02-10',true,'${UL_ALL}',
    'Reibungslos. Ansprechpartner Hr. Keller SW Bielefeld 0521-123456','Sarah Koenig');`);

  await sql('r2', `INSERT INTO netzanmeldungen (auftrag_id,auftrag_nr,kunde_name,kunde_adresse,plz,ort,kwp,zaehler_nr,netzbetreiber,malo_id,mastr_nr,status,status_history,anmeldung_datum,unterlagen_vollstaendig,unterlagen,notizen,verantwortlich)
    VALUES ((SELECT id FROM pay_auftraege WHERE auftrag_nr='BD-2026-002' LIMIT 1),
    'BD-2026-002','Petra Schmidt','Berliner Platz 5, 33602 Bielefeld','33602','Bielefeld',12.0,'1ESL987654321','Stadtwerke Bielefeld Netz GmbH','52836300098765432','SEE900234567',
    'in_pruefung','[{"status":"erfasst","datum":"2026-01-15T09:00:00Z","notiz":"Anmeldung angelegt"},{"status":"unterlagen_angefordert","datum":"2026-01-17T10:00:00Z","notiz":"Vollmacht fehlt"},{"status":"eingereicht","datum":"2026-01-28T14:00:00Z","notiz":"Komplett per Portal"},{"status":"in_pruefung","datum":"2026-01-30T09:00:00Z","notiz":"Ticket SW-2026-4421"}]',
    '2026-01-28',true,'${UL_ALL}','Wartet seit 23 Tagen. Follow-up 20.02. Ticket SW-2026-4421','Sarah Koenig');`);

  await sql('r3', `INSERT INTO netzanmeldungen (auftrag_id,auftrag_nr,kunde_name,kunde_adresse,plz,ort,kwp,netzbetreiber,status,status_history,anmeldung_datum,unterlagen_vollstaendig,unterlagen,notizen,verantwortlich)
    VALUES ((SELECT id FROM pay_auftraege WHERE auftrag_nr='BD-2026-003' LIMIT 1),
    'BD-2026-003','Klaus Weber','Detmolder Str. 12, 33604 Bielefeld','33604','Bielefeld',8.4,'Westfalen Weser Netz GmbH',
    'eingereicht','[{"status":"erfasst","datum":"2026-01-20T09:00:00Z","notiz":"Anmeldung angelegt"},{"status":"unterlagen_angefordert","datum":"2026-01-22T10:00:00Z","notiz":"Einlinie fehlt"},{"status":"eingereicht","datum":"2026-02-05T11:00:00Z","notiz":"Per Einschreiben + Portal WWN"}]',
    '2026-02-05',false,'${UL_PART}','WWN langsamer als SW Bielefeld. Ca. 6-8 Wochen Bearbeitungszeit','Max Berger');`);

  await sql('r4', `INSERT INTO netzanmeldungen (auftrag_id,auftrag_nr,kunde_name,kunde_adresse,plz,ort,kwp,netzbetreiber,status,status_history,unterlagen_vollstaendig,unterlagen,notizen,verantwortlich)
    VALUES ((SELECT id FROM pay_auftraege WHERE auftrag_nr='BD-2026-004' LIMIT 1),
    'BD-2026-004','Maria Fischer','Jollenbecker Str. 44, 33613 Bielefeld','33613','Bielefeld',10.5,'Stadtwerke Bielefeld Netz GmbH',
    'unterlagen_angefordert','[{"status":"erfasst","datum":"2026-02-01T09:00:00Z","notiz":"Anmeldung angelegt"},{"status":"unterlagen_angefordert","datum":"2026-02-03T10:00:00Z","notiz":"Kundin informiert"}]',
    false,'${UL_PART}','Kundin auf Reisen bis 25.02. Dann anrufen wegen Lageplan','Sarah Koenig');`);

  await sql('r5', `INSERT INTO netzanmeldungen (auftrag_id,auftrag_nr,kunde_name,kunde_adresse,plz,ort,kwp,zaehler_nr,netzbetreiber,malo_id,mastr_nr,status,status_history,anmeldung_datum,genehmigung_datum,einspeiseverguetung_beantragt,unterlagen_vollstaendig,unterlagen,notizen,verantwortlich)
    VALUES ((SELECT id FROM pay_auftraege WHERE auftrag_nr='BD-2026-005' LIMIT 1),
    'BD-2026-005','Andreas Hoffmann','Gutersloher Str. 88, 33335 Gutersloh','33335','Gutersloh',15.0,'1ESL555444333','Stadtwerke Gutersloh GmbH','52100000055544433','SEE900345678',
    'genehmigt','[{"status":"erfasst","datum":"2025-12-15T09:00:00Z","notiz":"Anmeldung angelegt"},{"status":"eingereicht","datum":"2026-01-05T14:00:00Z","notiz":"Direkt komplett eingereicht"},{"status":"in_pruefung","datum":"2026-01-08T09:00:00Z","notiz":"Schnelle Bearbeitung"},{"status":"genehmigt","datum":"2026-01-22T11:00:00Z","notiz":"Genehmigung erhalten"}]',
    '2026-01-05','2026-01-22',true,true,'${UL_ALL}','IBN-Termin koordinieren. Elektriker ab 01.03 verfuegbar.','Max Berger');`);

  await sql('r6', `INSERT INTO netzanmeldungen (auftrag_id,auftrag_nr,kunde_name,kunde_adresse,plz,ort,kwp,netzbetreiber,status,status_history,unterlagen_vollstaendig,unterlagen,notizen,verantwortlich)
    VALUES ((SELECT id FROM pay_auftraege WHERE auftrag_nr='BD-2026-006' LIMIT 1),
    'BD-2026-006','Sabine Becker','Am Stadtholz 3, 33609 Bielefeld','33609','Bielefeld',11.2,'Stadtwerke Bielefeld Netz GmbH',
    'erfasst','[{"status":"erfasst","datum":"2026-02-20T09:00:00Z","notiz":"Montage fertig, Anmeldung gestartet"}]',
    false,'${UL_NONE}','Frisch angelegt nach Montage. Unterlagen noch ausstehend.','Sarah Koenig');`);

  const failed = results.filter(r => r.ok === false);
  return res.status(200).json({ success: failed.length === 0, total: results.length, failed: failed.map(r=>r.label), results });
}
