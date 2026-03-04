// api/backfill-leads.js — Re-sync all leads from Leveto to Supabase
// Usage: GET /api/backfill-leads?page=1 (processes 50 leads per call)
// Returns: { processed, page, totalPages, done, nextUrl }

const SU = 'https://hqzpemfaljxcysyqssng.supabase.co';
const SK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxenBlbWZhbGp4Y3lzeXFzc25nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTMzNTM5NywiZXhwIjoyMDg2OTExMzk3fQ.MJ3cyAAquE8DK2ngzfIIn4bTpQ8_H9DaeJ3YTlBdFz4';
const LU = 'https://beedoo.leveto.net/API';

function vd(d) { return d && d !== '0000-00-00' && d !== '0000-00-00 00:00:00' ? d : null; }

function lMap(l) {
    const a = l.homeAddress || {}, s = l.status || {}, sf = l.statusFirst || {};
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

// ⚠️ PAUSED 2026-03-04: Switching to Overview API
export default async function handler(req, res) {
  return res.status(200).json({ status: 'paused', reason: 'Switched to Overview API 2026-03-04' });
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    try {
        // Auth
        const authResp = await fetch(`${LU}/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'username=api%40bee-doo.de&password=Patrick123456789%21'
        });
        const auth = await authResp.json();
        if (!auth.token) return res.status(401).json({ error: 'Auth failed' });

        // Fetch page
        const leadsResp = await fetch(`${LU}/leads?limit=${limit}&page=${page}`, {
            headers: { 'Authorization': `Bearer ${auth.token}` }
        });
        const leadsData = await leadsResp.json();
        const totalPages = leadsData.totalpages || 0;
        const totalRecords = leadsData.totalrecords || 0;
        const leads = leadsData.leads || [];

        if (!leads.length) {
            return res.status(200).json({ processed: 0, page, totalPages, totalRecords, done: true });
        }

        // Map and upsert
        const rows = leads.map(lMap);
        const upsertResp = await fetch(`${SU}/rest/v1/leveto_leads?on_conflict=leveto_id`, {
            method: 'POST',
            headers: {
                apikey: SK,
                Authorization: `Bearer ${SK}`,
                'Content-Type': 'application/json',
                Prefer: 'resolution=merge-duplicates'
            },
            body: JSON.stringify(rows)
        });

        const upsertOk = upsertResp.ok;
        const done = page >= totalPages;

        return res.status(200).json({
            processed: rows.length,
            upsertOk,
            page,
            totalPages,
            totalRecords,
            done,
            nextUrl: done ? null : `/api/backfill-leads?page=${page + 1}&limit=${limit}`,
            sample: rows[0] ? { leveto_id: rows[0].leveto_id, berater_name: rows[0].berater_name, leveto_erstellt_am: rows[0].leveto_erstellt_am, quelle: rows[0].quelle } : null
        });
    } catch (err) {
        return res.status(500).json({ error: err.message, page });
    }
}
