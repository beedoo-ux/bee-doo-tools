// api/enpal-leads-sync.js
// Syncs Enpal leads from leveto_leads + leveto_contracts → enpal_leads
// Runs every 15 minutes via Vercel cron

const SU = 'https://hqzpemfaljxcysyqssng.supabase.co';
const SK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxenBlbWZhbGp4Y3lzeXFzc25nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTMzNTM5NywiZXhwIjoyMDg2OTExMzk3fQ.MJ3cyAAquE8DK2ngzfIIn4bTpQ8_H9DaeJ3YTlBdFz4';
const hd = () => ({ apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' });

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Auth check
  const auth = req.headers.authorization;
  if (auth !== 'Bearer manual' && req.headers['x-vercel-cron'] !== '1' && auth !== `Bearer ${SK}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const startTime = Date.now();

  try {
    // 1. Fetch all Enpal leads from leveto_leads (paginated)
    const leads = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const r = await fetch(
        `${SU}/rest/v1/leveto_leads?select=*&quelle=ilike.Enpal*&limit=${pageSize}&offset=${offset}`,
        { headers: hd() }
      );
      const batch = await r.json();
      if (!Array.isArray(batch) || !batch.length) break;
      leads.push(...batch);
      if (batch.length < pageSize) break;
      offset += pageSize;
    }

    if (!leads.length) {
      return res.status(200).json({ ok: true, synced: 0, msg: 'No Enpal leads found in leveto_leads' });
    }

    // 2. Fetch all contracts for these leads (to get hat_auftrag, auftrag_status, etc.)
    const leadIds = leads.map(l => l.leveto_id).filter(Boolean);
    const contracts = [];
    // Fetch in batches of 500
    for (let i = 0; i < leadIds.length; i += 500) {
      const batch = leadIds.slice(i, i + 500);
      const idList = batch.join(',');
      const r = await fetch(
        `${SU}/rest/v1/leveto_contracts?select=lead_id,dyn_offernum,currentstatus,calculated_realprice_netto,calculated_realprice_brutto,storno_date&lead_id=in.(${idList})`,
        { headers: hd() }
      );
      const data = await r.json();
      if (Array.isArray(data)) contracts.push(...data);
    }

    // Index contracts by lead_id (most recent wins)
    const contractsByLead = {};
    for (const c of contracts) {
      if (!c.lead_id) continue;
      // Prefer non-storniert contracts; if tie, just overwrite
      const existing = contractsByLead[c.lead_id];
      if (!existing || (!c.storno_date && existing.storno_date)) {
        contractsByLead[c.lead_id] = c;
      }
    }

    // 3. Map to enpal_leads schema
    const now = new Date().toISOString();
    const rows = leads.map(l => {
      const c = contractsByLead[l.leveto_id] || null;
      const vd = d => d && d !== '0000-00-00' && d !== '0000-00-00 00:00:00' ? d : null;

      // Determine hat_termin from status
      const terminiertStatuses = ['Terminiert', 'Angebot erstellt', 'Angebot angenommen', 'AB erstellt', 'Kontakt/Angebot per Mail'];
      const hat_termin = terminiertStatuses.includes(l.status_name);

      return {
        leveto_id: l.leveto_id,
        status_name: l.status_name || null,
        status_indicator: l.status_indicator || null,
        quelle: l.quelle || null,
        berater_name: l.berater_name || null,
        kunde_vorname: l.vorname || null,
        kunde_nachname: l.nachname || null,
        plz: l.plz || null,
        ort: l.ort || null,
        telefon: l.telefon || null,
        email: l.email || null,
        notizen: l.notizen || null,
        leveto_erstellt_am: vd(l.leveto_erstellt_am),
        letzte_aenderung: vd(l.leveto_letzte_bearbeitung),
        stromverbrauch_kwh: l.stromverbrauch_kwh || null,
        eigentuemer: l.eigentuemer || null,
        e_auto_geplant: l.e_auto_geplant || null,
        mvpp_id: l.mvpp_id || null,
        mvpp_name: l.mvpp_name || null,
        hat_termin: hat_termin,
        termin_datum: vd(l.status_datum) || null,
        termin_status: hat_termin ? l.status_name : null,
        termin_feedback: null, // not available in leveto_leads API
        hat_auftrag: c ? !c.storno_date : false,
        auftrag_nr: c?.dyn_offernum || null,
        auftrag_status: c?.currentstatus || null,
        auftrag_kwp: l.efs_pv_kwp || null,
        auftrag_netto: c?.calculated_realprice_netto || null,
        storniert: c ? !!c.storno_date : false,
        sync_am: now,
        erstellt_am: vd(l.leveto_erstellt_am) || now,
      };
    });

    // 4. Upsert in batches of 500
    let synced = 0;
    const batchSize = 500;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const r = await fetch(
        `${SU}/rest/v1/enpal_leads?on_conflict=leveto_id`,
        {
          method: 'POST',
          headers: { ...hd(), Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(batch)
        }
      );
      if (r.ok || r.status === 201 || r.status === 200) {
        synced += batch.length;
      } else {
        const err = await r.text();
        console.error('Upsert error:', err.slice(0, 200));
      }
    }

    // 5. Delete stale rows (leads that no longer have Enpal source in Leveto)
    // Skip for safety - just update existing + add new

    const duration_ms = Date.now() - startTime;
    return res.status(200).json({
      ok: true,
      synced,
      total: rows.length,
      contracts_found: contracts.length,
      duration_ms
    });

  } catch (err) {
    console.error('enpal-leads-sync error:', err);
    return res.status(500).json({ error: err.message });
  }
}
