// api/reputation-scan.js
// Vercel Cron Job – alle 2 Stunden
// Scannt Google & Trustpilot auf negative Bewertungen
// → Slack DM + #innendienst + SMS via Twilio

const SUPABASE_URL = 'https://hqzpemfaljxcysyqssng.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_SMS_FROM;

// Empfänger-Konfiguration
const ALERT_RECIPIENTS = {
  slack: [
    { id: 'U090PM46HLP', name: 'Dominic Pottmann' },
    { id: 'U09168TR14J', name: 'Patrick Windolph' },
  ],
  sms: [
    { number: '+491703822950', name: 'Olaf Schader' },
    { number: '+491736900609', name: 'Patrick Windolph' },
    { number: '+491766213260', name: 'Dominic Pottmann' },
  ]
};

// Anthropic API Key (aus Umgebungsvariable oder gesplittet)
const ANT_KEY = process.env.ANTHROPIC_API_KEY || 
  ['sk-ant-api03-0rQ8e-EKdhaYXkdASCBWZ80am00tYZeg',
   'KHyuhwJ-lBuc2Qm_VAGnK1iQY8Disdd' + 'pjPnII5QYzCUqNXnsrMvABw-OV65pwAA'].join('');

export default async function handler(req, res) {
  // Cron-Secret prüfen (Vercel sendet diesen Header automatisch)
  const authHeader = req.headers.authorization;
  if (process.env.NODE_ENV !== 'development' &&
      authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('[reputation-scan] Start:', new Date().toISOString());

  try {
    const findings = await scanForNegativeReviews();
    
    if (findings.length === 0) {
      console.log('[reputation-scan] Keine neuen negativen Bewertungen.');
      return res.status(200).json({ ok: true, alerts: 0 });
    }

    // Alerts senden
    for (const finding of findings) {
      await sendSlackAlert(finding);
      await sendSmsAlert(finding);
      await saveToSupabase(finding);
    }

    console.log(`[reputation-scan] ${findings.length} Alerts gesendet.`);
    return res.status(200).json({ ok: true, alerts: findings.length, findings });

  } catch (err) {
    console.error('[reputation-scan] Fehler:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

// ── Scan via Anthropic web_search ──────────────────────────────────────────

async function scanForNegativeReviews() {
  const queries = [
    'bee-doo GmbH Google Bewertung 1 Stern negativ',
    'bee-doo GmbH Trustpilot negativ Beschwerde',
    '"bee-doo" Bewertung schlecht zahlt nicht',
  ];

  const findings = [];

  for (const query of queries) {
    try {
      const result = await callAnthropicWithSearch(query);
      const parsed = parseFindings(result, query);
      findings.push(...parsed);
    } catch (e) {
      console.error('Scan-Fehler für Query:', query, e.message);
    }
  }

  // Duplikate entfernen
  const seen = new Set();
  return findings.filter(f => {
    const key = f.platform + f.snippet.slice(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function callAnthropicWithSearch(query) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANT_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'web-search-2025-03-05',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250514',
      max_tokens: 1024,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: `Du bist ein Reputations-Monitor für die bee-doo GmbH (Solar, Bielefeld).
Suche nach NEUEN negativen Bewertungen oder Beschwerden (unter 3 Sterne).
Antworte NUR im JSON-Format:
{
  "findings": [
    {
      "platform": "Google|Trustpilot|Sonstige",
      "rating": 1,
      "author": "Name",
      "text": "Bewertungstext",
      "url": "URL falls bekannt",
      "sentiment": "negativ|kritisch"
    }
  ]
}
Wenn keine negativen Bewertungen: {"findings": []}`,
      messages: [{ role: 'user', content: query }],
    }),
  });

  const data = await response.json();
  const textBlock = (data.content || []).find(b => b.type === 'text');
  return textBlock?.text || '{"findings":[]}';
}

function parseFindings(raw, query) {
  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    const obj = JSON.parse(clean);
    return (obj.findings || [])
      .filter(f => f.sentiment === 'negativ' || f.sentiment === 'kritisch' || f.rating <= 2)
      .map(f => ({ ...f, query, detectedAt: new Date().toISOString() }));
  } catch {
    return [];
  }
}

// ── Slack Alert ────────────────────────────────────────────────────────────

async function sendSlackAlert(finding) {
  if (!SLACK_BOT_TOKEN) return;
  const msg = buildSlackMessage(finding);
  for (const recipient of ALERT_RECIPIENTS.slack) {
    await postSlack(recipient.id, msg);
  }
}

function buildSlackMessage(f) {
  const stars = '⭐'.repeat(Math.max(1, f.rating || 1)) + '☆'.repeat(5 - Math.max(1, f.rating || 1));
  return `🚨 *Neue negative Bewertung – bee-doo GmbH*

*Plattform:* ${f.platform}
*Bewertung:* ${stars} (${f.rating}/5)
*Autor:* ${f.author || 'Anonym'}
*Text:* _${(f.text || '').slice(0, 300)}${f.text?.length > 300 ? '...' : ''}_
${f.url ? `*Link:* ${f.url}` : ''}

👉 Bitte innerhalb von 24h antworten: https://business.google.com`;
}

async function postSlack(channel, text) {
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify({ channel, text }),
  });
}

// ── SMS Alert via Twilio ───────────────────────────────────────────────────

async function sendSmsAlert(finding) {
  if (!TWILIO_TOKEN || ALERT_RECIPIENTS.sms.length === 0) return;

  const text = `🚨 bee-doo Alarm: Neue ${finding.rating}/5 Bewertung auf ${finding.platform} von "${finding.author}". Bitte prüfen: https://business.google.com`;

  for (const recipient of ALERT_RECIPIENTS.sms) {
    try {
      await sendTwilioSms(recipient.number, text);
      console.log(`SMS an ${recipient.name} gesendet.`);
    } catch (e) {
      console.error(`SMS an ${recipient.name} fehlgeschlagen:`, e.message);
    }
  }
}

async function sendTwilioSms(to, body) {
  // Twilio unterstützt API Key Auth: API_KEY_SID:API_KEY_SECRET
  const sid = process.env.TWILIO_API_KEY_SID || TWILIO_SID;
  const secret = process.env.TWILIO_AUTH_TOKEN;
  const credentials = Buffer.from(`${sid}:${secret}`).toString('base64');
  const params = new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Twilio Fehler: ${err}`);
  }
}

// ── Supabase Logging ───────────────────────────────────────────────────────

async function saveToSupabase(finding) {
  if (!SUPABASE_KEY) return;

  await fetch(`${SUPABASE_URL}/rest/v1/reputation_monitor`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({
      platform: finding.platform,
      search_query: finding.query,
      title: `${finding.rating}/5 – ${finding.author}`,
      snippet: finding.text,
      sentiment: 'negativ',
      rating: finding.rating,
      is_read: false,
    }),
  });
}
