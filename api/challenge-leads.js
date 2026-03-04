// api/challenge-leads.js — Challenge 1000er: Eigenleads + Empfehlungen
// NOW USES: Leveto Overview API (single request, all leads)
// OLD: Leveto Leads API (paginated, 50/page, many requests)
// Usage: GET /api/challenge-leads?month=2026-03

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const month = req.query.month || '';
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'Missing or invalid ?month=YYYY-MM parameter' });
  }

  const LEVETO = 'https://beedoo.leveto.net/API';
  const QUALIFYING_STATUSES = ['Terminiert', 'Neuer Lead'];

  try {
    // 1. Auth
    const authResp = await fetch(`${LEVETO}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'username=api%40bee-doo.de&password=Patrick123456789%21'
    });
    const authData = await authResp.json();
    if (!authData.token) {
      return res.status(401).json({ error: 'Leveto auth failed', details: authData });
    }

    // 2. Fetch Overview (single request, ~2s, all leads)
    const t0 = Date.now();
    const ovRes = await fetch(`${LEVETO}/overview`, {
      headers: { 'Authorization': `Bearer ${authData.token}` }
    });
    if (!ovRes.ok) return res.status(ovRes.status).json({ error: `Overview HTTP ${ovRes.status}` });
    const ovData = await ovRes.json();
    const fetchMs = Date.now() - t0;

    const leads = Array.isArray(ovData) ? ovData : (ovData.data || []);

    // 3. Filter to target month (using importiert field)
    const [yr, mo] = month.split('-').map(Number);
    const startDate = `${yr}-${String(mo).padStart(2, '0')}-01`;
    const endMo = mo === 12 ? 1 : mo + 1;
    const endYr = mo === 12 ? yr + 1 : yr;
    const endDate = `${endYr}-${String(endMo).padStart(2, '0')}-01`;

    const monthLeads = leads.filter(l => {
      const imp = (l.importiert || '').substring(0, 10);
      return imp >= startDate && imp < endDate;
    });

    // 4. Filter Eigenlead + Empfehlung (ALL count, no status filter)
    const qualifying = monthLeads.filter(l => {
      const src = (l.quelle || '').trim();
      return src === 'Eigenlead' || src === 'Empfehlung';
    });

    // 5. All EL/Emp regardless of status (for reference)
    const allElEmp = monthLeads.filter(l => {
      const src = (l.quelle || '').trim();
      return src === 'Eigenlead' || src === 'Empfehlung';
    });

    // 6. Manual overrides: Leads ohne Berater
    const BERATER_OVERRIDES = {
      65347: 'Kevin Kraus',
      65348: 'Kevin Kraus',
      65349: 'Kevin Kraus',
      65354: 'Kevin Kraus',
      65355: 'Kevin Kraus',
    };

    // 7. Group qualifying leads by berater
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

    // 8. Sources breakdown (debugging)
    const sources = {};
    monthLeads.forEach(l => {
      const s = (l.quelle || '(leer)').trim();
      sources[s] = (sources[s] || 0) + 1;
    });

    // 9. Status breakdown for EL/Emp
    const statusBreakdown = {};
    allElEmp.forEach(l => {
      const st = (l.leadstatus || '(kein Status)').trim();
      statusBreakdown[st] = (statusBreakdown[st] || 0) + 1;
    });

    // 10. Recent qualifying leads (for live ticker)
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

    // 11. Group by day for daily chart
    const byDay = {};
    qualifying.forEach(l => {
      const d = (l.importiert || '').substring(0, 10);
      if (d) byDay[d] = (byDay[d] || 0) + 1;
    });

    // 12. Build response (same format as before)
    const persons = Object.entries(byBerater)
      .map(([n, v]) => ({
        n,
        el: v.el,
        emp: v.emp,
        total: v.total
      }))
      .sort((a, b) => b.total - a.total);

    return res.status(200).json({
      month,
      total: qualifying.length,
      totalAllElEmp: allElEmp.length,
      allLeadsCount: monthLeads.length,
      byPerson: persons,
      sources,
      statusBreakdown,
      recentLeads,
      byDay,
      fetchedAt: new Date().toISOString(),
      _source: 'overview-api',
      _fetchMs: fetchMs
    });

  } catch (err) {
    console.error('Challenge leads error:', err);
    return res.status(502).json({ error: 'Failed to fetch from Leveto Overview', details: err.message });
  }
}
