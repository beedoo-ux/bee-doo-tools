// api/sevdesk-sync.js – SevDesk → Supabase bank_transactions Sync
// Delta-Sync: holt nur neue Transaktionen seit letztem Sync

const SEVDESK_TOKEN = '038aa548ad6b053b4d6679676fb859a2';
const SEVDESK_BASE = 'https://my.sevdesk.de/api/v1';
const SUPABASE_URL = 'https://hqzpemfaljxcysyqssng.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxenBlbWZhbGp4Y3lzeXFzc25nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTMzNTM5NywiZXhwIjoyMDg2OTExMzk3fQ.MJ3cyAAquE8DK2ngzfIIn4bTpQ8_H9DaeJ3YTlBdFz4';
const MAIN_ACCOUNT_ID = '6022136';

async function sevdeskGet(endpoint, params = '') {
  const url = `${SEVDESK_BASE}/${endpoint}${params ? '?' + params : ''}`;
  const resp = await fetch(url, {
    headers: { 'Accept': 'application/json', 'Authorization': SEVDESK_TOKEN, 'User-Agent': 'bee-doo-tools/1.0' }
  });
  if (!resp.ok) throw new Error(`SevDesk ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

async function supabaseUpsert(table, data) {
  // Filter: nur neue Einträge (sevdesk_id nicht vorhanden)
  const ids = data.map(d => d.sevdesk_id).filter(Boolean);
  if (ids.length === 0) return { inserted: 0, updated: 0 };
  
  // Existing IDs abfragen
  const checkResp = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?sevdesk_id=in.(${ids.join(',')})&select=sevdesk_id`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
  );
  const existing = (await checkResp.json()).map(r => r.sevdesk_id);
  const existingSet = new Set(existing);
  
  const newItems = data.filter(d => !existingSet.has(d.sevdesk_id));
  const updateItems = data.filter(d => existingSet.has(d.sevdesk_id));
  
  let inserted = 0;
  // Insert new
  if (newItems.length > 0) {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(newItems)
    });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Supabase INSERT ${resp.status}: ${err}`);
    }
    inserted = newItems.length;
  }
  
  // Skip updates (bank transactions don't change)
  return { inserted, updated: 0, skipped: updateItems.length };
}

async function supabaseGet(query) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  });
  return resp.json();
}

function mapTransaction(t) {
  const amount = parseFloat(t.amount || 0);
  const isCredit = amount >= 0;
  
  return {
    sevdesk_id: parseInt(t.id),
    sevdesk_hash: t.compareHash || null,
    sevdesk_external_id: t.externalId || null,
    buchungsdatum: (t.valueDate || '').slice(0, 10),
    valutadatum: (t.entryDate || '').slice(0, 10),
    betrag: Math.abs(amount),
    waehrung: 'EUR',
    soll_haben: isCredit ? 'CRDT' : 'DBIT',
    verwendungszweck: [t.entryText, t.paymtPurpose].filter(Boolean).join(' · '),
    buchungstext: t.entryText || null,
    gegenkonto_name: t.payeePayerName || '',
    gegenkonto_iban: t.payeePayerAcctNo || '',
    gegenkonto_bic: t.payeePayerBankCode || '',
    eigenes_konto_iban: 'DE90254501100031039985',
    quelle: 'sevdesk',
    import_dateiname: 'sevdesk-api-sync',
    import_format: 'SevDesk-API'
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const _auth = req.headers.authorization;
  const _ref = req.headers.referer || req.headers.origin || '';
  const _isBeedoo = _ref.includes('bee-doo') || _ref.includes('localhost');
  const _isCron = req.headers['x-vercel-cron'] === '1';
  const _isManual = _auth === 'Bearer manual';
  if (!_isBeedoo && !_isCron && !_isManual) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const startTime = Date.now();
  
  try {
    // Get mode: full or delta
    const mode = req.query?.mode || 'delta';
    const daysBack = parseInt(req.query?.days || '7');
    
    let startDate;
    if (mode === 'full') {
      startDate = '2025-01-01';
    } else {
      // Delta: get last synced date
      const lastSync = await supabaseGet(
        'bank_transactions?quelle=eq.sevdesk&order=buchungsdatum.desc&limit=1&select=buchungsdatum'
      );
      if (lastSync && lastSync.length > 0) {
        // Go back a few days for safety (transactions might be backdated)
        const d = new Date(lastSync[0].buchungsdatum);
        d.setDate(d.getDate() - 3);
        startDate = d.toISOString().slice(0, 10);
      } else {
        // No SevDesk data yet → go back N days
        const d = new Date();
        d.setDate(d.getDate() - daysBack);
        startDate = d.toISOString().slice(0, 10);
      }
    }
    
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 1);
    const endStr = endDate.toISOString().slice(0, 10);
    
    // Fetch from SevDesk
    let allTxns = [];
    let offset = 0;
    const limit = 100;
    
    while (true) {
      const params = `checkAccount[id]=${MAIN_ACCOUNT_ID}&checkAccount[objectName]=CheckAccount&startDate=${startDate}&endDate=${endStr}&limit=${limit}&offset=${offset}`;
      const batch = await sevdeskGet('CheckAccountTransaction', params);
      const objs = batch.objects || [];
      allTxns = allTxns.concat(objs);
      if (objs.length < limit) break;
      offset += limit;
      
      // Safety: max 10000
      if (allTxns.length >= 10000) break;
    }
    
    if (allTxns.length === 0) {
      // Update sync config
      await updateSyncConfig(0, 0, startDate, endStr);
      return res.json({ ok: true, mode, startDate, endDate: endStr, fetched: 0, synced: 0 });
    }
    
    // Map to our schema
    const mapped = allTxns.map(mapTransaction);
    
    // Batch upsert (chunks of 200)
    let synced = 0;
    for (let i = 0; i < mapped.length; i += 200) {
      const chunk = mapped.slice(i, i + 200);
      const result = await supabaseUpsert('bank_transactions', chunk);
      synced += result.inserted + result.updated;
    }
    
    // Update sync config
    await updateSyncConfig(allTxns.length, synced, startDate, endStr);
    
    const elapsed = Date.now() - startTime;
    
    return res.json({
      ok: true,
      mode,
      startDate,
      endDate: endStr,
      fetched: allTxns.length,
      synced,
      elapsed_ms: elapsed
    });
    
  } catch (err) {
    console.error('SevDesk sync error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

async function updateSyncConfig(fetched, synced, startDate, endDate) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/sync_configs?sync_key=eq.sevdesk_bank`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        last_sync_at: new Date().toISOString(),
        last_sync_result: { fetched, synced, startDate, endDate, ts: new Date().toISOString() }
      })
    });
  } catch (e) {
    // Non-critical
    console.warn('Could not update sync_configs:', e.message);
  }
}
