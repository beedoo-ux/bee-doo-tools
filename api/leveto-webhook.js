// ══════════════════════════════════════════════════════════════
// bee-doo · Leveto Webhook Receiver
// Empfängt Status-Änderungen, Auftrags-Updates, User-Updates
// und schreibt in Supabase in Echtzeit
// ══════════════════════════════════════════════════════════════

const SB_URL = 'https://hqzpemfaljxcysyqssng.supabase.co';
const SB_SERVICE = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxenBlbWZhbGp4Y3lzeXFzc25nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTMzNTM5NywiZXhwIjoyMDg2OTExMzk3fQ.MJ3cyAAquE8DK2ngzfIIn4bTpQ8_H9DaeJ3YTlBdFz4';

// Webhook Secret – mit Leveto abstimmen
const WEBHOOK_SECRET = process.env.LEVETO_WEBHOOK_SECRET || 'beedoo_leveto_2026';

const sb = (path, opts = {}) => fetch(`${SB_URL}/rest/v1/${path}`, {
  ...opts,
  headers: {
    'apikey': SB_SERVICE,
    'Authorization': `Bearer ${SB_SERVICE}`,
    'Content-Type': 'application/json',
    'Prefer': opts.prefer || 'return=minimal',
    ...(opts.headers || {})
  }
});

