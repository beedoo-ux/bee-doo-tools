// api/challenge-leads.js — Challenge 1000er: Eigenleads + Empfehlungen from Leveto API
// Returns aggregated lead counts per berater for a given month
// Usage: GET /api/challenge-leads?month=2026-03
//
// Zähllogik: Leads mit Quelle Eigenlead/Empfehlung + Status "Terminiert" oder "Neuer Lead"
// Nur createdFrom wird verwendet (kein createdTo) – damit kommen alle Leads des Monats zurück.

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

  // Statuses that count for the challenge
  const QUALIFYING_STATUSES = ['Terminiert', 'Neuer Lead'];

  try {
    // 1. Authenticate
    const authResp = await fetch(`${LEVETO}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'username=api%40bee-doo.de&password=Patrick123456789%21'
    });
    const authData = await authResp.json();
    if (!authData.token) {
      return res.status(401).json({ error: 'Leveto auth failed', details: authData });
    }
    const token = authData.token;
    const authHeader = { 'Authorization': `Bearer ${token}` };

    // 2. Parse month – only startDate needed (createdTo causes Leveto to miss leads)
    const [yr, mo] = month.split('-').map(Number);
    const startDate = `${yr}-${String(mo).padStart(2, '0')}-01`;

    // 3. Fetch ALL leads for the month (paginated, only createdFrom)
    let allLeads = [];
    let page = 1;
    let totalPages = 999;

    while (page <= totalPages) {
      const url = `${LEVETO}/leads?limit=50&createdFrom=${startDate}&page=${page}`;
      const resp = await fetch(url, { headers: authHeader });
      const data = await resp.json();
      totalPages = data.totalpages || 0;
      const leads = data.leads || [];
      allLeads = allLeads.concat(leads);
      page++;
      if (page > 100) break;
    }

    // 4. Filter to current month only (createdOn >= startDate and < next month)
    const endMo = mo === 12 ? 1 : mo + 1;
    const endYr = mo === 12 ? yr + 1 : yr;
    const endDate = `${endYr}-${String(endMo).padStart(2, '0')}-01`;
    const monthLeads = allLeads.filter(l => {
      const created = (l.createdOn || '').substring(0, 10);
      return created >= startDate && created < endDate;
    });

    // 5. Filter Eigenlead + Empfehlung with qualifying status (Terminiert oder Neuer Lead)
    const qualifying = monthLeads.filter(l => {
      const src = (l.source || '').trim();
      const status = (typeof l.status === 'object' && l.status ? l.status.name : '') || '';
      return (src === 'Eigenlead' || src === 'Empfehlung')
        && QUALIFYING_STATUSES.includes(status.trim());
    });

    // 6. Also count all EL/Emp regardless of status (for reference)
    const allElEmp = monthLeads.filter(l => {
      const src = (l.source || '').trim();
      return src === 'Eigenlead' || src === 'Empfehlung';
    });

    // 7. Manual overrides: Leads ohne Berater
    const BERATER_OVERRIDES = {
      65347: 'Kevin Kraus', // Brigitte Priem
      65348: 'Kevin Kraus', // Vivien Schmidt
      65349: 'Kevin Kraus', // Familie Marcinowski
      65354: 'Kevin Kraus', // Familie Bajrami
      65355: 'Kevin Kraus', // Gertrud Bank
    };

    // 8. Group qualifying leads by berater
    const byBerater = {};
    qualifying.forEach(l => {
      let name = (l.berater || l.responsiblePerson || '').trim();
      if (!name && BERATER_OVERRIDES[l.id]) name = BERATER_OVERRIDES[l.id];
      if (!name) name = '(kein Berater)';
      if (!byBerater[name]) byBerater[name] = { el: 0, emp: 0, total: 0 };
      if ((l.source || '').trim() === 'Eigenlead') byBerater[name].el++;
      else byBerater[name].emp++;
      byBerater[name].total++;
    });

    // 9. Count all leads per berater (for context)
    const allByBerater = {};
    monthLeads.forEach(l => {
      const name = (l.berater || l.responsiblePerson || '(kein Berater)').trim();
      allByBerater[name] = (allByBerater[name] || 0) + 1;
    });

    // 10. Count all sources (for debugging)
    const sources = {};
    monthLeads.forEach(l => {
      const s = (l.source || '(leer)').trim();
      sources[s] = (sources[s] || 0) + 1;
    });

    // 11. Status breakdown for all EL/Emp (for transparency)
    const statusBreakdown = {};
    allElEmp.forEach(l => {
      const st = (typeof l.status === 'object' && l.status ? l.status.name : '') || '(kein Status)';
      statusBreakdown[st] = (statusBreakdown[st] || 0) + 1;
    });

    // 12. Recent qualifying leads (for live ticker)
    const recentLeads = qualifying
      .map(l => ({
        name: `${(l.firstName || '').trim()} ${(l.lastName || '').trim()}`.trim() || 'Unbekannt',
        berater: (l.berater || l.responsiblePerson || '').trim() || BERATER_OVERRIDES[l.id] || '?',
        source: (l.source || '').trim(),
        status: (typeof l.status === 'object' && l.status ? l.status.name : '') || '',
        date: l.createdOn || '',
        city: (l.city || '').trim()
      }))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 8);

    // 13. Group by day for daily chart
    const byDay = {};
    qualifying.forEach(l => {
      const d = (l.createdOn || '').substring(0, 10);
      if (d) byDay[d] = (byDay[d] || 0) + 1;
    });

    // 14. Build response
    const persons = Object.entries(byBerater)
      .map(([n, v]) => ({
        n,
        el: v.el,
        emp: v.emp,
        total: v.total,
        allLeads: allByBerater[n] || 0
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
      fetchedAt: new Date().toISOString()
    });

  } catch (err) {
    console.error('Challenge leads error:', err);
    return res.status(502).json({ error: 'Failed to fetch from Leveto', details: err.message });
  }
}
