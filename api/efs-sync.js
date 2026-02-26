// =============================================================================
// EFS → Supabase Daily Sync  |  Vercel Cron Job
// Wird täglich um 05:00 UTC (06:00 DE) ausgeführt
// =============================================================================

const SUPABASE_URL = 'https://hqzpemfaljxcysyqssng.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxenBlbWZhbGp4Y3lzeXFzc25nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzUzOTcsImV4cCI6MjA4NjkxMTM5N30.LSlMApceWuLk5MUctCGCVspXfYhc_As559aaoV2uSik';
const EFS_BASE = 'https://app.efs.de/api/trpc';

export const config = { maxDuration: 300 }; // 5 Min max (Vercel Pro)

// ─── Helpers ────────────────────────────────────────────────────────────────

async function efsRequest(endpoint, params, token) {
  const url = `${EFS_BASE}/${endpoint}?input=${encodeURIComponent(JSON.stringify({ json: params }))}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error(`EFS ${endpoint}: ${resp.status}`);
  const data = await resp.json();
  return data.result?.data?.json;
}

async function supabaseUpsert(rows) {
  // Upsert in chunks of 200
  const chunkSize = 200;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/efs_projekte?on_conflict=efs_id`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(chunk),
    });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Supabase upsert chunk ${i}: ${resp.status} – ${err}`);
    }
    upserted += chunk.length;
  }
  return upserted;
}

// ─── Phase 1: List-API → Basisdaten ─────────────────────────────────────────

async function fetchAllProjects(token) {
  const projects = [];
  const pageSize = 100;
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const data = await efsRequest('project.list', {
      filters: [{ field: 'archived', value: false }],
      sort: { field: 'statusUpdatedAt', direction: 'desc' },
      search: '',
      pagination: { page, pageSize },
    }, token);

    const items = data?.items || [];
    projects.push(...items);
    hasMore = items.length === pageSize;
    page++;
  }
  return projects;
}

function mapListProject(p) {
  const c = p.primaryCustomer || {};
  const s = p.secondaryCustomer || {};
  const u = p.user || {};
  return {
    efs_id: p.id,
    status: p.status,
    simplified_status: p.simplifiedStatus,
    contract_status: p.contractStatus,
    kunde_vorname: c.firstName || null,
    kunde_nachname: c.lastName || null,
    kunde_name: [c.firstName, c.lastName].filter(Boolean).join(' ') || null,
    kunde_email: c.email || null,
    kunde_telefon: c.phoneNumber ? `${c.countryCode || ''}${c.phoneNumber}` : null,
    kunde_strasse: c.street || null,
    kunde_hausnr: c.houseNumber || null,
    kunde_plz: c.postalCode || null,
    kunde_stadt: c.city?.trim() || null,
    zweitkunde_name: s.firstName ? `${s.firstName} ${s.lastName || ''}`.trim() : null,
    zweitkunde_email: s.email || null,
    projekt_strasse: p.street || null,
    projekt_hausnr: p.houseNumber || null,
    projekt_plz: p.postalCode || null,
    projekt_stadt: p.city?.trim() || null,
    gesamtpreis_eur: p.totalAmount ? p.totalAmount / 100 : null,
    zustaendiger: [u.firstName, u.secondName].filter(Boolean).join(' ') || null,
    zustaendiger_email: u.email || null,
    co_signed_at: p.coSignedAt || null,
    status_updated_at: p.statusUpdatedAt || null,
    blocked: p.blocked || false,
    geaendert_am: new Date().toISOString(),
  };
}

// ─── Phase 2: Detail-API → Komponenten + Finanzen ───────────────────────────

async function fetchProjectDetail(id, token) {
  return efsRequest('project.get', { id }, token);
}

function mapDetailProject(detail) {
  const contract = detail.contract || {};
  const product = contract.product || {};
  const solar = contract.solarSystem || {};
  const components = solar.projectComponents || [];

  const pv = components.find((x) => x.systemComponent?.type === 'pv') || {};
  const wr = components.find((x) => x.systemComponent?.type === 'inverter') || {};
  const bat = components.find((x) => x.systemComponent?.type === 'battery') || {};
  const wb = components.find((x) => x.systemComponent?.type === 'wallbox') || {};

  const pvKwp = pv.count && pv.unitValue ? (pv.count * pv.unitValue) / 1000 : null;

  return {
    efs_id: detail.id,
    monatl_rate_eur: contract.rate ? contract.rate / 100 : null,
    preismodell: product.name || null,
    nominalzins: product.nominalRate || null,
    factoringrate: product.factoringRate || null,
    efs_auszahlung_eur:
      contract.totalAmount && product.factoringRate
        ? (contract.totalAmount * (1 - product.factoringRate)) / 100
        : null,
    pv_hersteller: pv.systemComponent?.brand || null,
    pv_anzahl: pv.count || null,
    pv_watt: pv.unitValue || null,
    pv_kwp: pvKwp,
    wr_hersteller: wr.systemComponent?.brand || null,
    wr_kw: wr.unitValue || null,
    bat_hersteller: bat.systemComponent?.brand || null,
    bat_kwh: bat.unitValue || null,
    wb_hersteller: wb.systemComponent?.brand || null,
    wb_kw: wb.unitValue || null,
    installed_at: solar.installedAt || null,
    grid_connected_at: solar.gridConnectedAt || null,
    rejection_reason: detail.rejectionReason || null,
  };
}

// ─── Phase 3: CSV generieren + Supabase Storage ────────────────────────────

function generateCsv(rows) {
  const headers = [
    'EFS_ID','Status','SimplifiedStatus','ContractStatus',
    'Kunde_Vorname','Kunde_Nachname','Kunde_Email','Kunde_Telefon',
    'Kunde_Strasse','Kunde_HausNr','Kunde_PLZ','Kunde_Stadt',
    'Zweitkunde','Zweitkunde_Email',
    'Projekt_Strasse','Projekt_HausNr','Projekt_PLZ','Projekt_Stadt',
    'Gesamtpreis_EUR','Monatl_Rate_EUR','Preismodell','Nominalzins','Factoringrate',
    'EFS_Auszahlung_EUR',
    'PV_Hersteller','PV_Anzahl','PV_Watt','PV_kWp',
    'WR_Hersteller','WR_kW','Batterie_Hersteller','Batterie_kWh',
    'Wallbox_Hersteller','Wallbox_kW',
    'Zustaendiger','Zustaendiger_Email',
    'CoSignedAt','StatusUpdatedAt','InstalledAt','GridConnectedAt',
    'Blocked','Ablehnungsgrund',
  ];

  const csvRows = rows.map((r) =>
    headers
      .map((h) => {
        const key = h.toLowerCase().replace(/[^a-z0-9]/g, '_');
        // Map header to db column
        const colMap = {
          efs_id: r.efs_id, status: r.status, simplifiedstatus: r.simplified_status,
          contractstatus: r.contract_status,
          kunde_vorname: r.kunde_vorname, kunde_nachname: r.kunde_nachname,
          kunde_email: r.kunde_email, kunde_telefon: r.kunde_telefon,
          kunde_strasse: r.kunde_strasse, kunde_hausnr: r.kunde_hausnr,
          kunde_plz: r.kunde_plz, kunde_stadt: r.kunde_stadt,
          zweitkunde: r.zweitkunde_name, zweitkunde_email: r.zweitkunde_email,
          projekt_strasse: r.projekt_strasse, projekt_hausnr: r.projekt_hausnr,
          projekt_plz: r.projekt_plz, projekt_stadt: r.projekt_stadt,
          gesamtpreis_eur: r.gesamtpreis_eur, monatl_rate_eur: r.monatl_rate_eur,
          preismodell: r.preismodell, nominalzins: r.nominalzins,
          factoringrate: r.factoringrate, efs_auszahlung_eur: r.efs_auszahlung_eur,
          pv_hersteller: r.pv_hersteller, pv_anzahl: r.pv_anzahl,
          pv_watt: r.pv_watt, pv_kwp: r.pv_kwp,
          wr_hersteller: r.wr_hersteller, wr_kw: r.wr_kw,
          batterie_hersteller: r.bat_hersteller, batterie_kwh: r.bat_kwh,
          wallbox_hersteller: r.wb_hersteller, wallbox_kw: r.wb_kw,
          zustaendiger: r.zustaendiger, zustaendiger_email: r.zustaendiger_email,
          cosignedat: r.co_signed_at, statusupdatedat: r.status_updated_at,
          installedat: r.installed_at, gridconnectedat: r.grid_connected_at,
          blocked: r.blocked, ablehnungsgrund: r.rejection_reason,
        };
        const val = colMap[key] ?? '';
        return `"${String(val == null ? '' : val).replace(/"/g, '""')}"`;
      })
      .join(',')
  );

  return '\ufeff' + [headers.join(','), ...csvRows].join('\n');
}

