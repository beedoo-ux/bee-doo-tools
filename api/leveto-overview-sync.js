// api/leveto-overview-sync.js
// Syncs ALL leads from Leveto Overview API → leveto_leads (Supabase)
// Single fast request replaces the old paginated /leads API
// Cron: every 15 minutes

const SU = 'https://hqzpemfaljxcysyqssng.supabase.co';
const SK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxenBlbWZhbGp4Y3lzeXFzc25nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTMzNTM5NywiZXhwIjoyMDg2OTExMzk3fQ.MJ3cyAAquE8DK2ngzfIIn4bTpQ8_H9DaeJ3YTlBdFz4';
const LU = 'https://beedoo.leveto.net/API';

export const config = { maxDuration: 60 };

const hd = () => ({ apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' });

function vd(d) {
  if (!d || d === '0000-00-00' || d === '0000-00-00 00:00:00' || d === 'XXX' || d === 'None') return null;
  return d;
}

function mapLead(l, now) {
  // Overview API fields → leveto_leads schema
  // NOTE: overview has fewer fields than /leads — we preserve existing values for missing fields
  return {
    leveto_id:              l.id,
    id_extern:              l.id_extern || null,
    vorname:                (l.vorname || '').trim() || null,
    nachname:               (l.nachname || '').trim() || null,
    email:                  l.email || null,
    plz:                    l.plz || null,
    ort:                    l.stadt || null,
    quelle:                 l.quelle || null,
    berater_name:           l.berater || null,
    berater_ma_nummer:      l.berater_ma_nummer || null,
    status_name:            l.leadstatus || null,
    mvpp_id:                l.mvp_id || null,
    mvpp_name:              l.mvp_nummer || null,
    leveto_importiert_am:   vd(l.importiert),
    // importiert = actual creation date (createdOn is always 0000-00-00 for imported leads)
    leveto_erstellt_am:     vd(l.importiert),
    sync_aktualisiert_am:   now,
  };
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
    if (!authD.token) throw new Error('Leveto auth failed: ' + JSON.stringify(authD));

    // 2. Fetch Overview — single request, all 53k+ leads
    const ovR = await fetch(`${LU}/overview`, {
      headers: { Authorization: `Bearer ${authD.token}` }
    });
    if (!ovR.ok) throw new Error(`Overview HTTP ${ovR.status}`);
    const ovD = await ovR.json();

    // 3. Extract leads array
    const leads = Array.isArray(ovD) ? ovD : (ovD.data || []);
    if (!leads.length) return res.status(200).json({ ok: true, synced: 0, msg: 'No leads in overview' });

    const now = new Date().toISOString();
    const rows = leads.map(l => mapLead(l, now));

    // 4. Upsert in batches of 500
    let synced = 0;
    let errors = 0;
    const BS = 500;

    for (let i = 0; i < rows.length; i += BS) {
      const batch = rows.slice(i, i + BS);
      const r = await fetch(`${SU}/rest/v1/leveto_leads?on_conflict=leveto_id`, {
        method: 'POST',
        headers: { ...hd(), Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(batch)
      });
      if (r.ok || r.status === 200 || r.status === 201) {
        synced += batch.length;
      } else {
        errors++;
        const errText = await r.text();
        console.error(`Batch ${i}–${i+BS} error:`, errText.slice(0, 200));
      }

      // Small pause between batches to avoid overloading Supabase
      if (i + BS < rows.length) await new Promise(r => setTimeout(r, 100));
    }

    // 5. Update sync_configs record
    await fetch(`${SU}/rest/v1/sync_configs?sync_key=eq.leveto_overview_sync`, {
      method: 'PATCH',
      headers: hd(),
      body: JSON.stringify({
        last_sync_at: now,
        last_sync_result: { synced, total: leads.length, errors, duration_ms: Date.now() - t0, success: true },
        updated_at: now
      })
    });

    return res.status(200).json({
      ok: true,
      synced,
      total: leads.length,
      errors,
      duration_ms: Date.now() - t0
    });

  } catch (err) {
    console.error('leveto-overview-sync error:', err);
    return res.status(500).json({ error: err.message, duration_ms: Date.now() - t0 });
  }
}
