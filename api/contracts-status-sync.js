// api/contracts-status-sync.js
// Syncs real currentstatus + storno_date from Leveto /contracts endpoint
// Overview API returns "XXX" for auftragsstatus, but /contracts has the real values
// Cron: every 30 minutes

export const config = { maxDuration: 60 };

const SU = 'https://hqzpemfaljxcysyqssng.supabase.co';
const SK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxenBlbWZhbGp4Y3lzeXFzc25nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTMzNTM5NywiZXhwIjoyMDg2OTExMzk3fQ.MJ3cyAAquE8DK2ngzfIIn4bTpQ8_H9DaeJ3YTlBdFz4';
const LU = 'https://beedoo.leveto.net/API';

const hd = () => ({ apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' });

function vd(d) {
  if (!d || d === '0000-00-00' || d === '0000-00-00 00:00:00' || d === 'XXX' || d === 'None') return null;
  return d;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = req.headers.authorization;
  if (auth !== 'Bearer manual' && req.headers['x-vercel-cron'] !== '1' && auth !== `Bearer ${SK}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const t0 = Date.now();

  try {
    // 1. Auth with Leveto
    const authR = await fetch(`${LU}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'api@bee-doo.de', password: 'Patrick123456789!' }).toString()
    });
    const authD = await authR.json();
    if (!authD.token) throw new Error('Auth failed');

    // 2. Fetch contracts from Leveto (paginated)
    // Only fetch accepted contracts from Oct 2025 onwards (our relevant period)
    let allContracts = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const url = `${LU}/contracts?accepteddate_start=2025-10-01&status=Angenommen&limit=50&page=${page}`;
      const r = await fetch(url, {
        headers: { Authorization: `Bearer ${authD.token}` }
      });
      if (!r.ok) throw new Error(`Contracts HTTP ${r.status} on page ${page}`);
      const d = await r.json();

      const contracts = d.data || [];
      allContracts.push(...contracts);
      totalPages = d.totalpages || 1;
      page++;

      if (page <= totalPages) await new Promise(r => setTimeout(r, 100));
    }

    if (!allContracts.length) {
      return res.status(200).json({ ok: true, updated: 0, msg: 'No contracts' });
    }

    // 3. Build patch rows: only fields that /contracts has but Overview doesn't
    const now = new Date().toISOString();
    const patches = allContracts
      .filter(c => c.id && c.currentstatus && c.currentstatus !== 'XXX')
      .map(c => ({
        leveto_id: c.id,
        currentstatus: c.currentstatus,
        storno_date: vd(c.storno_date),
        status_kunde: c.status_kunde || null,
        lead_id: c.leadID || null,
        vorname: c.vorname || null,
        nachname: c.nachname || null,
        berater: c.berater || null,
        quelle: c.quelle || null,
      }));

    // 4. Upsert in batches
    let updated = 0;
    let errors = 0;
    const BS = 200;

    for (let i = 0; i < patches.length; i += BS) {
      const batch = patches.slice(i, i + BS);
      const r = await fetch(`${SU}/rest/v1/leveto_contracts?on_conflict=leveto_id`, {
        method: 'POST',
        headers: { ...hd(), Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(batch)
      });
      if (r.ok) {
        updated += batch.length;
      } else {
        errors++;
        const t = await r.text();
        console.error(`Batch error:`, t.slice(0, 200));
      }
    }

    // 5. Count stornos for logging
    const stornos = patches.filter(p => p.currentstatus === 'Storniert').length;

    console.log(`[contracts-status] ${updated} updated, ${stornos} storniert, ${errors} errors in ${Date.now() - t0}ms`);

    return res.status(200).json({
      ok: true,
      total: allContracts.length,
      updated,
      stornos,
      errors,
      pages: page - 1,
      duration_ms: Date.now() - t0
    });

  } catch (err) {
    console.error('[contracts-status] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