async function uploadCsvToStorage(csvContent, filename) {
  const resp = await fetch(
    `${SUPABASE_URL}/storage/v1/object/efs-exports/${filename}`,
    {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'text/csv',
        'x-upsert': 'true',
      },
      body: csvContent,
    }
  );
  if (!resp.ok) {
    // Bucket may not exist, try to create it
    if (resp.status === 404 || resp.status === 400) {
      await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: 'efs-exports', name: 'efs-exports', public: true }),
      });
      // Retry upload
      const retry = await fetch(
        `${SUPABASE_URL}/storage/v1/object/efs-exports/${filename}`,
        {
          method: 'POST',
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'text/csv',
            'x-upsert': 'true',
          },
          body: csvContent,
        }
      );
      return retry.ok;
    }
    return false;
  }
  return true;
}

// ─── Main Handler ───────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const startTime = Date.now();
  const log = [];
  const addLog = (msg) => { log.push(`[${((Date.now() - startTime) / 1000).toFixed(1)}s] ${msg}`); };

  // Auth check (einfacher CRON_SECRET oder Vercel Cron header)
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  const vercelCron = req.headers['x-vercel-cron']; // Automatisch von Vercel gesetzt

  if (!vercelCron && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const efsToken = process.env.EFS_BEARER_TOKEN;
  if (!efsToken) {
    return res.status(500).json({ error: 'EFS_BEARER_TOKEN nicht konfiguriert' });
  }

  try {
    // ── Phase 1: List fetch ──
    addLog('Phase 1: Lade EFS Projektliste...');
    const listProjects = await fetchAllProjects(efsToken);
    addLog(`${listProjects.length} Projekte aus EFS geladen`);

    const listRows = listProjects.map(mapListProject);
    const upsertedList = await supabaseUpsert(listRows);
    addLog(`${upsertedList} Basisdatensätze in Supabase upserted`);

    // ── Phase 2: Detail fetch (nur fehlende Komponenten) ──
    addLog('Phase 2: Lade Komponentendetails...');

    // Finde Projekte ohne PV-Daten in Supabase
    const existingResp = await fetch(
      `${SUPABASE_URL}/rest/v1/efs_projekte?pv_kwp=is.null&select=efs_id&limit=500`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const missingDetails = await existingResp.json();
    const idsToEnrich = missingDetails.map((r) => r.efs_id);

    // Auch alle Projekte mit Status-Änderung enrichen (für updated installed_at etc.)
    const recentResp = await fetch(
      `${SUPABASE_URL}/rest/v1/efs_projekte?status_updated_at=gte.${new Date(Date.now() - 7 * 86400000).toISOString()}&select=efs_id&limit=200`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const recentProjects = await recentResp.json();
    const recentIds = recentProjects.map((r) => r.efs_id);

    const allEnrichIds = [...new Set([...idsToEnrich, ...recentIds])];
    addLog(`${allEnrichIds.length} Projekte brauchen Detail-Enrichment (${idsToEnrich.length} ohne kWp + ${recentIds.length} kürzlich geändert)`);

    // Fetch details in batches of 5
    const detailRows = [];
    const batchSize = 5;
    let errors = 0;

    for (let i = 0; i < allEnrichIds.length; i += batchSize) {
      // Timeout-Schutz: nach 240s aufhören
      if (Date.now() - startTime > 240000) {
        addLog(`Timeout-Schutz: Stoppe nach ${detailRows.length} Details`);
        break;
      }

      const batch = allEnrichIds.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (id) => {
          try {
            const detail = await fetchProjectDetail(id, efsToken);
            return mapDetailProject(detail);
          } catch (e) {
            errors++;
            return null;
          }
        })
      );

      results.filter(Boolean).forEach((r) => detailRows.push(r));
      await new Promise((r) => setTimeout(r, 100));
    }

    if (detailRows.length > 0) {
      const upsertedDetails = await supabaseUpsert(detailRows);
      addLog(`${upsertedDetails} Detaildatensätze aktualisiert (${errors} Fehler)`);
    }

    // ── Phase 3: CSV generieren ──
    addLog('Phase 3: CSV generieren...');

    // Lade vollständige Daten aus Supabase (alle Zeilen)
    const allDataResp = await fetch(
      `${SUPABASE_URL}/rest/v1/efs_projekte?select=*&order=status_updated_at.desc&limit=5000`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Range: '0-4999' } }
    );
    const allData = await allDataResp.json();

    const csv = generateCsv(allData);
    const today = new Date().toISOString().slice(0, 10);
    const filename = `EFS_Export_${today}.csv`;

    const uploaded = await uploadCsvToStorage(csv, filename);
    // Auch latest.csv überschreiben
    await uploadCsvToStorage(csv, 'latest.csv');

    const csvUrl = uploaded
      ? `${SUPABASE_URL}/storage/v1/object/public/efs-exports/${filename}`
      : null;
    const latestUrl = `${SUPABASE_URL}/storage/v1/object/public/efs-exports/latest.csv`;

    addLog(`CSV: ${allData.length} Zeilen → ${uploaded ? 'hochgeladen' : 'Fehler beim Upload'}`);
    addLog(`Fertig in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

    return res.status(200).json({
      success: true,
      summary: {
        totalProjects: listProjects.length,
        basisdatenUpserted: upsertedList,
        detailsEnriched: detailRows.length,
        detailErrors: errors,
        csvRows: allData.length,
        csvUrl,
        latestCsvUrl: latestUrl,
        durationSeconds: ((Date.now() - startTime) / 1000).toFixed(1),
      },
      log,
    });
  } catch (error) {
    addLog(`FEHLER: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message, log });
  }
}
