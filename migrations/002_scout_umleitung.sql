-- Sonderregel: Scout-Umleitung (Selcuk → Tayfun)
-- Erweitere typ-Check um 'scout_umleitung'
ALTER TABLE pay_sonderprovisionen DROP CONSTRAINT IF EXISTS pay_sonderprovisionen_typ_check;
ALTER TABLE pay_sonderprovisionen ADD CONSTRAINT pay_sonderprovisionen_typ_check 
  CHECK (typ IN ('flat_rate', 'nz_override', 'scout_umleitung'));

-- Sonderregel einfügen: Selcuk-Aufträge bei Fremd-VT → Tayfun bekommt Provision + 800€
INSERT INTO pay_sonderprovisionen (mitarbeiter_id, mitarbeiter_name, typ, betrag, beschreibung, aktiv, gueltig_ab)
VALUES (
  '666f07e3-140b-432c-9115-d1f15244ed61',
  'Tayfun Süleymaniye',
  'scout_umleitung',
  800.0,
  '{"scout_id":"82620963-4afe-464b-9a4e-b8db43dfa44c","scout_name":"Selçük Özkaya","regel":"Bei Fremd-VT: Scouter-Provision umleiten auf Tayfun + 800€ extra pro Auftrag"}',
  true,
  '2026-01-01'
)
ON CONFLICT DO NOTHING;
-- triggered
