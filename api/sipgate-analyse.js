// api/sipgate-analyse.js
// Claude analysiert Sipgate-Transkript → füllt bee-doo Fragebogen
// POST { callId, text, from, to, duration }

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://hqzpemfaljxcysyqssng.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// Rufnummer normalisieren für Lead-Suche
function normalizePhone(nr) {
  let n = (nr || '').replace(/[^0-9+]/g, '');
  if (n.startsWith('49')) n = '0' + n.slice(2);
  if (n.startsWith('+49')) n = '0' + n.slice(3);
  return n;
}

// Lead in Leveto/Supabase per Telefonnummer suchen
async function findLead(phone, supabase) {
  const norm = normalizePhone(phone);
  if (!norm || norm.length < 6) return null;

  const { data } = await supabase
    .from('leveto_leads')
    .select('id, vorname, nachname, telefon, mobil, plz, stadt, strasse')
    .or(`telefon.ilike.%${norm.slice(-8)},mobil.ilike.%${norm.slice(-8)}`)
    .limit(1)
    .single();

  return data || null;
}

// Claude: Transkript → strukturierter Fragebogen
async function analyseWithClaude(text, lead) {
  const leadHint = lead
    ? `Bekannter Lead: ${lead.vorname} ${lead.nachname}, ${lead.strasse}, ${lead.plz} ${lead.stadt}, Tel: ${lead.telefon}`
    : 'Kein Lead gefunden — Daten vollständig aus Gespräch extrahieren.';

  const prompt = `Du bist ein Assistent bei bee-doo GmbH, einem Solar-Vertriebsunternehmen in NRW.
Analysiere das folgende Callcenter-Transkript und extrahiere alle relevanten Informationen für den Kundenfragebogen.

${leadHint}

TRANSKRIPT:
---
${text}
---

Antworte NUR mit einem JSON-Objekt (kein Markdown, keine Erklärungen) mit folgender Struktur:

{
  "stammdaten": {
    "vorname": "",
    "nachname": "",
    "strasse": "",
    "hausnummer": "",
    "plz": "",
    "stadt": "",
    "telefon": "",
    "mobil": "",
    "email": ""
  },
  "haushalt": {
    "gebaeude_typ": "",
    "eigentuemer": null,
    "personen_haushalt": null,
    "dach_groesse_m2": null,
    "dach_ausrichtung": "",
    "dach_material": "",
    "stromverbrauch_kwh": null,
    "heizung_typ": ""
  },
  "interesse": {
    "pv_anlage": null,
    "speicher": null,
    "waermepumpe": null,
    "wallbox": null,
    "gwp_kwp_gewuenscht": null,
    "budget_vorstellung": "",
    "foerderung_interesse": null
  },
  "termin": {
    "termin_vereinbart": null,
    "termin_datum": "",
    "termin_uhrzeit": "",
    "berater_wunsch": "",
    "termin_notiz": ""
  },
  "qualitaet": {
    "stimmung": "",
    "stimmung_score": null,
    "einwaende": [],
    "einwand_reaktion": "",
    "abschlusswahrscheinlichkeit": null,
    "notizen": "",
    "gespraech_qualitaet": ""
  },
  "meta": {
    "zusammenfassung": "",
    "konfidenz": null,
    "fehlende_infos": []
  }
}

Regeln:
- Nur ausfüllen was wirklich im Gespräch erwähnt wurde — niemals raten
- null = nicht erwähnt/unklar
- stimmung: "sehr positiv" | "positiv" | "neutral" | "skeptisch" | "negativ"
- stimmung_score: 1-10 (10 = sehr kaufbereit)
- abschlusswahrscheinlichkeit: 0-100 (Prozent)
- konfidenz: 0-100 (wie sicher bist du bei der Extraktion)
- gespraech_qualitaet: "sehr gut" | "gut" | "okay" | "schwach"
- Datum immer als YYYY-MM-DD, Uhrzeit als HH:MM`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const d = await r.json();
  const raw = d.content?.[0]?.text || '{}';
  
  try {
    return JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch(e) {
    console.error('Claude JSON parse error:', raw);
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { callId, text, from, to, duration } = req.body || {};
  if (!callId || !text) return res.status(400).json({ error: 'Missing callId or text' });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Lead per Telefonnummer suchen (anrufende Nummer = Kunde)
    const customerPhone = from || to;
    const lead = await findLead(customerPhone, supabase);

    // Claude Analyse
    const fragebogen = await analyseWithClaude(text, lead);
    if (!fragebogen) {
      await supabase.from('sipgate_calls').update({ analyse_status: 'parse_error' }).eq('call_id', callId);
      return res.status(500).json({ error: 'Claude parse failed' });
    }

    // Ergebnis in Supabase speichern
    const { error } = await supabase
      .from('sipgate_calls')
      .update({
        analyse_status:  'done',
        lead_id:         lead?.id || null,
        fragebogen:      fragebogen,
        stimmung_score:  fragebogen.qualitaet?.stimmung_score,
        abschluss_wahrscheinlichkeit: fragebogen.qualitaet?.abschlusswahrscheinlichkeit,
        zusammenfassung: fragebogen.meta?.zusammenfassung,
        analysiert_at:   new Date().toISOString(),
      })
      .eq('call_id', callId);

    if (error) return res.status(500).json({ error: error.message });

    res.json({ ok: true, callId, leadFound: !!lead, fragebogen });

  } catch(e) {
    console.error('Analyse error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
}
