// api/overview-march.js — Lädt Verträge direkt via /contracts (gefiltert nach Monat)
// Vorher: /overview → 53.000 Leads → 30s+
// Jetzt:  /contracts?accepteddate_start=... → ~50 Verträge → ~1s

export const config = { maxDuration: 15 };

const LEVETO_BASE = 'https://beedoo.leveto.net/API';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const targetMonth = req.query.month || new Date().toISOString().slice(0, 7);
  const [yr, mo] = targetMonth.split('-');
  const nextMo = parseInt(mo) === 12 ? '01' : String(parseInt(mo) + 1).padStart(2, '0');
  const nextYr = parseInt(mo) === 12 ? String(parseInt(yr) + 1) : yr;
  const dateFrom = `${yr}-${mo}-01`;
  const dateTo   = `${nextYr}-${nextMo}-01`;

  try {
    // 1. AUTH
    const authRes = await fetch(`${LEVETO_BASE}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `username=${encodeURIComponent(process.env.LEVETO_USER || 'api@bee-doo.de')}&password=${encodeURIComponent(process.env.LEVETO_PASS || '')}`
    });
    const authData = await authRes.json();
    if (!authData.token) return res.status(401).json({ error: 'Leveto auth failed' });
    const authHeader = { 'Authorization': `Bearer ${authData.token}` };

    // 2. FETCH CONTRACTS — direkt gefiltert, kein Overview-Overhead
    const t0 = Date.now();
    const contractRes = await fetch(
      `${LEVETO_BASE}/contracts?limit=500&accepteddate_start=${dateFrom}&status=Angenommen`,
      { headers: authHeader }
    );
    if (!contractRes.ok) return res.status(contractRes.status).json({ error: `Contracts HTTP ${contractRes.status}` });
    const contractData = await contractRes.json();
    const allContracts = Array.isArray(contractData) ? contractData : (contractData.data || []);
    const fetchMs = Date.now() - t0;

    // 3. FILTER auf Zielmonat (accepted_date >= dateFrom && < dateTo)
    const contracts = allContracts.filter(c => {
      const ad = (c.accepted_date || '').slice(0, 10);
      return ad >= dateFrom && ad < dateTo;
    });

    // 4. MAP auf internes Format (kompatibel mit loadMarch in vt-ranking.html)
    const mapped = contracts.map(c => ({
      contract_id: c.id,
      lead_id:     c.leadID,
      berater:     c.berater || c.ersteller || '',
      ersteller:   c.ersteller || '',
      accepted_date: (c.accepted_date || '').slice(0, 10),
      netto:        parseFloat(c.calculated_realprice_netto) || 0,
      brutto:       parseFloat(c.calculated_realprice_brutto) || 0,
      auftragsstatus: c.status_kunde || 'Angenommen',
      quelle:       c.quelle || '',
      typeicons:    c.typeicons || [],
      kwp_real:     0, // nicht im contracts-Endpoint verfügbar
      storno_date:  c.storno_date || null,
    }));

    return res.status(200).json({
      contracts: mapped,
      total: mapped.length,
      month: targetMonth,
      _fetchMs: fetchMs,
      _source: 'leveto-contracts-direct',
    });

  } catch (err) {
    console.error('[overview-march] Error:', err);
    return res.status(502).json({ error: 'Failed to fetch contracts', details: err.message });
  }
}
