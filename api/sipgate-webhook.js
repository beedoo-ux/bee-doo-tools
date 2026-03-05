// api/sipgate-webhook.js
// Empfängt Sipgate Webhooks (onHangup) → startet Transkript-Analyse
//
// ENV VARS:
//   SIPGATE_TOKEN_ID   = Personal Access Token ID aus console.sipgate.com
//   SIPGATE_TOKEN      = Personal Access Token
//   SIPGATE_USER_ID    = Euer Sipgate User-ID (z.B. "w0" oder "1234567")
//   SIPGATE_WEBHOOK_SECRET = Beliebiges Secret zur Absicherung
//
// Sipgate Setup:
//   console.sipgate.com → Routing → Webhooks → Outgoing URL setzen:
//   https://bee-doo-tools.vercel.app/api/sipgate-webhook
//   Events: onHangup aktivieren

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://hqzpemfaljxcysyqssng.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SIPGATE_BASE = "https://api.sipgate.com/v2";

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function getSipgateToken() {
  const tokenId = process.env.SIPGATE_TOKEN_ID;
  const token   = process.env.SIPGATE_TOKEN;
  if (!tokenId || !token) throw new Error("Missing SIPGATE_TOKEN_ID or SIPGATE_TOKEN");
  return 'Basic ' + Buffer.from(`${tokenId}:${token}`).toString('base64');
}

// Holt Transkript aus Sipgate History nach Gesprächsende
async function fetchTranscript(callId, userId) {
  const auth = await getSipgateToken();
  
  // History-Eintrag holen
  const r = await fetch(`${SIPGATE_BASE}/${userId}/history?types=CALL&limit=20`, {
    headers: { Authorization: auth, Accept: 'application/json' }
  });
  const data = await r.json();
  const items = data.items || [];
  
  // Passendes Gespräch per callId oder kürzlich
  const entry = items.find(i => i.id === callId) || items[0];
  if (!entry) return null;

  return {
    callId:      entry.id,
    from:        entry.source,
    to:          entry.target,
    duration:    entry.duration,
    direction:   entry.direction,
    created:     entry.created,
    note:        entry.note || '',          // sipgate AI Zusammenfassung landet hier
    transcription: entry.transcription || '', // AI Mitschrift (wenn API verfügbar)
    recordingUrl: entry.recordingUrl || null,
  };
}

export default async function handler(req, res) {
  // Sipgate schickt application/x-www-form-urlencoded
  const rawBody = await getRawBody(req);
  const params  = new URLSearchParams(rawBody);
  const event   = params.get('event');

  // Nur onHangup verarbeiten
  if (event !== 'hangup') {
    return res.status(200).send('OK');
  }

  const callId    = params.get('callId') || params.get('xcid') || '';
  const from      = params.get('from')  || '';
  const to        = params.get('to')    || '';
  const direction = params.get('direction') || '';
  const userId    = process.env.SIPGATE_USER_ID || 'w0';

  // Nur eingehende Gespräche (CC ruft Kunden an = outgoing direction)
  // Beide Richtungen erfassen
  
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Call sofort in DB speichern
    const { data: callRow, error } = await supabase
      .from('sipgate_calls')
      .upsert({
        call_id:    callId,
        from_number: from,
        to_number:  to,
        direction,
        status:     'pending',
        created_at: new Date().toISOString(),
        analyse_status: 'waiting', // waiting → processing → done → error
      }, { onConflict: 'call_id' })
      .select()
      .single();

    if (error) console.error('Supabase upsert error:', error);

    // Asynchron: nach 90 Sekunden Transkript holen + analysieren
    // (Vercel Serverless hat max 10s für Edge, aber wir nutzen Node runtime)
    setTimeout(async () => {
      try {
        // Transkript aus Sipgate holen
        const transcript = await fetchTranscript(callId, userId);
        
        if (!transcript) {
          await supabase.from('sipgate_calls').update({ analyse_status: 'no_transcript' }).eq('call_id', callId);
          return;
        }

        await supabase.from('sipgate_calls').update({
          analyse_status: 'processing',
          duration: transcript.duration,
          note_raw: transcript.note,
          transcription_raw: transcript.transcription,
          recording_url: transcript.recordingUrl,
        }).eq('call_id', callId);

        // Claude Analyse triggern
        const text = transcript.transcription || transcript.note || '';
        if (text.length < 20) {
          await supabase.from('sipgate_calls').update({ analyse_status: 'no_text' }).eq('call_id', callId);
          return;
        }

        const analyseRes = await fetch(`https://bee-doo-tools.vercel.app/api/sipgate-analyse`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callId, text, from, to, duration: transcript.duration }),
        });

        if (!analyseRes.ok) {
          await supabase.from('sipgate_calls').update({ analyse_status: 'analyse_error' }).eq('call_id', callId);
        }
      } catch(e) {
        console.error('Delayed transcript error:', e);
        await supabase.from('sipgate_calls').update({ analyse_status: 'error', error_msg: e.message }).eq('call_id', callId);
      }
    }, 90_000); // 90 Sekunden warten

    res.status(200).send('OK');
  } catch(e) {
    console.error('Webhook error:', e);
    res.status(200).send('OK'); // Immer 200 an Sipgate zurück
  }
}
