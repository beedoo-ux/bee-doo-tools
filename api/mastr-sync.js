// Vercel Serverless Function: MaStR NRW Solar Sync
// Processes 1 page per invocation. Set up Vercel Cron to call every 60s.
// Full sync: 213 pages × 60s = ~3.5 hours

const SB_URL = 'https://hqzpemfaljxcysyqssng.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxenBlbWZhbGp4Y3lzeXFzc25nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTMzNTM5NywiZXhwIjoyMDg2OTExMzk3fQ.MJ3cyAAquE8DK2ngzfIIn4bTpQ8_H9DaeJ3YTlBdFz4';
const SB_HEADERS = {
  'apikey': SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json'
};

const MASTR_URL = 'https://www.marktstammdatenregister.de/MaStR/Einheit/EinheitJson/GetErweiterteOeffentlicheEinheitStromerzeugung';
const MASTR_FILTER = 'Betriebs-Status~eq~35~and~Energietr%C3%A4ger~eq~2495~and~Bundesland~eq~1409';
const PAGE_SIZE = 5000;

function parseDate(d) {
  if (!d || typeof d !== 'string') return null;
  try {
    const ts = parseInt(d.replace('/Date(', '').replace(')/', ''));
    return new Date(ts).toISOString().split('T')[0];
  } catch { return null; }
}

async function getState() {
  const r = await fetch(`${SB_URL}/rest/v1/mastr_sync_state?id=eq.1`, { headers: SB_HEADERS });
  const data = await r.json();
  return data[0] || { last_page: 0, total_pages: 0, status: 'idle' };
}

async function updateState(update) {
  await fetch(`${SB_URL}/rest/v1/mastr_sync_state?id=eq.1`, {
    method: 'PATCH', headers: SB_HEADERS,
    body: JSON.stringify(update)
  });
}

async function getExistingPLZ() {
  const r = await fetch(`${SB_URL}/rest/v1/mastr_solar_plz?select=plz,anlagen_gesamt,kwp_gesamt,anlagen_residential,kwp_residential,anlagen_gewerbe,kwp_gewerbe,anlagen_balkon,module_gesamt,volleinspeisung,eigenverbrauch,anlagen_2024_plus,kwp_2024_plus,neueste_anlage,aelteste_anlage,ort&limit=5000`, {
    headers: SB_HEADERS
  });
  const rows = await r.json();
  const map = {};
  for (const row of rows) map[row.plz] = row;
  return map;
}

async function fetchMastrPage(page) {
  const url = `${MASTR_URL}?pageSize=${PAGE_SIZE}&page=${page}&filter=${MASTR_FILTER}`;
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Accept': 'application/json',
      'X-Requested-With': 'XMLHttpRequest'
    }
  });
  return r.json();
}

