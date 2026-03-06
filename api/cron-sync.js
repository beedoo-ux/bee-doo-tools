// Vercel Cron Job: Runs enabled syncs from sync_configs table
// Schedule: Every hour, checks which syncs are due
// ⚠️ PAUSED 2026-03-04: Switching to Overview API. All data now comes from /api/overview-march.
// Old Supabase sync is no longer the primary data source for vt-ranking or challenge.

// PAUSED_KEYS: syncs paused because vt-ranking switched to Overview API
// leveto_appointments + scout_sync are NOT in this list - they power live-ticker & scouting
const PAUSED_KEYS = ['leveto_sync', 'leveto_contracts', 'lohn_sheet', 'auto_merge'];

const SU = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LU = 'https://beedoo.leveto.net/API';
const LN = process.env.LEVETO_USER || 'api@bee-doo.de';
const LP = process.env.LEVETO_PASS;

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
    const vd = d => d && d !== '0000-00-00' && d !== '0000-00-00 00:00:00' ? d : null;
    return {
        leveto_id: l.id, id_extern: l.idExtern || null,
        anrede: l.salutation || null,
        vorname: (l.firstName || '').trim(), nachname: (l.lastName || '').trim(),
        firma: l.companyName || null,
        email: l.email || null, telefon: l.telephone || null, telefon2: l.telephone2 || null, mobil: l.mobile || null,
        erreichbarkeit: l.reachability || null,
        strasse: a.fullstreet || a.street || null, hausnr: a.housenr || null,
        plz: a.postalCode || null, ort: a.city || null,
        lat: a.lat || null, lng: a.lng || null,
        quelle: l.source || null, tags: l.tags || null,
        berater_name: l.berater || null,
        berater_ma_nummer: l.berater_ma_nummer || null,
        status_id: s.id || null, status_name: s.name || null,
        status_indicator: s.indicator || null,
        status_datum: vd(s.date),
        erster_status_id: sf.id || null, erster_status_name: sf.name || null,
        erster_status_datum: vd(sf.date),
        letzter_status_wechsel: vd(l.last_status_change),
        assignments_count: l.assignmentsCount || 0,
        accepted_count: l.acceptedCount || 0,
        declined_count: l.declinedCount || 0,
        leveto_erstellt_am: vd(l.createdOn),
        leveto_importiert_am: vd(l.importedOn),
        leveto_letzte_bearbeitung: vd(l.lastEditOn),
        leveto_abgeschlossen_am: vd(l.finishedOn),
        sync_aktualisiert_am: new Date().toISOString()
    };
}

// ═══ SYNC RUNNERS ═══

