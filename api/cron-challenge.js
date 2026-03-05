// api/cron-challenge.js — Stündlicher Cache-Job für Challenge 1000
// Vercel Cron: jede Stunde → 0 * * * *
// Liest aus Supabase leveto_leads (bereits via overview-sync aktuell) statt Leveto API direkt
// → kein Timeout mehr, keine doppelte API-Last

export const config = { maxDuration: 30 };

const SU = 'https://hqzpemfaljxcysyqssng.supabase.co';
const SK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxenBlbWZhbGp4Y3lzeXFzc25nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTMzNTM5NywiZXhwIjoyMDg2OTExMzk3fQ.MJ3cyAAquE8DK2ngzfIIn4bTpQ8_H9DaeJ3YTlBdFz4';
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

async function fetchLeadsFromSupabase(startDate, endDate) {
  // Only fetch Eigenlead + Empfehlung in the date range — way faster than full overview
  const allLeads = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const params = new URLSearchParams({
      select: 'leveto_id,vorname,nachname,quelle,berater_name,status_name,leveto_importiert_am,ort',
      'quelle': 'in.(Eigenlead,Empfehlung)',
      'leveto_importiert_am': `gte.${startDate}`,
      order: 'leveto_importiert_am.desc',
      offset: String(offset),
      limit: String(limit),
    });

    const r = await fetch(`${SU}/rest/v1/leveto_leads?${params}`, { headers: hd() });
    if (!r.ok) throw new Error(`Supabase fetch error: ${r.status}`);
    const batch = await r.json();
    allLeads.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }

  return allLeads;
}

function computeChallengeData(leads, month) {
  const [yr, mo] = month.split('-').map(Number);
  const startDate = `${yr}-${String(mo).padStart(2, '0')}-01`;
  const endMo = mo === 12 ? 1 : mo + 1;
  const endYr = mo === 12 ? yr + 1 : yr;
  const endDate = `${endYr}-${String(endMo).padStart(2, '0')}-01`;

  const qualifying = leads.filter(l => {
    const imp = (l.leveto_importiert_am || '').substring(0, 10);
    return imp >= startDate && imp < endDate;
  });

  // Only count Terminiert + Neuer Lead
  const counted = qualifying.filter(l => {
    const st = (l.status_name || '').trim();
    return st === 'Terminiert' || st === 'Neuer Lead';
  });

  const byBerater = {};
  counted.forEach(l => {
    let name = (l.berater_name || '').trim();
    if (!name && BERATER_OVERRIDES[l.leveto_id]) name = BERATER_OVERRIDES[l.leveto_id];
    if (!name) name = '(kein Berater)';
    if (!byBerater[name]) byBerater[name] = { el: 0, emp: 0, total: 0 };
    if ((l.quelle || '').trim() === 'Eigenlead') byBerater[name].el++;
    else byBerater[name].emp++;
    byBerater[name].total++;
  });

  const statusBreakdown = {};
  qualifying.forEach(l => {
    const st = (l.status_name || '(kein Status)').trim();
    statusBreakdown[st] = (statusBreakdown[st] || 0) + 1;
  });

  const recentLeads = counted
    .map(l => ({
      name: `${(l.vorname || '').trim()} ${(l.nachname || '').trim()}`.trim() || 'Unbekannt',
      berater: (l.berater_name || '').trim() || BERATER_OVERRIDES[l.leveto_id] || '?',
      source: (l.quelle || '').trim(),
      status: (l.status_name || '').trim(),
      date: l.leveto_importiert_am || '',
      city: (l.ort || '').trim()
    }))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 8);

  const byDay = {};
  counted.forEach(l => {
    const d = (l.leveto_importiert_am || '').substring(0, 10);
    if (d) byDay[d] = (byDay[d] || 0) + 1;
  });

  const persons = Object.entries(byBerater)
    .map(([n, v]) => ({ n, el: v.el, emp: v.emp, total: v.total }))
    .sort((a, b) => b.total - a.total);

  return {
    month, total: counted.length, totalAllElEmp: qualifying.length,
    allLeadsCount: qualifying.length, byPerson: persons,
    statusBreakdown, recentLeads, byDay,
    fetchedAt: new Date().toISOString(), _source: 'cron-supabase',
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
}

export default async function handler(req, res) {
  const t0 = Date.now();
  const months = getActiveMonths();
  const results = [];

  try {
    // Calculate date range: prev month start to now
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const startDate = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-01`;

    // Fetch only Eigenlead+Empfehlung from Supabase (already synced by overview-sync)
    const leads = await fetchLeadsFromSupabase(startDate);
    const fetchMs = Date.now() - t0;

    for (const month of months) {
      const data = computeChallengeData(leads, month);
      data._fetchMs = fetchMs;
      await writeToCache(month, data);
      results.push({ month, total: data.total, qualifying: data.totalAllElEmp, cached: true });
    }

    console.log(`[cron-challenge] OK in ${Date.now() - t0}ms`, results);
    return res.status(200).json({ success: true, fetchMs, totalMs: Date.now() - t0, months: results });

  } catch (err) {
    console.error('[cron-challenge] ERROR:', err.message);
    return res.status(500).json({ error: err.message, results });
  }
}