function processRecords(records, plzMap) {
  for (const r of records) {
    const plz = (r.Plz || '').trim();
    if (!plz || plz.length !== 5) continue;

    let kwp = 0;
    try { kwp = parseFloat(r.Nettonennleistung || r.Bruttoleistung || 0); } catch {}
    if (isNaN(kwp)) kwp = 0;

    const ibd = parseDate(r.InbetriebnahmeDatum);
    const nutz = r.NutzungsbereichGebSABezeichnung || '';
    const art = r.ArtDerSolaranlageBezeichnung || '';
    const einsp = r.VollTeilEinspeisungBezeichnung || '';
    const mod = parseInt(r.AnzahlSolarModule || 0) || 0;

    if (!plzMap[plz]) {
      plzMap[plz] = {
        plz, ort: r.Ort || r.Gemeinde || '',
        anlagen_gesamt: 0, kwp_gesamt: 0,
        anlagen_residential: 0, kwp_residential: 0,
        anlagen_gewerbe: 0, kwp_gewerbe: 0,
        anlagen_balkon: 0, module_gesamt: 0,
        volleinspeisung: 0, eigenverbrauch: 0,
        anlagen_2024_plus: 0, kwp_2024_plus: 0,
        neueste_anlage: null, aelteste_anlage: null
      };
    }

    const d = plzMap[plz];
    d.anlagen_gesamt++;
    d.kwp_gesamt += kwp;
    d.module_gesamt += mod;

    const isRes = ['Haushalt', 'Landwirtschaft'].includes(nutz) || (kwp > 0 && kwp <= 30);
    if (isRes) { d.anlagen_residential++; d.kwp_residential += kwp; }
    else if (kwp > 30) { d.anlagen_gewerbe++; d.kwp_gewerbe += kwp; }
    if (art.includes('Stecker')) d.anlagen_balkon++;
    if ((einsp || '').includes('Voll')) d.volleinspeisung++;
    else if ((einsp || '').includes('Teil')) d.eigenverbrauch++;

    if (ibd) {
      if (!d.neueste_anlage || ibd > d.neueste_anlage) d.neueste_anlage = ibd;
      if (!d.aelteste_anlage || ibd < d.aelteste_anlage) d.aelteste_anlage = ibd;
      if (ibd >= '2024-01-01') { d.anlagen_2024_plus++; d.kwp_2024_plus += kwp; }
    }
    if (!d.ort && (r.Ort || r.Gemeinde)) d.ort = r.Ort || r.Gemeinde;
  }
}

async function upsertPLZ(plzMap) {
  const rows = Object.values(plzMap).map(r => ({
    ...r,
    kwp_gesamt: Math.round(r.kwp_gesamt * 10) / 10,
    kwp_residential: Math.round(r.kwp_residential * 10) / 10,
    kwp_gewerbe: Math.round(r.kwp_gewerbe * 10) / 10,
    kwp_2024_plus: Math.round(r.kwp_2024_plus * 10) / 10,
    data_quality: 'full',
    sampling_factor: 1
  }));

  // Upsert in batches
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    await fetch(`${SB_URL}/rest/v1/mastr_solar_plz`, {
      method: 'POST',
      headers: { ...SB_HEADERS, 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify(batch)
    });
  }
  return rows.length;
}

export default async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  // Simple auth check
  if (authHeader !== 'Bearer bee-doo-mastr-sync-2026') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const state = await getState();

    // If already running and started less than 5 min ago, skip
    if (state.status === 'running' && state.started_at) {
      const age = Date.now() - new Date(state.started_at).getTime();
      if (age < 5 * 60 * 1000) {
        return res.json({ status: 'already_running', page: state.last_page });
      }
    }

    const nextPage = (state.last_page || 0) + 1;

    // If we finished all pages, reset for next day
    if (state.total_pages > 0 && nextPage > state.total_pages) {
      await updateState({
        status: 'complete',
        finished_at: new Date().toISOString()
      });
      return res.json({ status: 'complete', total_pages: state.total_pages });
    }

    await updateState({
      status: 'running',
      started_at: nextPage === 1 ? new Date().toISOString() : state.started_at
    });

    // Fetch page
    const data = await fetchMastrPage(nextPage);
    const total = data.Total || 0;
    const totalPages = Math.ceil(total / PAGE_SIZE);
    const records = data.Data || [];

    // Get existing PLZ data
    const plzMap = await getExistingPLZ();

    // Process
    processRecords(records, plzMap);

    // Upsert
    const plzCount = await upsertPLZ(plzMap);

    // Update state
    const processed = (state.processed_records || 0) + records.length;
    await updateState({
      last_page: nextPage,
      total_pages: totalPages,
      total_records: total,
      processed_records: processed,
      status: nextPage >= totalPages ? 'complete' : 'idle',
      finished_at: nextPage >= totalPages ? new Date().toISOString() : null,
      error: null
    });

    return res.json({
      status: 'ok',
      page: nextPage,
      totalPages,
      records: records.length,
      processed,
      total,
      plzCount,
      pct: Math.round(processed / total * 1000) / 10
    });

  } catch (err) {
    await updateState({ status: 'error', error: err.message });
    return res.status(500).json({ error: err.message });
  }
}
