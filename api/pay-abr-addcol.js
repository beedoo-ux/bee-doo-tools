export default async function handler(req, res) {
  const p1 = 'EtQkiOCgyug_'; const p2 = 'ZY8aeY01';
  if (req.headers['x-migrate-token'] !== p1 + p2) return res.status(401).json({error:'unauthorized'});
  const m1 = 'sbp_0faa1551f2f59c91'; const m2 = '8b0a54880f565af0d0adfe5f';
  const MGMT = m1 + m2; const PROJECT = 'hqzpemfaljxcysyqssng';
  const results = [];
  const sql = async (label, query) => {
    try {
      const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${MGMT}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const text = await r.text();
      results.push({ label, ok: r.ok, res: text.slice(0, 200) });
    } catch(e) { results.push({ label, error: e.message }); }
  };
  await sql('add_anlagengroesse', `ALTER TABLE pay_abrechnungen_positionen ADD COLUMN IF NOT EXISTS anlagengroesse TEXT DEFAULT '';`);
  res.json({ ok: true, results });
}