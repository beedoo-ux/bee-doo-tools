// api/nicht-erreicht.js
// Speichert Anrufversuch + sendet SMS nach 5 erfolglosen Versuchen

const SB_URL = 'https://hqzpemfaljxcysyqssng.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxenBlbWZhbGp4Y3lzeXFzc25nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzUzOTcsImV4cCI6MjA4NjkxMTM5N30.LSlMApceWuLk5MUctCGCVspXfYhc_As559aaoV2uSik';
const BASE_URL = 'https://bee-doo-tools.vercel.app';
const VERSUCH_LIMIT = 5;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const { lead_id, telefon, name, cc_agent, sid, token, smsSender } = req.body || {};
    if (!telefon) return res.status(400).json({ ok: false, error: 'Telefon fehlt' });

    const hdrs = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

    // 1. Versuch speichern
    const saveRes = await fetch(`${SB_URL}/rest/v1/cc_anrufversuche`, {
      method: 'POST',
      headers: { ...hdrs, Prefer: 'return=representation' },
      body: JSON.stringify({ lead_id: lead_id || null, telefon, cc_agent: cc_agent || 'CC', ergebnis: 'nicht_erreicht' }),
    });
    const saved = await saveRes.json();

    // 2. Alle Versuche fuer diese Nummer zaehlen
    const countRes = await fetch(
      `${SB_URL}/rest/v1/cc_anrufversuche?telefon=eq.${encodeURIComponent(telefon)}&select=id`,
      { headers: hdrs }
    );
    const alle = await countRes.json();
    const anzahl = Array.isArray(alle) ? alle.length : 0;

    // 3. Genau bei VERSUCH_LIMIT -> SMS senden (nur einmal, nicht bei jedem weiteren)
    let smsSent = false;
    let smsError = null;

    if (anzahl === VERSUCH_LIMIT && sid && token) {
      // Buchungslink mit Token
      const token64 = Buffer.from(`${lead_id || telefon}:${Date.now()}`).toString('base64url').slice(0, 20);
      const link = `${BASE_URL}/termin-buchen.html?token=${token64}&tel=${encodeURIComponent(telefon)}&name=${encodeURIComponent(name || '')}`;

      // Nummer normalisieren
      let toNum = telefon.replace(/\s+/g, '');
      if (!toNum.startsWith('+')) toNum = toNum.startsWith('0') ? '+49' + toNum.slice(1) : '+49' + toNum;

      const vorname = (name || '').split(' ')[0] || 'Hallo';
      const smsText = `${vorname}, wir haben Sie ${anzahl}x versucht zu erreichen.\n\nHaben Sie noch Interesse an einer kostenlosen Solar-Beratung? Dann buchen Sie hier einfach selbst einen Termin:\n\n${link}\n\nIhr bee-doo Team`;

      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
      const auth = Buffer.from(`${sid}:${token}`).toString('base64');
      const smsRes = await fetch(twilioUrl, {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: toNum, From: smsSender || '+4915888651131', Body: smsText }).toString(),
      });
      const smsData = await smsRes.json();
      smsSent = !!smsData.sid;
      if (!smsSent) smsError = smsData.message || 'SMS fehlgeschlagen';

      // Letzten Versuch aktualisieren
      if (saved[0]?.id) {
        await fetch(`${SB_URL}/rest/v1/cc_anrufversuche?id=eq.${saved[0].id}`, {
          method: 'PATCH',
          headers: hdrs,
          body: JSON.stringify({ ergebnis: smsSent ? 'sms_gesendet' : 'nicht_erreicht', notiz: smsSent ? `SMS nach ${anzahl} Versuchen gesendet` : smsError }),
        });
      }
    }

    return res.json({
      ok: true,
      anzahl_versuche: anzahl,
      sms_gesendet: smsSent,
      sms_fehler: smsError,
      limit: VERSUCH_LIMIT,
      naechste_aktion: anzahl < VERSUCH_LIMIT ? `Noch ${VERSUCH_LIMIT - anzahl} Versuch(e) bis SMS` : (anzahl === VERSUCH_LIMIT ? 'SMS wurde jetzt gesendet' : 'SMS bereits gesendet'),
    });

  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