export default async function handler(req, res) {
  // ── CORS ──
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Webhook-Secret');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // ── Auth ──
  const secret = req.headers['x-webhook-secret'] || req.query?.secret;
  if (secret !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }

  const body = req.body;
  if (!body || !body.event) {
    return res.status(400).json({ error: 'Missing event type in body' });
  }

  const { event, data } = body;
  const results = [];

  try {
    // ── 1) Log the event ──
    await sb('webhook_events', {
      method: 'POST',
      body: JSON.stringify({
        source: 'leveto',
        event_type: event,
        payload: body,
        leveto_lead_id: data?.lead_id || data?.leveto_id || null
      })
    });

    // ── 2) Process by event type ──
    switch (event) {

      // ═══════════════════════════════════════════
      // STATUS_CHANGED – Kernstück für Provisionen
      // ═══════════════════════════════════════════
      case 'status_changed': {
        const { lead_id, leveto_id, status_name, status_id, changed_at, changed_by } = data;

        // a) In status_history schreiben
        const histRes = await sb('leveto_status_history', {
          method: 'POST',
          body: JSON.stringify({
            leveto_lead_id: lead_id,
            leveto_id: leveto_id,
            status_name,
            status_id,
            status_datum: changed_at,
            geaendert_von: changed_by
          })
        });
        results.push({ action: 'status_history', ok: histRes.ok });

        // b) leveto_leads aktualisieren
        if (lead_id) {
          const updRes = await sb(`leveto_leads?id=eq.${lead_id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              status_name,
              status_id,
              status_datum: changed_at,
              letzter_status_wechsel: changed_at,
              sync_aktualisiert_am: new Date().toISOString()
            })
          });
          results.push({ action: 'lead_status_update', ok: updRes.ok });
        }

        // c) Bei "Termin gelegt" → provisionsrelevant!
        if (status_name && (
          status_name.toLowerCase().includes('termin gelegt') ||
          status_name.toLowerCase().includes('terminiert')
        )) {
          results.push({ action: 'termin_trigger', note: 'Provisionsrelevanter Status erkannt', status_name });
        }

        // d) Bei Storno → Warnung
        if (status_name && status_name.toLowerCase().includes('storn')) {
          results.push({ action: 'storno_warning', note: 'Storno erkannt!', lead_id });
        }

        break;
      }

      // ═══════════════════════════════════════════
      // ORDER_UPDATED – Auftragsdaten
      // ═══════════════════════════════════════════
      case 'order_updated': {
        const { lead_id, leveto_id, kwp, speicher_typ, speicher_kwh, angebotswert, vertragssumme,
                vertragsnummer, auftrag_nr, preismodell, wechselrichter, panel_typ, panel_anzahl } = data;

        const orderData = {
          leveto_lead_id: lead_id,
          leveto_id,
          ...(kwp != null && { kwp }),
          ...(speicher_typ && { speicher_typ }),
          ...(speicher_kwh != null && { speicher_kwh }),
          ...(angebotswert != null && { angebotswert }),
          ...(vertragssumme != null && { vertragssumme }),
          ...(vertragsnummer && { vertragsnummer }),
          ...(auftrag_nr && { auftrag_nr }),
          ...(preismodell && { preismodell }),
          ...(wechselrichter && { wechselrichter }),
          ...(panel_typ && { panel_typ }),
          ...(panel_anzahl != null && { panel_anzahl }),
          sync_aktualisiert_am: new Date().toISOString()
        };

        // Upsert: insert or update
        const ordRes = await sb('leveto_auftragsdaten', {
          method: 'POST',
          prefer: 'return=minimal,resolution=merge-duplicates',
          headers: { 'Prefer': 'return=minimal,resolution=merge-duplicates' },
          body: JSON.stringify(orderData)
        });
        results.push({ action: 'order_upsert', ok: ordRes.ok });

        // Customer-Record aktualisieren
        if (lead_id) {
          const custUpdate = {};
          if (kwp != null) custUpdate.kwp = kwp;
          if (vertragssumme != null) custUpdate.vertragssumme = vertragssumme;
          if (auftrag_nr) custUpdate.auftrag_nr = auftrag_nr;

          if (Object.keys(custUpdate).length > 0) {
            await sb(`customers?leveto_lead_id=eq.${lead_id}`, {
              method: 'PATCH',
              body: JSON.stringify(custUpdate)
            });
            results.push({ action: 'customer_update', fields: Object.keys(custUpdate) });
          }
        }

        break;
      }

      // ═══════════════════════════════════════════
      // MONTAGE_STATUS – Kanban-Board Updates
      // ═══════════════════════════════════════════
      case 'montage_updated': {
        const { lead_id, leveto_id, montage_status, montage_dc_datum, montage_ac_datum,
                netzanmeldung_status, inbetriebnahme_datum } = data;

        const montageData = {
          ...(montage_status && { montage_status }),
          ...(montage_dc_datum && { montage_dc_datum }),
          ...(montage_ac_datum && { montage_ac_datum }),
          ...(netzanmeldung_status && { netzanmeldung_status }),
          ...(inbetriebnahme_datum && { inbetriebnahme_datum }),
          sync_aktualisiert_am: new Date().toISOString()
        };

        if (lead_id) {
          await sb(`leveto_auftragsdaten?leveto_lead_id=eq.${lead_id}`, {
            method: 'PATCH',
            body: JSON.stringify(montageData)
          });

          // Customer montage_status updaten
          if (montage_status) {
            await sb(`customers?leveto_lead_id=eq.${lead_id}`, {
              method: 'PATCH',
              body: JSON.stringify({ montage_status })
            });
          }
        }

        results.push({ action: 'montage_update', ok: true });
        break;
      }

      // ═══════════════════════════════════════════
      // USER_SYNC – Benutzer/Mitarbeiter
      // ═══════════════════════════════════════════
      case 'user_sync': {
        const users = Array.isArray(data.users) ? data.users : [data];

        for (const u of users) {
          await sb('leveto_users', {
            method: 'POST',
            prefer: 'return=minimal,resolution=merge-duplicates',
            headers: { 'Prefer': 'return=minimal,resolution=merge-duplicates' },
            body: JSON.stringify({
              leveto_user_id: u.id,
              vorname: u.vorname || u.first_name,
              nachname: u.nachname || u.last_name,
              email: u.email,
              telefon: u.telefon || u.phone,
              rolle: u.rolle || u.role,
              team: u.team,
              aktiv: u.aktiv !== false,
              sync_aktualisiert_am: new Date().toISOString()
            })
          });
        }

        results.push({ action: 'user_sync', count: users.length });
        break;
      }

      // ═══════════════════════════════════════════
      // LEAD_CREATED / LEAD_UPDATED
      // ═══════════════════════════════════════════
      case 'lead_created':
      case 'lead_updated': {
        // Wird vom bestehenden Leveto-Sync handled
        results.push({ action: event, note: 'Delegated to leveto_sync' });
        break;
      }

      default:
        results.push({ action: 'unknown_event', event });
    }

    // Mark event as processed
    // (wir updaten den letzten Event dieses Typs)

    return res.status(200).json({
      ok: true,
      event,
      processed: results,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    // Log error
    await sb('webhook_events', {
      method: 'POST',
      body: JSON.stringify({
        source: 'leveto',
        event_type: `error_${event}`,
        payload: body,
        error: err.message
      })
    }).catch(() => {});

    return res.status(500).json({ error: err.message });
  }
}
