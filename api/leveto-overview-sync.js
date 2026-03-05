// api/leveto-overview-sync.js
// Syncs leads + contracts + workflows + workflow_history from Leveto Overview API → Supabase
// Cron: every 15 minutes (delta via last_update param)

const SU = 'https://hqzpemfaljxcysyqssng.supabase.co';
const SK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxenBlbWZhbGp4Y3lzeXFzc25nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTMzNTM5NywiZXhwIjoyMDg2OTExMzk3fQ.MJ3cyAAquE8DK2ngzfIIn4bTpQ8_H9DaeJ3YTlBdFz4';
const LU = 'https://beedoo.leveto.net/API';

export const config = { maxDuration: 120 };

const hd = () => ({ apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' });

function vd(d) {
  if (!d || d === '0000-00-00' || d === '0000-00-00 00:00:00' || d === 'XXX' || d === 'None' || d === 'null') return null;
  return d;
}

function safeJson(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') { try { return JSON.parse(val); } catch { return []; } }
  return [];
}

function mapLead(l, now) {
  return {
    leveto_id:              l.id,
    id_extern:              l.id_extern || null,
    vorname:                (l.vorname || '').trim() || null,
    nachname:               (l.nachname || '').trim() || null,
    email:                  l.email || null,
    plz:                    l.plz || null,
    ort:                    l.stadt || null,
    quelle:                 l.quelle || null,
    berater_name:           l.berater || null,
    berater_ma_nummer:      l.berater_ma_nummer || null,
    status_name:            l.leadstatus || null,
    mvpp_id:                l.mvp_id || null,
    mvpp_name:              l.mvp_nummer || null,
    metrify:                l.metrify || null,
    leveto_importiert_am:   vd(l.importiert),
    leveto_erstellt_am:     vd(l.importiert),
    sync_aktualisiert_am:   now,
  };
}

function computeFromProducts(products) {
  const prods = safeJson(products);
  if (!prods.length) return {};

  let kwp = 0, moduleCount = 0, moduleTyp = null, batteryKap = 0;

  for (const p of prods) {
    const watt = parseFloat(p.watt) || 0;
    const amount = parseFloat(p.amount) || 0;
    if (watt > 0 && amount > 0) {
      kwp += (watt * amount) / 1000;
      moduleCount += amount;
      if (!moduleTyp && p.productname) moduleTyp = p.productname;
    }
    if (p.battery) batteryKap += parseFloat(p.battery) || 0;
  }

  return {
    kwp: kwp > 0 ? Math.round(kwp * 100) / 100 : null,
    module_anzahl: moduleCount > 0 ? Math.round(moduleCount) : null,
    module_typ: moduleTyp,
    battery_kap: batteryKap > 0 ? batteryKap : null,
  };
}

function extractWfSteps(workflows, contractId) {
  const wfs = safeJson(workflows);
  const result = {};
  for (const w of wfs) {
    if (w.offerID !== contractId) continue;
    const name = (w.workflow || '').toLowerCase().replace(/[^a-z]/g, '');
    const step = (w.current_step || '').replace(/<br\s*\/?>/gi, ' ').trim();
    const changed = vd(w.step_changed);
    if (name.includes('verkauf') || name.includes('verkäufer')) {
      result.wf_verkauf_step = step; result.wf_verkauf_changed = changed;
    } else if (name === 'beedoo' || name.includes('beedoo')) {
      result.wf_beedoo_step = step; result.wf_beedoo_changed = changed;
    } else if (name.includes('dc')) {
      result.wf_dc_step = step; result.wf_dc_changed = changed;
    } else if (name.includes('ac')) {
      result.wf_ac_step = step; result.wf_ac_changed = changed;
    }
  }
  return result;
}

function mapContract(c, leadId, leadWorkflows, leadWfHistory, now) {
  const products = safeJson(c.products);
  const computed = computeFromProducts(products);
  const allWfs = safeJson(leadWorkflows);
  const wfSteps = extractWfSteps(allWfs, c.id);

  // Filter workflows relevant to this contract
  const contractWfs = allWfs.filter(w => w.offerID === c.id);
  const allHistory = safeJson(leadWfHistory);

  // Determine ist_waermepumpe from typeicons
  const icons = c.typeicons;
  const iconStr = Array.isArray(icons) ? icons.join(' ') : (typeof icons === 'string' ? icons : '');
  const istHP = iconStr.includes('fa-fire') || iconStr.includes('HP');

  // auftragsstatus: derive from Verkäuferboard workflow if API returns XXX
  let auftragsstatus = vd(c.auftragsstatus);
  if (!auftragsstatus && wfSteps.wf_verkauf_step) {
    auftragsstatus = wfSteps.wf_verkauf_step;
  }

  // Ensure all contract rows have same keys for Supabase batch upsert
  const ALL_KEYS = ['leveto_id','lead_id','dyn_offernum','ersteller','creator_ma_number',
    'calculated_realprice_netto','calculated_realprice_brutto','creation_date','accepted_date',
    'pdf_url','typeicons','ist_waermepumpe','products','provision_ausgezahlt_am',
    'efs_prozent','currentstatus','speichererweiterung','workflows','workflow_history',
    'kwp','module_anzahl','module_typ','battery_kap',
    'wf_verkauf_step','wf_verkauf_changed','wf_beedoo_step','wf_beedoo_changed',
    'wf_dc_step','wf_dc_changed','wf_ac_step','wf_ac_changed',
    'overview_lead_id','overview_last_update','sync_aktualisiert_am'];

  const raw = {
    leveto_id:                c.id,
    lead_id:                  leadId,
    dyn_offernum:             c.dyn_offernum || null,
    ersteller:                c.creator || null,
    creator_ma_number:        c.creator_ma_number || null,
    calculated_realprice_netto:  c.an_netto || null,
    calculated_realprice_brutto: c.an_brutto || null,
    creation_date:            vd(c.creation_date),
    accepted_date:            vd(c.accepted_date),
    pdf_url:                  c.pdf_url || null,
    typeicons:                c.typeicons ? (Array.isArray(c.typeicons) ? c.typeicons : [c.typeicons]) : null,
    ist_waermepumpe:          istHP,
    products:                 products.length ? products : null,
    provision_ausgezahlt_am:  vd(c.provision_ausgezahlt_am),
    efs_prozent:              c.efs_prozent ? parseFloat(c.efs_prozent) : null,
    currentstatus:            auftragsstatus,
    speichererweiterung:      vd(c.speichererweiterung),
    workflows:                contractWfs.length ? contractWfs : null,
    workflow_history:         allHistory.length ? allHistory : null,
    ...computed,
    ...wfSteps,
    overview_lead_id:         leadId,
    overview_last_update:     now,
    sync_aktualisiert_am:     now,
  };
  // Normalize: every row must have every key
  const result = {};
  for (const k of ALL_KEYS) result[k] = raw[k] !== undefined ? raw[k] : null;
  return result;
}

async function sbUpsert(table, rows, conflict, batchSize = 500) {
  let ok = 0, err = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const r = await fetch(`${SU}/rest/v1/${table}?on_conflict=${conflict}`, {
      method: 'POST',
      headers: { ...hd(), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(batch)
    });
    if (r.ok) { ok += batch.length; }
    else {
      err++;
      const t = await r.text();
      console.error(`${table} batch ${i} error:`, t.slice(0, 200));
    }
    if (i + batchSize < rows.length) await new Promise(r => setTimeout(r, 50));
  }
  return { ok, err };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = req.headers.authorization;
  if (auth !== 'Bearer manual' && req.headers['x-vercel-cron'] !== '1' && auth !== `Bearer ${SK}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const t0 = Date.now();
  const mode = req.query.mode || 'delta'; // delta (default) or full

  try {
    // 1. Auth
    const authR = await fetch(`${LU}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'api@bee-doo.de', password: 'Patrick123456789!' }).toString()
    });
    const authD = await authR.json();
    if (!authD.token) throw new Error('Leveto auth failed: ' + JSON.stringify(authD));

    // 2. Get last sync timestamp for delta mode
    let lastUpdate = null;
    if (mode === 'delta') {
      const stateR = await fetch(`${SU}/rest/v1/leveto_sync_state?sync_type=eq.overview_delta&select=last_update&limit=1`, {
        headers: hd()
      });
      const stateD = await stateR.json();
      if (stateD?.[0]?.last_update) {
        lastUpdate = stateD[0].last_update.replace('T', ' ').replace(/\+.*/, '');
      }
    }

    // 3. Fetch Overview (paginated for delta, or full)
    let allLeads = [];
    let page = 1;
    let totalPages = 1;

    do {
      let url = `${LU}/overview?limit=200&page=${page}`;
      if (lastUpdate) url += `&last_update=${encodeURIComponent(lastUpdate)}`;

      const ovR = await fetch(url, { headers: { Authorization: `Bearer ${authD.token}` } });
      if (!ovR.ok) throw new Error(`Overview HTTP ${ovR.status} on page ${page}`);
      const ovD = await ovR.json();

      const leads = ovD.data || [];
      allLeads.push(...leads);
      totalPages = ovD.totalpages || 1;
      page++;

      if (page <= totalPages) await new Promise(r => setTimeout(r, 100));
    } while (page <= totalPages);

    if (!allLeads.length) {
      return res.status(200).json({ ok: true, synced: 0, contracts: 0, msg: 'No updates' });
    }

    const now = new Date().toISOString();

    // 4. Map leads
    const leadRows = allLeads.map(l => mapLead(l, now));

    // 5. Map contracts + compute derived fields
    const contractRows = [];
    const wfHistoryRows = [];

    for (const lead of allLeads) {
      const contracts = safeJson(lead.contracts);
      const leadWfs = lead.workflows;
      const leadWfH = lead.workflow_history;

      for (const c of contracts) {
        if (!c.id) continue;
        contractRows.push(mapContract(c, lead.id, leadWfs, leadWfH, now));

        // Parse workflow_history into individual rows
        const history = safeJson(leadWfH);
        for (const h of history) {
          if (!h.date || !h.change) continue;
          // Parse "BoardName: StepA > StepB"
          const match = h.change.match(/^([^:]+):\s*(.+?)\s*>\s*(.+)$/);
          wfHistoryRows.push({
            lead_id: lead.id,
            contract_id: c.id,
            datum: h.date,
            board_name: match ? match[1].trim() : null,
            von_step: match ? match[2].trim() : null,
            nach_step: match ? match[3].trim() : h.change,
            change_raw: h.change,
          });
        }
      }
    }

    // 6. Upsert all
    const leadResult = await sbUpsert('leveto_leads', leadRows, 'leveto_id');
    const contractResult = contractRows.length
      ? await sbUpsert('leveto_contracts', contractRows, 'leveto_id')
      : { ok: 0, err: 0 };

    // Workflow history: deduplicate by lead_id + contract_id + datum + change_raw
    // Use smaller batches and skip if too many
    let wfhResult = { ok: 0, err: 0 };
    if (wfHistoryRows.length > 0 && wfHistoryRows.length < 5000) {
      wfhResult = await sbUpsert('leveto_workflow_history', wfHistoryRows, 'lead_id,contract_id,datum,change_raw');
    }

    // 7. Update sync state
    await fetch(`${SU}/rest/v1/leveto_sync_state?sync_type=eq.overview_delta`, {
      method: 'PATCH',
      headers: hd(),
      body: JSON.stringify({
        last_update: now,
        last_run: now,
        total_synced: leadResult.ok,
        status: 'done',
        details: JSON.stringify({
          leads: leadResult.ok,
          contracts: contractResult.ok,
          wf_history: wfhResult.ok,
          errors: leadResult.err + contractResult.err,
          duration_ms: Date.now() - t0,
          mode,
          pages_fetched: page - 1
        })
      })
    });

    return res.status(200).json({
      ok: true,
      leads: leadResult.ok,
      contracts: contractResult.ok,
      wf_history: wfhResult.ok,
      errors: leadResult.err + contractResult.err + wfhResult.err,
      pages: page - 1,
      duration_ms: Date.now() - t0
    });

  } catch (err) {
    console.error('leveto-overview-sync error:', err);
    return res.status(500).json({ error: err.message, duration_ms: Date.now() - t0 });
  }
}
