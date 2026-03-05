// api/challenge-leads.js — Challenge 1000er: Eigenleads + Empfehlungen
// Cache-First: liest aus Supabase challenge_cache (stündlich per Cron befüllt)
// Fallback: live Leveto-Abfrage wenn Cache fehlt oder >2h alt

export const config = { maxDuration: 30 };

const SU = 'https://hqzpemfaljxcysyqssng.supabase.co';
const SK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxenBlbWZhbGp4Y3lzeXFzc25nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTMzNTM5NywiZXhwIjoyMDg2OTExMzk3fQ.MJ3cyAAquE8DK2ngzfIIn4bTpQ8_H9DaeJ3YTlBdFz4';
const LEVETO = 'https://beedoo.leveto.net/API';
const hd = () => ({ apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' });
const CACHE_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2h

const BERATER_OVERRIDES = {
  65347: 'Kevin Kraus', 65348: 'Kevin Kraus', 65349: 'Kevin Kraus',
  65354: 'Kevin Kraus', 65355: 'Kevin Kraus', 65687: 'Kevin Kraus', 65689: 'Kevin Kraus',
};

async function readFromCache(month) {
  try {
    const resp = await fetch(
      `${SU}/rest/v1/challenge_cache?month=eq.${month}&select=data,cached_at`,
      { headers: hd() }
    );
    if (!resp.ok) return null;
    const rows = await resp.json();
    if (!rows || rows.length === 0) return null;
    const row = rows[0];
    const age = Date.now() - new Date(row.cached_at).getTime();
    if (age > CACHE_MAX_AGE_MS) return null;
    return row.data;
  } catch { return null; }
}

async function writeToCache(month, data) {
  try {
    await fetch(`${SU}/rest/v1/challenge_cache`, {
      method: 'POST',
      headers: { ...hd(), 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({ month, data, cached_at: new Date().toISOString(), source: 'live-fallback' })
    });
  } catch (e) { console.warn('Cache write failed:', e.message); }
}

function computeLive(leads, month) {
  const [yr, mo] = month.split('-').map(Number);
  const startDate = `${yr}-${String(mo).padStart(2, '0')}-01`;
  const endMo = mo === 12 ? 1 : mo + 1;
  const endYr = mo === 12 ? yr + 1 : yr;
  const endDate = `${endYr}-${String(endMo).padStart(2, '0')}-01`;

  const monthLeads = leads.filter(l => {
    const imp = (l.importiert || '').substring(0, 10);
    return imp >= startDate && imp < endDate;
  });
  const qualifying = monthLeads.filter(l => {
    const src = (l.quelle || '').trim();
    return src === 'Eigenlead' || src === 'Empfehlung';
  });

  const byBerater = {};
  qualifying.forEach(l => {
    let name = (l.berater || '').trim();
    if (!name && BERATER_OVERRIDES[l.id]) name = BERATER_OVERRIDES[l.id];
    if (!name) name = '(kein Berater)';
    if (!byBerater[name]) byBerater[name] = { el: 0, emp: 0, total: 0 };
    if ((l.quelle || '').trim() === 'Eigenlead') byBerater[name].el++;
    else byBerater[name].emp++;
    byBerater[name].total++;
  });

  const sources = {};
  monthLeads.forEach(l => { const s = (l.quelle || '(leer)').trim(); sources[s] = (sources[s] || 0) + 1; });
  const statusBreakdown = {};
  qualifying.forEach(l => { const st = (l.leadstatus || '(kein Status)').trim(); statusBreakdown[st] = (statusBreakdown[st] || 0) + 1; });

  const recentLeads = qualifying
    .map(l => ({
      name: `${(l.vorname || '').trim()} ${(l.nachname || '').trim()}`.trim() || 'Unbekannt',
      berater: (l.berater || '').trim() || BERATER_OVERRIDES[l.id] || '?',
      source: (l.quelle || '').trim(), status: (l.leadstatus || '').trim(),
      date: l.importiert || '', city: (l.stadt || '').trim()
    }))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 8);

  const byDay = {};
  qualifying.forEach(l => { const d = (l.importiert || '').substring(0, 10); if (d) byDay[d] = (byDay[d] || 0) + 1; });

  const persons = Object.entries(byBerater)
    .map(([n, v]) => ({ n, el: v.el, emp: v.emp, total: v.total }))
    .sort((a, b) => b.total - a.total);

  return {
    month, total: qualifying.length, totalAllElEmp: qualifying.length,
    allLeadsCount: monthLeads.length, byPerson: persons,
    sources, statusBreakdown, recentLeads, byDay,
    fetchedAt: new Date().toISOString(), _source: 'live-fallback',
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const month = req.query.month || '';
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'Missing or invalid ?month=YYYY-MM parameter' });
  }

  const t0 = Date.now();

  // 1. Cache lesen
  const cached = await readFromCache(month);
  if (cached) {
    console.log(`[challenge-leads] Cache HIT ${month} in ${Date.now() - t0}ms`);
    return res.status(200).json({ ...cached, _servedFromCache: true, _cacheReadMs: Date.now() - t0 });
  }

  // 2. Live-Fallback
  console.log(`[challenge-leads] Cache MISS ${month} → live fetch`);
  try {
    const authResp = await fetch(`${LEVETO}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'username=api%40bee-doo.de&password=Patrick123456789%21'
    });
    const authData = await authResp.json();
    if (!authData.token) return res.status(401).json({ error: 'Leveto auth failed' });

    const tFetch = Date.now();
    const ovRes = await fetch(`${LEVETO}/overview`, {
      headers: { 'Authorization': `Bearer ${authData.token}` }
    });
    if (!ovRes.ok) return res.status(ovRes.status).json({ error: `Overview HTTP ${ovRes.status}` });
    const ovData = await ovRes.json();
    const leads = Array.isArray(ovData) ? ovData : (ovData.data || []);
    const fetchMs = Date.now() - tFetch;

    const result = computeLive(leads, month);
    result._fetchMs = fetchMs;
    writeToCache(month, result); // async, kein await

    return res.status(200).json({ ...result, _servedFromCache: false });

  } catch (err) {
    console.error('Challenge leads live error:', err);
    return res.status(502).json({ error: 'Failed to fetch from Leveto Overview', details: err.message });
  }
}
