// api/cron-challenge.js — Stündlicher Cache-Job für Challenge 1000
// Vercel Cron: jede Stunde → 0 * * * *
// Holt Leveto Overview einmal, cached Ergebnisse für aktive Monate in Supabase

export const config = { maxDuration: 60 };

const SU = 'https://hqzpemfaljxcysyqssng.supabase.co';
const SK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxenBlbWZhbGp4Y3lzeXFzc25nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTMzNTM5NywiZXhwIjoyMDg2OTExMzk3fQ.MJ3cyAAquE8DK2ngzfIIn4bTpQ8_H9DaeJ3YTlBdFz4';
const LEVETO = 'https://beedoo.leveto.net/API';
const hd = () => ({ apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' });

const BERATER_OVERRIDES = {
  65347: 'Kevin Kraus', 65348: 'Kevin Kraus', 65349: 'Kevin Kraus',
  65354: 'Kevin Kraus', 65355: 'Kevin Kraus', 65687: 'Kevin Kraus', 65689: 'Kevin Kraus',
};

function getActiveMonths() {
  const now = new Date();
  const curr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
  return [curr, prevKey];
}

function computeChallengeData(leads, month) {
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
      source: (l.quelle || '').trim(),
      status: (l.leadstatus || '').trim(),
      date: l.importiert || '',
      city: (l.stadt || '').trim()
    }))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 8);

  const byDay = {};
  qualifying.forEach(l => { const d = (l.importiert || '').substring(0, 10); if (d) byDay[d] = (byDay[d] || 0) + 1; });

  const persons = Object.entries(byBerater)
    .map(([n, v]) => ({ n, el: v.el, emp: v.emp, total: v.total }))
    .sort((a, b) => b.total - a.total);

  return {
    month, total: qualifying.length, totalAllElEmp: qualifying.length,
    allLeadsCount: monthLeads.length, byPerson: persons,
    sources, statusBreakdown, recentLeads, byDay,
    fetchedAt: new Date().toISOString(), _source: 'cron',
  };
}

async function writeToCache(month, data) {
  const resp = await fetch(`${SU}/rest/v1/challenge_cache`, {
    method: 'POST',
    headers: { ...hd(), 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({ month, data, cached_at: new Date().toISOString(), source: 'cron' })
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Supabase write failed: ${resp.status} ${txt}`);
  }
  return true;
}

export default async function handler(req, res) {
  const t0 = Date.now();
  const months = getActiveMonths();
  const results = [];

  try {
    const authResp = await fetch(`${LEVETO}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'username=api%40bee-doo.de&password=Patrick123456789%21'
    });
    const authData = await authResp.json();
    if (!authData.token) throw new Error('Leveto auth failed');

    const ovRes = await fetch(`${LEVETO}/overview`, {
      headers: { 'Authorization': `Bearer ${authData.token}` }
    });
    if (!ovRes.ok) throw new Error(`Overview HTTP ${ovRes.status}`);
    const ovData = await ovRes.json();
    const leads = Array.isArray(ovData) ? ovData : (ovData.data || []);
    const fetchMs = Date.now() - t0;

    for (const month of months) {
      const data = computeChallengeData(leads, month);
      data._fetchMs = fetchMs;
      await writeToCache(month, data);
      results.push({ month, total: data.total, cached: true });
    }

    console.log(`[cron-challenge] OK in ${Date.now() - t0}ms`, results);
    return res.status(200).json({ success: true, fetchMs, totalMs: Date.now() - t0, months: results });

  } catch (err) {
    console.error('[cron-challenge] ERROR:', err.message);
    return res.status(500).json({ error: err.message, results });
  }
}
