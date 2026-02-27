// Vercel Cron Job: Runs enabled syncs from sync_configs table
// Schedule: Every hour, checks which syncs are due

const SU = 'https://hqzpemfaljxcysyqssng.supabase.co';
const SK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxenBlbWZhbGp4Y3lzeXFzc25nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTMzNTM5NywiZXhwIjoyMDg2OTExMzk3fQ.MJ3cyAAquE8DK2ngzfIIn4bTpQ8_H9DaeJ3YTlBdFz4';
const LU = 'https://beedoo.leveto.net/API';
const LN = 'api@bee-doo.de';
const LP = 'Patrick123456789!';

const hd = () => ({ apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' });
const ap = (t) => `${SU}/rest/v1/${t}`;

// Check if a cron schedule matches current time
function cronMatches(schedule, now) {
    if (schedule === '— manuell —') return false;
    const parts = schedule.split(' ');
    if (parts.length !== 5) return false;
    const [min, hour, dom, mon, dow] = parts;
    const matches = (field, value) => {
        if (field === '*') return true;
        if (field.startsWith('*/')) return value % parseInt(field.slice(2)) === 0;
        return field.split(',').some(v => parseInt(v) === value);
    };
    return matches(min, now.getUTCMinutes()) &&
           matches(hour, now.getUTCHours()) &&
           matches(dom, now.getUTCDate()) &&
           matches(mon, now.getUTCMonth() + 1) &&
           matches(dow, now.getUTCDay());
}

// Leveto Auth
async function levetoAuth() {
    const r = await fetch(LU + '/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `username=${encodeURIComponent(LN)}&password=${encodeURIComponent(LP)}`
    });
    const d = await r.json();
    if (!d.login) throw new Error('Leveto Auth failed: ' + d.message);
    return d.token;
}

// Leveto lead mapper
function lMap(l) {
    const a = l.homeAddress || {}, s = l.status || {}, sf = l.statusFirst || {};
    return {
        leveto_id: l.id, id_extern: l.idExtern || null,
        vorname: (l.firstName || '').trim(), nachname: (l.lastName || '').trim(),
        email: l.email || null, telefon: l.telephone || null, mobil: l.mobile || null,
        strasse: a.fullstreet || a.street || null, plz: a.postalCode || null, ort: a.city || null,
        lat: a.lat || null, lng: a.lng || null, quelle: l.source || null,
        berater_name: l.berater || null, status_name: s.name || null,
        status_indicator: s.indicator || null,
        sync_aktualisiert_am: new Date().toISOString()
    };
}

// ═══ SYNC RUNNERS ═══

async function runLevetoSync(config) {
    const token = await levetoAuth();
    const hours = config?.hours || 24;
    const from = new Date(Date.now() - hours * 3600000).toISOString().split('T')[0];
    
    let synced = 0, page = 1;
    const bs = 100;
    const first = await (await fetch(`${LU}/leads?limit=1&lastEditFrom=${from}`, { headers: { Authorization: `Bearer ${token}` } })).json();
    const total = first.totalrecords;

    while (true) {
        const off = (page - 1) * bs;
        if (off >= total) break;
        const d = await (await fetch(`${LU}/leads?limit=${bs}&offset=${off}&lastEditFrom=${from}`, { headers: { Authorization: `Bearer ${token}` } })).json();
        if (!d.leads || !d.leads.length) break;
        const rows = d.leads.map(lMap);
        await fetch(ap('leveto_leads'), { method: 'POST', headers: { ...hd(), Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(rows) });
        synced += rows.length;
        page++;
        if (page > 600) break; // Safety limit
    }
    return { synced, total };
}

async function runLohnSheetSync(config) {
    const url = config?.sheet_url;
    if (!url) throw new Error('Keine Sheet-URL konfiguriert');
    
    const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    const sid = m ? m[1] : url;
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sid}/gviz/tq?tqx=out:csv`;
    
    const r = await fetch(csvUrl);
    if (!r.ok) throw new Error(`Sheet nicht erreichbar (${r.status})`);
    const text = await r.text();
    
    // Parse CSV
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) throw new Error('Keine Daten im Sheet');
    
    const splitRow = (line) => {
        const cols = []; let cur = '', inQ = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
            else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
            else cur += ch;
        }
        cols.push(cur.trim());
        return cols;
    };
    
    const headers = splitRow(lines[0].replace(/^\uFEFF/, '')).map(h => h.replace(/^"|"$/g, ''));
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = splitRow(lines[i]);
        const obj = {};
        headers.forEach((k, j) => obj[k] = (cols[j] || '').replace(/^"|"$/g, ''));
        rows.push(obj);
    }
    
    const bid = crypto.randomUUID();
    const nameCol = headers.find(h => h.toLowerCase().includes('name') || h.toLowerCase().includes('mitarbeiter'));
    const dbRows = rows.map((r, i) => ({
        sheet_id: sid, sheet_name: 'Sheet1', zeile_nr: i + 2,
        mitarbeiter_name: r[nameCol] || `Zeile ${i + 2}`,
        raw_row: JSON.stringify(r), sync_batch_id: bid,
        synced_at: new Date().toISOString()
    }));
    
    // Delete old + insert new
    await fetch(ap('lohn_sheet_data') + `?sheet_id=eq.${sid}`, { method: 'DELETE', headers: hd() });
    
    // Batch insert
    for (let i = 0; i < dbRows.length; i += 50) {
        const batch = dbRows.slice(i, i + 50);
        await fetch(ap('lohn_sheet_data'), { method: 'POST', headers: { ...hd(), Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(batch) });
    }
    
    return { rows: dbRows.length, columns: headers.length };
}

async function runAutoMerge() {
    let le = 0, lc = 0, ec = 0;
    
    // Phase 1: EFS ↔ Leveto
    const er = await (await fetch(ap('efs_projekte') + '?select=efs_id,kunde_nachname,kunde_plz,leveto_id&leveto_id=is.null&limit=2000', { headers: hd() })).json();
    if (er.length > 0) {
        const lr = await (await fetch(ap('leveto_leads') + '?select=id,leveto_id,nachname,plz&limit=10000', { headers: hd() })).json();
        const lk = {};
        lr.forEach(l => { const k = `${(l.nachname || '').toLowerCase().trim()}_${l.plz || ''}`; if (!lk[k]) lk[k] = []; lk[k].push(l); });
        for (const e of er) {
            const k = `${(e.kunde_nachname || '').toLowerCase().trim()}_${e.kunde_plz || ''}`;
            if (lk[k]) { await fetch(ap('efs_projekte') + `?efs_id=eq.${e.efs_id}`, { method: 'PATCH', headers: hd(), body: JSON.stringify({ leveto_id: lk[k][0].leveto_id }) }); le++; }
        }
    }
    
    // Phase 2: CSV ↔ Leveto
    const pr = await (await fetch(ap('import_provisions') + '?select=an_nr,lead_id&lead_id=not.is.null&limit=5000', { headers: hd() })).json();
    if (pr.length > 0) {
        const li = await (await fetch(ap('leveto_leads') + '?select=id,leveto_id&limit=50000', { headers: hd() })).json();
        const ik = {}; li.forEach(l => { ik[l.leveto_id] = l.id; });
        for (const p of pr) if (ik[p.lead_id]) lc++;
    }
    
    // Phase 3: EFS ↔ CSV
    const ea = await (await fetch(ap('efs_projekte') + '?select=efs_id,kunde_nachname,kunde_plz&limit=2000', { headers: hd() })).json();
    const pa = await (await fetch(ap('import_provisions') + '?select=an_nr,kunde,kunde_plz&limit=5000', { headers: hd() })).json();
    const pk = {};
    pa.forEach(p => { const nm = (p.kunde || '').split(/\s+/).pop() || ''; const k = `${nm.toLowerCase()}_${p.kunde_plz || ''}`; if (!pk[k]) pk[k] = []; pk[k].push(p); });
    for (const e of ea) { const k = `${(e.kunde_nachname || '').toLowerCase().trim()}_${e.kunde_plz || ''}`; if (pk[k]) ec++; }
    
    return { efs_leveto: le, csv_leveto: lc, efs_csv: ec, total: le + lc + ec };
}

// ═══ MAIN HANDLER ═══
export default async function handler(req, res) {
    // Verify cron secret or allow manual trigger
    const authHeader = req.headers.authorization;
    if (authHeader !== 'Bearer manual' && req.headers['x-vercel-cron'] !== '1') {
        // Allow if it has our service key
        if (authHeader !== `Bearer ${SK}`) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }

    const now = new Date();
    const results = [];
    const forceKey = req.query?.sync; // ?sync=lohn_sheet to force specific

    try {
        // Load enabled sync configs
        const cfgR = await fetch(ap('sync_configs') + '?enabled=eq.true&select=*', { headers: hd() });
        const configs = await cfgR.json();

        for (const cfg of configs) {
            // Skip if not due (unless forced)
            if (forceKey && cfg.sync_key !== forceKey) continue;
            if (!forceKey && !cronMatches(cfg.cron_schedule, now)) continue;

            const startTime = Date.now();
            let result = {};

            try {
                switch (cfg.sync_key) {
                    case 'leveto_sync':
                        result = await runLevetoSync(cfg.config);
                        break;
                    case 'lohn_sheet':
                        result = await runLohnSheetSync(cfg.config);
                        break;
                    case 'auto_merge':
                        result = await runAutoMerge();
                        break;
                    case 'efs_sync':
                        // EFS has its own cron at /api/efs-sync
                        result = { skipped: true, reason: 'Has dedicated cron endpoint' };
                        break;
                    default:
                        result = { skipped: true, reason: 'No runner for ' + cfg.sync_key };
                }

                result.duration_ms = Date.now() - startTime;
                result.success = true;

                // Update sync config
                await fetch(ap('sync_configs') + `?sync_key=eq.${cfg.sync_key}`, {
                    method: 'PATCH', headers: hd(),
                    body: JSON.stringify({
                        last_sync_at: now.toISOString(),
                        last_sync_result: result,
                        updated_at: now.toISOString()
                    })
                });
            } catch (err) {
                result = { success: false, error: err.message, duration_ms: Date.now() - startTime };
                await fetch(ap('sync_configs') + `?sync_key=eq.${cfg.sync_key}`, {
                    method: 'PATCH', headers: hd(),
                    body: JSON.stringify({
                        last_sync_at: now.toISOString(),
                        last_sync_result: result,
                        updated_at: now.toISOString()
                    })
                });
            }

            results.push({ sync_key: cfg.sync_key, ...result });
        }

        return res.status(200).json({ ok: true, ran: results.length, results, timestamp: now.toISOString() });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
