// api/challenge-leads.js — Challenge 1000er: Eigenleads + Empfehlungen from Leveto API
// Returns aggregated lead counts per berater for a given month
// Usage: GET /api/challenge-leads?month=2026-03

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

    // 2. Parse month range
    const [yr, mo] = month.split('-').map(Number);
    const startDate = `${yr}-${String(mo).padStart(2, '0')}-01`;
    const endMo = mo === 12 ? 1 : mo + 1;
    const endYr = mo === 12 ? yr + 1 : yr;
    const endDate = `${endYr}-${String(endMo).padStart(2, '0')}-01`;
    // createdTo is inclusive in Leveto, so use last day of month
    const lastDay = new Date(endYr, endMo === 1 ? 0 : endMo - 1, 0).getDate();
    const createdTo = `${yr}-${String(mo).padStart(2, '0')}-${lastDay}`;

    // 3. Fetch ALL leads for the month (paginated)
    let allLeads = [];
    let page = 1;
    let totalPages = 999;

    while (page <= totalPages) {
      const url = `${LEVETO}/leads?limit=50&createdFrom=${startDate}&createdTo=${createdTo}&page=${page}`;
      const resp = await fetch(url, { headers: authHeader });
      const data = await resp.json();
      totalPages = data.totalpages || 0;
      const leads = data.leads || [];
      allLeads = allLeads.concat(leads);
      page++;
      // Safety: max 100 pages
      if (page > 100) break;
    }

    // 4. Filter Eigenlead + Empfehlung
    const qualifying = allLeads.filter(l => {
      const src = (l.source || '').trim();
      return src === 'Eigenlead' || src === 'Empfehlung';
    });

    // 5. Group by berater
    // Manual overrides: Leads ohne Berater die wir zuordnen können
    const BERATER_OVERRIDES = {
      65347: 'Kevin Kraus', // Brigitte Priem – gleicher Abend+Gebiet wie Kevin's andere ELs
      65348: 'Kevin Kraus', // Vivien Schmidt
      65349: 'Kevin Kraus', // Familie Marcinowski
      65354: 'Kevin Kraus', // Familie Bajrami
      65355: 'Kevin Kraus', // Gertrud Bank
    };

    const byBerater = {};
    qualifying.forEach(l => {
      let name = (l.berater || l.responsiblePerson || '').trim();
      // Apply manual override if no berater assigned
      if (!name && BERATER_OVERRIDES[l.id]) {
        name = BERATER_OVERRIDES[l.id];
      }
      if (!name) name = '(kein Berater)';
      if (!byBerater[name]) byBerater[name] = { el: 0, emp: 0, total: 0 };
      if ((l.source || '').trim() === 'Eigenlead') byBerater[name].el++;
      else byBerater[name].emp++;
      byBerater[name].total++;
    });

    // 6. Count all leads per berater (for context)
    const allByBerater = {};
    allLeads.forEach(l => {
      const name = (l.berater || l.responsiblePerson || '(kein Berater)').trim();
      allByBerater[name] = (allByBerater[name] || 0) + 1;
    });

    // 7. Count all sources (for debugging)
    const sources = {};
    allLeads.forEach(l => {
      const s = (l.source || '(leer)').trim();
      sources[s] = (sources[s] || 0) + 1;
    });

    // 8. Build response
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
      allLeadsCount: allLeads.length,
      byPerson: persons,
      sources,
      fetchedAt: new Date().toISOString()
    });

  } catch (err) {
    console.error('Challenge leads error:', err);
    return res.status(502).json({ error: 'Failed to fetch from Leveto', details: err.message });
  }
}