async function runLevetoSync(config) {
    const token = await levetoAuth();
    const hours = config?.hours || 24;
    const from = new Date(Date.now() - hours * 3600000).toISOString().split('T')[0] + ' 00:00:00';
    
    let synced = 0, page = 1;
    const bs = 100;
    const first = await (await fetch(`${LU}/leads?limit=1&page=1&lastEditFrom=${encodeURIComponent(from)}`, { headers: { Authorization: `Bearer ${token}` } })).json();
    const total = first.totalrecords || 0;
    if (!total) return { synced: 0, total: 0 };

    while (true) {
        if ((page - 1) * bs >= total) break;
        const d = await (await fetch(`${LU}/leads?limit=${bs}&page=${page}&lastEditFrom=${encodeURIComponent(from)}`, { headers: { Authorization: `Bearer ${token}` } })).json();
        if (!d.leads || !d.leads.length) break;
        const rows = d.leads.map(lMap);
        await fetch(ap('leveto_leads'), { method: 'POST', headers: { ...hd(), Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(rows) });
        synced += rows.length;
        page++;
        if (page > 600) break; // Safety limit
        // Rate limit: max 14 requests per burst
        if (page % 14 === 0) await new Promise(r => setTimeout(r, 22000));
    }
    return { synced, total };
}

// Contracts mapper
function cMap(c) {
    const vd = d => d && d !== '0000-00-00' && d !== '0000-00-00 00:00:00' ? d : null;
    return {
        leveto_id: c.id, dyn_offernum: c.dyn_offernum || null,
        lead_id: c.leadID || null, id_extern: c.id_extern || null,
        vorname: (c.vorname || '').trim() || null, nachname: (c.nachname || '').trim() || null,
        ersteller: (c.ersteller || '').trim() || null, quelle: (c.quelle || '').trim() || null,
        status_kunde: c.status_kunde || null, currentstatus: c.currentstatus || null,
        calculated_realprice_netto: c.calculated_realprice_netto ? parseFloat(c.calculated_realprice_netto) : null,
        calculated_realprice_brutto: c.calculated_realprice_brutto ? parseFloat(c.calculated_realprice_brutto) : null,
        creation_date: vd(c.creation_date), accepted_date: vd(c.accepted_date),
        storno_date: vd(c.storno_date), revocation_end_date: vd(c.revocation_end_date),
        archived: c.archived === 1, release_declinereason: c.release_declinereason || null,
        pdf_url: c.pdf_url || null, project_id: c.projectID || null,
        typeicons: JSON.stringify(c.typeicons || []),
        sync_aktualisiert_am: new Date().toISOString()
    };
}

async function runContractsSync(config, req) {
    const token = await levetoAuth();
    const hours = config?.hours || 1;
    const now = new Date();
    const isNightlyFull = now.getUTCHours() === 2 || req?.query?.full === 'true'; // 3 AM CET or ?full=true
    
    let url = `${LU}/contracts`;
    let mode = 'delta';
    
    if (!isNightlyFull) {
        // Delta: nur kürzlich angenommene (letzte X Stunden)
        const from = new Date(Date.now() - hours * 3600000).toISOString().split('T')[0];
        url += `?accepteddate_start=${from}`;
    } else {
        mode = 'full'; // Nachts: alles holen (fängt Stornos, Status-Änderungen)
    }
    
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`Contracts API: HTTP ${r.status}`);
    const d = await r.json();
    
    if (!d.data || !d.data.length) return { synced: 0, total: 0, mode };
    
    const rows = d.data.map(cMap);
    const bs = 200;
    let synced = 0;
    
    for (let i = 0; i < rows.length; i += bs) {
        const batch = rows.slice(i, i + bs);
        const res = await fetch(ap('leveto_contracts') + '?on_conflict=leveto_id', {
            method: 'POST', headers: { ...hd(), Prefer: 'resolution=merge-duplicates' },
            body: JSON.stringify(batch)
        });
        if (res.ok) synced += batch.length;
    }
    
    return { synced, total: rows.length, mode };
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
    try {
        const er = await (await fetch(ap('efs_projekte') + '?select=efs_id,kunde_nachname,kunde_plz,leveto_id&leveto_id=is.null&limit=2000', { headers: hd() })).json();
        if (Array.isArray(er) && er.length > 0) {
            const lr = await (await fetch(ap('leveto_leads') + '?select=id,leveto_id,nachname,plz&limit=10000', { headers: hd() })).json();
            if (Array.isArray(lr)) {
                const lk = {};
                lr.forEach(l => { const k = `${(l.nachname || '').toLowerCase().trim()}_${l.plz || ''}`; if (!lk[k]) lk[k] = []; lk[k].push(l); });
                for (const e of er) {
                    const k = `${(e.kunde_nachname || '').toLowerCase().trim()}_${e.kunde_plz || ''}`;
                    if (lk[k]) { await fetch(ap('efs_projekte') + `?efs_id=eq.${e.efs_id}`, { method: 'PATCH', headers: hd(), body: JSON.stringify({ leveto_id: lk[k][0].leveto_id }) }); le++; }
                }
            }
        }
    } catch (e) { console.error('Auto-merge Phase 1 error:', e.message); }
    
    return { efs_leveto: le, total: le };
}


