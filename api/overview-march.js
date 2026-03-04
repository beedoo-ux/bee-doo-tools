// api/overview-march.js — Fetches Leveto Overview server-side,
// extracts only target month contracts, returns filtered + enriched data.
// Fixes: contracts/appointments are JSON STRINGS, field is "creator" not "ersteller",
// quelle is on Lead level, netto = an_netto, storno not yet available (XXX).

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const LEVETO_BASE = 'https://beedoo.leveto.net/API';
  const LEVETO_USER = 'api@bee-doo.de';
  const LEVETO_PW = 'Patrick123456789!';
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

    // 3. FIND LEADS — response is { data: [...] }
    let leads = [];
    if (Array.isArray(ovData)) {
      leads = ovData;
    } else if (ovData.data && Array.isArray(ovData.data)) {
      leads = ovData.data;
    } else {
      for (const key of Object.keys(ovData)) {
        if (Array.isArray(ovData[key]) && ovData[key].length > 100) {
          leads = ovData[key];
          break;
        }
      }
    }

    // 4. EXTRACT CONTRACTS FOR TARGET MONTH
    // CRITICAL: contracts + appointments come as JSON STRINGS!
    const contracts = [];
    let totalLeads = leads.length;
    let totalContracts = 0;
    let leadsWithContracts = 0;

    for (const lead of leads) {
      let lc = lead.contracts || '[]';
      if (typeof lc === 'string') {
        try { lc = JSON.parse(lc); } catch(e) { lc = []; }
      }
      if (!Array.isArray(lc) || !lc.length) continue;

      totalContracts += lc.length;
      leadsWithContracts++;

      for (const c of lc) {
        const ad = c.accepted_date || '';
        if (!ad.startsWith(targetMonth)) continue;

        // Products may also be a JSON string
        let prods = c.products || [];
        if (typeof prods === 'string') {
          try { prods = JSON.parse(prods); } catch(e) { prods = []; }
        }

        // Calc kWp from products
        let kwp = 0, moduleCount = 0, moduleType = '';
        let speicherKwh = 0, speicherCount = 0, speicherNames = [];

        if (Array.isArray(prods)) {
          for (const p of prods) {
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

        // typeicons may be string or array
        let typeicons = c.typeicons || [];
        if (typeof typeicons === 'string') {
          try { typeicons = JSON.parse(typeicons); } catch(e) { }
        }

        contracts.push({
          contract_id: c.id || null,
          lead_id: lead.id,
          lead_name: `${lead.vorname || ''} ${lead.nachname || ''}`.trim(),
          // creator = Ersteller (Overview field name)
          ersteller: c.creator || '',
          ersteller_ma: c.creator_ma_number || '',
          // berater is on LEAD level
          berater: lead.berater || '',
          berater_ma: lead.berater_ma_nummer || '',
          accepted_date: ad,
          an_nummer: c.dyn_offernum || '',
          // an_netto (not calculated_realprice_netto)
          netto: parseFloat(c.an_netto || 0),
          brutto: parseFloat(c.an_brutto || 0),
          // storno: auftragsstatus still XXX — not detectable yet
          auftragsstatus: c.auftragsstatus || '',
          storno: false,
          // quelle is on LEAD level
          quelle: lead.quelle || '',
          typeicons,
          kwp_real: Math.round(kwp * 100) / 100,
          module_count: moduleCount,
          module_type: moduleType,
          speicher_kwh: Math.round(speicherKwh * 10) / 10,
          speicher_count: speicherCount,
          speicher_names: speicherNames.join(', '),
          mvp_id: lead.mvp_id || '',
          mvp_name: lead.mvp_nummer || '',
          efs_prozent: c.efs_prozent || null,
          products: prods
        });
      }
    }

    return res.status(200).json({
      month: targetMonth,
      fetchMs,
      totalLeads,
      totalContracts,
      leadsWithContracts,
      filteredContracts: contracts.length,
      contracts,
      _fieldMapping: {
        ersteller: 'contract.creator',
        berater: 'lead.berater',
        quelle: 'lead.quelle',
        netto: 'contract.an_netto',
        storno: 'NOT YET (auftragsstatus=XXX)',
        kwp: 'products: amount*watt/1000',
        speicher: 'products: battery>0',
        wp: 'typeicons: fa-fire',
        scout: 'lead.mvp_id + lead.mvp_nummer'
      }
    });

  } catch (err) {
    console.error('overview-march error:', err);
    return res.status(500).json({ error: err.message });
  }
}
