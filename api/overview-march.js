// api/overview-march.js — Fetches Leveto Overview server-side,
// extracts only target month contracts, returns filtered + enriched data.
// This avoids CORS and timeout issues from loading 53k leads in browser.

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const LEVETO_BASE = 'https://beedoo.leveto.net/API';
  const LEVETO_USER = 'api@bee-doo.de';
  const LEVETO_PW = 'Patrick123456789!';

  // Optional: ?month=2026-03 (default current month)
  const targetMonth = req.query.month || new Date().toISOString().slice(0, 7);

  try {
    // 1. AUTH
    const authRes = await fetch(`${LEVETO_BASE}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: LEVETO_USER, password: LEVETO_PW }).toString()
    });
    const authData = await authRes.json();
    if (!authData.token) {
      return res.status(401).json({ error: 'Auth failed', details: authData });
    }

    // 2. FETCH OVERVIEW
    const t0 = Date.now();
    const ovRes = await fetch(`${LEVETO_BASE}/overview`, {
      headers: { 'Authorization': `Bearer ${authData.token}` }
    });
    if (!ovRes.ok) {
      return res.status(ovRes.status).json({ error: `Overview HTTP ${ovRes.status}` });
    }
    const ovData = await ovRes.json();
    const fetchMs = Date.now() - t0;

    // 3. FIND LEADS ARRAY
    let leads = [];
    if (Array.isArray(ovData)) {
      leads = ovData;
    } else {
      for (const key of Object.keys(ovData)) {
        if (Array.isArray(ovData[key]) && ovData[key].length > 100) {
          leads = ovData[key];
          break;
        }
      }
    }

    // 4. EXTRACT CONTRACTS FOR TARGET MONTH
    const contracts = [];
    let totalLeads = leads.length;
    let totalContracts = 0;
    let leadsWithContracts = 0;

    for (const lead of leads) {
      const lc = lead.contracts || [];
      if (!Array.isArray(lc)) continue;
      totalContracts += lc.length;
      if (lc.length > 0) leadsWithContracts++;

      for (const c of lc) {
        const ad = c.accepted_date || c.acceptedDate || '';
        if (!ad.startsWith(targetMonth)) continue;

        // Calc kWp from products (amount × watt / 1000)
        let kwp = 0;
        let moduleCount = 0;
        let moduleType = '';
        let speicherKwh = 0;
        let speicherCount = 0;
        let speicherNames = [];

        if (Array.isArray(c.products)) {
          for (const p of c.products) {
            const watt = parseFloat(p.watt) || 0;
            const amount = parseFloat(p.amount) || 0;
            const battery = parseFloat(p.battery) || 0;
            if (watt > 0 && amount > 0) {
              kwp += (amount * watt) / 1000;
              moduleCount += Math.round(amount);
              if (!moduleType) moduleType = p.productname || '';
            }
            if (battery > 0) {
              speicherKwh += battery * (amount || 1);
              speicherCount++;
              speicherNames.push(p.productname || '');
            }
          }
        }

        contracts.push({
          contract_id: c.id || null,
          lead_id: lead.id,
          lead_name: `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
          ersteller: c.ersteller || c.creator || '',
          berater: c.berater || lead.berater || '',
          accepted_date: ad,
          netto: parseFloat(c.an_netto || c.calculated_realprice_netto || 0),
          brutto: parseFloat(c.an_brutto || c.calculated_realprice_brutto || 0),
          status_kunde: c.status_kunde || '',
          storno: c.storno === true || c.storno === 1 || c.storno === '1' || (c.status_kunde || '') === 'Storniert',
          quelle: c.quelle || c.source || lead.source || '',
          typeicons: c.typeicons || null,
          kwp_real: Math.round(kwp * 100) / 100,
          module_count: moduleCount,
          module_type: moduleType,
          speicher_kwh: Math.round(speicherKwh * 10) / 10,
          speicher_count: speicherCount,
          speicher_names: speicherNames.join(', '),
          mvp_id: c.mvp_id || lead.mvp_id || '',
          mvp_name: c.mvp_nummer || lead.mvp_nummer || '',
          efs_prozent: c.efs_prozent || null,
          // Include raw product data for debugging
          products: c.products || []
        });
      }
    }

    // 5. RETURN
    return res.status(200).json({
      month: targetMonth,
      fetchMs,
      totalLeads,
      totalContracts,
      leadsWithContracts,
      filteredContracts: contracts.length,
      contracts,
      // Log which fields exist in first contract for debugging
      sampleFields: contracts.length > 0
        ? Object.keys(contracts[0]).filter(k => k !== 'products')
        : []
    });

  } catch (err) {
    console.error('overview-march error:', err);
    return res.status(500).json({ error: err.message });
  }
}
