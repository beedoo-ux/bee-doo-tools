// api/enpal-leads-sync.js
// Syncs Enpal leads DIRECTLY from Leveto API → enpal_leads (Supabase)
// Independent of cron-sync / leveto_leads table
// Runs every 15 minutes via Vercel cron

const SU = 'https://hqzpemfaljxcysyqssng.supabase.co';
const SK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxenBlbWZhbGp4Y3lzeXFzc25nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTMzNTM5NywiZXhwIjoyMDg2OTExMzk3fQ.MJ3cyAAquE8DK2ngzfIIn4bTpQ8_H9DaeJ3YTlBdFz4';
const LU = 'https://beedoo.leveto.net/API';
const LN = 'api@bee-doo.de';
const LP = 'Patrick123456789!';

const hd = () => ({ apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' });

async function levetoAuth() {
  const r = await fetch(`${LU}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=${encodeURIComponent(LN)}&password=${encodeURIComponent(LP)}`
  });
  const d = await r.json();
  if (!d.token) throw new Error('Leveto Auth failed: ' + JSON.stringify(d));
  return d.token;
}

function vd(d) {
  // Returns null for empty/zero dates, otherwise the value
  if (!d || d === '0000-00-00' || d === '0000-00-00 00:00:00' || d === 'None') return null;
  return d;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = req.headers.authorization;
  if (auth !== 'Bearer manual' && req.headers['x-vercel-cron'] !== '1' && auth !== `Bearer ${SK}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const startTime = Date.now();

  try {
    const token = await levetoAuth();
    const lhd = { Authorization: `Bearer ${token}` };

    // 1. Fetch ALL Enpal leads from Leveto (paginated by source)
    const sources = ['Enpal', 'Enpal - WP', 'Enpal - Test'];
    const allLeads = [];
    const seenIds = new Set();

    for (const src of sources) {
      let page = 1;
      while (true) {
        const r = await fetch(`${LU}/leads?limit=100&page=${page}&source=${encodeURIComponent(src)}`, { headers: lhd });
        const d = await r.json();
        const leads = d.leads || [];
        if (!leads.length) break;
        for (const l of leads) {
          if (!seenIds.has(l.id)) { seenIds.add(l.id); allLeads.push(l); }
        }
        const total = d.totalrecords || 0;
        if (page * 100 >= total) break;
        page++;
        if (page % 14 === 0) await new Promise(r => setTimeout(r, 22000));
      }
    }

    if (!allLeads.length) {
      return res.status(200).json({ ok: true, synced: 0, msg: 'No Enpal leads found in Leveto' });
    }

    // 2. Fetch contracts
    const r2 = await fetch(`${LU}/contracts`, { headers: lhd });
    const contractsData = await r2.json();
    const allContracts = contractsData.data || [];

    // Index contracts by lead_id — prefer non-storniert
    const contractsByLead = {};
    for (const c of allContracts) {
      if (!c.leadID) continue;
      const existing = contractsByLead[c.leadID];
      if (!existing || (!c.storno_date && existing.storno_date)) {
        contractsByLead[c.leadID] = c;
      }
    }

    // 3. Map to enpal_leads schema
    // KEY FIX: use importedOn (not createdOn which is always 0000-00-00 for Enpal leads)
    const now = new Date().toISOString();
    const terminiertStatuses = ['Terminiert', 'Angebot erstellt', 'Angebot angenommen', 'AB erstellt', 'Kontakt/Angebot per Mail'];

    const rows = allLeads.map(l => {
      const s = l.status || {};
      const a = l.homeAddress || {};
      const c = contractsByLead[l.id] || null;
      const hat_termin = terminiertStatuses.includes(s.name);

      // importedOn = real "created at" for Enpal leads (createdOn is always 0000-00-00)
      const importedDate = vd(l.importedOn);

      return {
        leveto_id: l.id,
        status_name: s.name || null,
        status_indicator: s.indicator || null,
        quelle: l.source || null,
        berater_name: l.berater || null,
        kunde_vorname: (l.firstName || '').trim() || null,
        kunde_nachname: (l.lastName || '').trim() || null,
        plz: a.postalCode || null,
        ort: a.city || null,
        telefon: l.telephone || null,
        email: l.email || null,
        notizen: null,
        leveto_erstellt_am: importedDate,       // importedOn = actual lead creation date for Enpal
        letzte_aenderung: vd(l.lastEditOn),
        stromverbrauch_kwh: null,
        eigentuemer: null,
        e_auto_geplant: null,
        mvpp_id: l.mvpp_id || null,
        mvpp_name: l.mvpp_name || null,
        hat_termin,
        termin_datum: vd(s.date) || null,
        termin_status: hat_termin ? s.name : null,
        termin_feedback: null,
        hat_auftrag: c ? !c.storno_date : false,
        auftrag_nr: c?.dyn_offernum || null,
        auftrag_status: c?.currentstatus || null,
        auftrag_kwp: null,
        auftrag_netto: c?.calculated_realprice_netto ? parseFloat(c.calculated_realprice_netto) : null,
        storniert: c ? !!c.storno_date : false,
        sync_am: now,
        erstellt_am: importedDate || now,       // fallback to sync time only if importedOn missing
      };
    });

    // 4. Upsert in batches of 500
    let synced = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const r = await fetch(`${SU}/rest/v1/enpal_leads?on_conflict=leveto_id`, {
        method: 'POST',
        headers: { ...hd(), Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(batch)
      });
      if (r.ok || r.status === 201 || r.status === 200) synced += batch.length;
      else console.error('Upsert error:', (await r.text()).slice(0, 200));
    }

    return res.status(200).json({
      ok: true,
      synced,
      total: allLeads.length,
      contracts_matched: Object.keys(contractsByLead).length,
      duration_ms: Date.now() - startTime
    });

  } catch (err) {
    console.error('enpal-leads-sync error:', err);
    return res.status(500).json({ error: err.message });
  }
}