// ═══ SCOUT QUALIFIKATION SYNC (Dennis API → Supabase) ═══
// Schedule:
//   5min between 07-23h CET → current day only
//   23:59 CET daily         → full current day (final sweep)
//   Sunday                  → current + previous week
//   Month end               → current + previous month
// Rate limit: max 1 request/second to Dennis API
async function runScoutSync() {
    const DENNIS_TOKEN = 'tcp_2a71c5e2cff94d04b03eb447ea645a3719f3705c63ffcb44f22e3585fd9f6496';
    const PAGE_SIZE = 100;
    let synced = 0, skipped = 0, page = 1;

    // Current time in CET (UTC+1, simplified)
    const nowUtc = new Date();
    const cetHour = (nowUtc.getUTCHours() + 1) % 24; // rough CET
    const cetDay = nowUtc.getUTCDay(); // 0=Sun
    const cetDate = nowUtc.getUTCDate();
    const cetMonth = nowUtc.getUTCMonth();
    const cetYear = nowUtc.getUTCFullYear();
    const daysInMonth = new Date(cetYear, cetMonth + 1, 0).getDate();

    // Determine sync range based on schedule
    let sinceDate;
    let syncMode = 'delta'; // delta | daily | weekly | monthly

    if (cetDate === daysInMonth || (cetDate === daysInMonth - 1 && cetHour >= 23)) {
        // Month end → sync current + previous month
        const prevMonth = new Date(cetYear, cetMonth - 1, 1);
        sinceDate = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-01`;
        syncMode = 'monthly';
    } else if (cetDay === 0) {
        // Sunday → sync current + previous week (14 days)
        const twoWeeksAgo = new Date(nowUtc.getTime() - 14 * 86400000);
        sinceDate = twoWeeksAgo.toISOString().split('T')[0];
        syncMode = 'weekly';
    } else if (cetHour === 23) {
        // 23:xx → full current day final sweep
        sinceDate = nowUtc.toISOString().split('T')[0];
        syncMode = 'daily';
    } else if (cetHour >= 7 && cetHour < 23) {
        // Normal 5min delta: current day
        sinceDate = nowUtc.toISOString().split('T')[0];
        syncMode = 'delta';
    } else {
        // Outside 07-23h → skip
        return { synced: 0, skipped: 0, success: true, mode: 'skipped (night)' };
    }

    const createdAfter = sinceDate + 'T00:00:00%2B01:00';

    while (true) {
        const url = `https://api.bee-doo.de/api/adress_qualifikations?page=${page}&itemsPerPage=${PAGE_SIZE}&order%5Bcreated%5D=desc&created%5Bafter%5D=${createdAfter}`;
        const r = await fetch(url, { headers: { 'X-AUTH-TOKEN': DENNIS_TOKEN } });
        if (!r.ok) throw new Error('Dennis API error: ' + r.status);
        const data = await r.json();
        const items = data['hydra:member'] || [];
        if (!items.length) break;

        const rows = items.map(item => ({
            id:                item['@id'].split('/').pop() + '_' + item.created,
            api_id:            item['@id'],
            mitarbeiter_id:    item.mitarbeiter?.id || null,
            mitarbeiter_name:  item.mitarbeiter?.name || null,
            qualifikation:     item.qualifikation || null,
            created:           item.created,
            plz:               item.wohneinheit?.adresse?.plz || null,
            ort:               item.wohneinheit?.adresse?.ort || null,
            strasse:           item.wohneinheit?.adresse?.strasse || null,
            hausnummer:        item.wohneinheit?.adresse?.hausnummer || null,
            hausnummer_zusatz: item.wohneinheit?.adresse?.hausnummerZusatz || null,
            lat:               item.wohneinheit?.adresse?.lat ? parseFloat(item.wohneinheit.adresse.lat) : null,
            lng:               item.wohneinheit?.adresse?.lng ? parseFloat(item.wohneinheit.adresse.lng) : null,
            synced_at:         new Date().toISOString()
        }));

        // Upsert to Supabase
        const upsertR = await fetch(ap('scout_qualifikationen'), {
            method: 'POST',
            headers: { ...hd(), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify(rows)
        });
        if (!upsertR.ok) {
            const err = await upsertR.text();
            throw new Error('Upsert error: ' + err.slice(0, 200));
        }
        synced += rows.length;

        // Check pagination
        const total = data['hydra:totalItems'] || 0;
        if (page * PAGE_SIZE >= total) break;
        page++;
        await new Promise(r => setTimeout(r, 1000)); // 1 req/sec rate limit
    }

    // Server-side geocoding for rows missing lat/lng
    await geocodeScoutRows();

    return { synced, skipped, success: true, mode: syncMode, since: sinceDate };
}

// Geocode scout rows that have address but no lat/lng (server-side, up to 50 per run)
async function geocodeScoutRows() {
    const GKEY = 'AIzaSyB7Y7FgAc4R6GX1V6GjGzm0bSNK5IfBg7o';
    // Get rows needing geocoding (distinct addresses, limit 50 per run)
    const r = await fetch(ap('scout_qualifikationen') + 
        '?select=id,strasse,hausnummer,plz,ort&lat=is.null&strasse=not.is.null&limit=50', 
        { headers: hd() });
    if (!r.ok) return;
    const rows = await r.json();
    if (!rows.length) return;

    let geocoded = 0;
    // Group by unique address to minimize API calls
    const addrMap = {};
    rows.forEach(row => {
        const key = `${row.strasse} ${row.hausnummer||''}, ${row.plz} ${row.ort}`.trim();
        if (!addrMap[key]) addrMap[key] = [];
        addrMap[key].push(row.id);
    });

    for (const [addr, ids] of Object.entries(addrMap)) {
        try {
            const gUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addr)}&key=${GKEY}`;
            const gr = await fetch(gUrl);
            const gd = await gr.json();
            if (gd.results?.[0]) {
                const { lat, lng } = gd.results[0].geometry.location;
                // Update all rows with this address
                await fetch(ap('scout_qualifikationen') + `?id=in.(${ids.map(id => `"${id}"`).join(',')})`, {
                    method: 'PATCH',
                    headers: hd(),
                    body: JSON.stringify({ lat, lng })
                });
                geocoded++;
            }
        } catch(e) {}
        await new Promise(r => setTimeout(r, 50));
    }
    console.log(`Geocoded ${geocoded} unique addresses`);
}

// Appointments mapper
function aMap(a) {
    const vd = d => d && d !== '0000-00-00' && d !== '0000-00-00 00:00:00 00:00:00' ? d.replace(' ', 'T') + (d.includes('+') ? '' : '+00:00') : null;
    // Derive status from storno_date / closed_date / feedback
    let status = 'Open';
    if (a.storno_date && a.storno_date !== '0000-00-00 00:00:00') status = 'Cancelled';
    else if (a.closed_date && a.closed_date !== '0000-00-00 00:00:00') status = 'Closed';
    return {
        leveto_id:           a.id,
        lead_id:             a.leadID || null,
        project_id:          a.projectID || null,
        appointment_type:    a.appointment_type || null,
        start_date:          vd(a.start_date),
        end_date:            vd(a.end_date),
        status,
        feedback_status:     a.feedback_status || null,
        feedback_detail:     a.feedback_detail || null,
        user_created:        (a.user_created || '').trim() || null,
        user_received:       (a.user_received || '').trim() || null,
        user_received_id:    a.user_receivedID || null,
        creation_date:       vd(a.creation_date),
        closed_date:         vd(a.closed_date),
        storno_date:         vd(a.storno_date),
        storno_reason:       a.storno_reason || null,
        storno_reason_detail:a.storno_reason_detail || null,
        kunde_vorname:       (a.vorname || '').trim() || null,
        kunde_nachname:      (a.nachname || '').trim() || null,
        kunde_plz:           a.plz || null,
        kunde_stadt:         a.stadt || null,
        kunde_strasse:       a.strasse || null,
        kunde_hausnr:        a.hausnummer || null,
        quelle:              a.quelle || null,
        termin_text:         a.text || null,
        id_extern:           a.id_extern || null,
        sync_aktualisiert_am: new Date().toISOString()
    };
}

async function runAppointmentsSync(config, req) {
    const token = await levetoAuth();
    const now = new Date();

    // Window: sync appointments in relevant range only (Leveto API ignores date params,
    // so we fetch all and filter client-side)
    const windowDaysBack   = config?.days_back   || 14;  // how far back (catch feedback on past appts)
    const windowDaysFwd    = config?.days_fwd     || 60;  // how far forward
    const isFullSync       = req?.query?.full === 'true' || now.getUTCHours() === 1; // nightly at 02:00 CET

    const cutoffBack = new Date(now - windowDaysBack * 86400000).toISOString().slice(0, 10);
    const cutoffFwd  = new Date(now.getTime() + windowDaysFwd * 86400000).toISOString().slice(0, 10);

    // Fetch all (Leveto ignores any date filter - confirmed)
    const r = await fetch(`${LU}/appointments?limit=99999`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`Appointments API HTTP ${r.status}`);
    const d = await r.json();
    const all = d.data || [];

    // Filter to window unless full sync
    const filtered = isFullSync ? all : all.filter(a => {
        if (!a.start_date) return false;
        const dateStr = a.start_date.slice(0, 10);
        return dateStr >= cutoffBack && dateStr <= cutoffFwd;
    });

    if (!filtered.length) return { synced: 0, total: all.length, window: `${cutoffBack}..${cutoffFwd}`, mode: isFullSync ? 'full' : 'window' };

    const rows = filtered.map(aMap);

    // Upsert in batches of 200
    const bs = 200;
    let synced = 0;
    for (let i = 0; i < rows.length; i += bs) {
        const batch = rows.slice(i, i + bs);
        const uRes = await fetch(ap('leveto_appointments') + '?on_conflict=leveto_id', {
            method: 'POST',
            headers: { ...hd(), Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify(batch)
        });
        if (uRes.ok) synced += batch.length;
        else {
            const errTxt = await uRes.text();
            throw new Error(`Upsert batch ${i}: ${errTxt.slice(0, 200)}`);
        }
    }

    return { synced, total: all.length, window: `${cutoffBack}..${cutoffFwd}`, mode: isFullSync ? 'full' : 'window' };
}

// ═══ MAIN HANDLER ═══
export default async function handler(req, res) {
    // Selective pause: skip paused keys unless forced by ?sync=key
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
            if (!forceKey && PAUSED_KEYS.includes(cfg.sync_key)) continue; // paused

            const startTime = Date.now();
            let result = {};

            try {
                switch (cfg.sync_key) {
                    case 'leveto_sync':
                        result = await runLevetoSync(cfg.config);
                        break;
                    case 'leveto_contracts':
                        result = await runContractsSync(cfg.config, req);
                        break;
                    case 'lohn_sheet':
                        result = await runLohnSheetSync(cfg.config);
                        break;
                    case 'auto_merge':
                        result = await runAutoMerge();
                        break;
                    case 'scout_sync':
                        result = await runScoutSync();
                        break;
                    case 'leveto_appointments':
                        result = await runAppointmentsSync(cfg.config, req);
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

