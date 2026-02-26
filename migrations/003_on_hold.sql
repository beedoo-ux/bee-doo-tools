-- On Hold: Aufträge mit "Montage > On hold" im WorkflowHistory nicht auszahlen
ALTER TABLE pay_auftraege ADD COLUMN IF NOT EXISTS on_hold boolean DEFAULT false;
ALTER TABLE pay_auftraege ADD COLUMN IF NOT EXISTS on_hold_seit timestamp with time zone;
ALTER TABLE pay_auftraege ADD COLUMN IF NOT EXISTS workflow_status text;

COMMENT ON COLUMN pay_auftraege.on_hold IS 'True wenn Montage On Hold - nicht auszahlen bis Baustelle gestartet';
COMMENT ON COLUMN pay_auftraege.on_hold_seit IS 'Zeitpunkt seit wann On Hold';
COMMENT ON COLUMN pay_auftraege.workflow_status IS 'Letzter relevanter Workflow-Status aus CRM';
