// api/cron-morgenplan.js
// Vercel Cron: täglich 06:55 Uhr → WhatsApp Tagesplan an alle VTs
// vercel.json: { "crons": [{ "path": "/api/cron-morgenplan", "schedule": "55 5 * * 1-6" }] }

const LEVETO_BASE = "https://beedoo.leveto.net/API";
const LEVETO_USER = process.env.LEVETO_USER || "' + (process.env.LEVETO_USER || 'api@bee-doo.de') + '";
const LEVETO_PASS = process.env.LEVETO_PASS || "' + (process.env.LEVETO_PASS || '') + '";

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = "whatsapp:+14155238886";

// VT phone numbers — Leveto /users/plz has phone fields
// We load them dynamically from Leveto

const DN = ['So','Mo','Di','Mi','Do','Fr','Sa'];
const MN = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

async function getToken() {
  const res = await fetch(`${LEVETO_BASE}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: LEVETO_USER, password: LEVETO_PASS }).toString(),
  });
  const d = await res.json();
  return d.token;
}

function fmtT(s) {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T'));
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

async function sendWhatsApp(to, message) {
  if (!to || !TWILIO_AUTH) return;
  const phone = to.replace(/[^+\d]/g, '');
  if (phone.length < 8) return;
  const toNum = phone.startsWith('+') ? `whatsapp:${phone}` : `whatsapp:+49${phone.replace(/^0/,'')}`;
  
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_AUTH}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      From: TWILIO_FROM,
      To: toNum,
      Body: message,
    }).toString(),
  });
}

export default async function handler(req, res) {
  // Auth: cron or manual only (sends WhatsApp!)
  const _auth = req.headers.authorization;
  const _isCron = req.headers['x-vercel-cron'] === '1';
  const _isManual = _auth === 'Bearer manual';
  if (!_isCron && !_isManual) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Allow manual trigger via GET with ?secret=bee-doo2026
  if (req.method === 'GET') {
    const { secret } = req.query;
    if (secret !== 'bee-doo2026') return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const token = await getToken();

    // Load all users (VTs)
    const usersRes = await fetch(`${LEVETO_BASE}/users/plz?limit=500`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const usersData = await usersRes.json();
    const vtUsers = (usersData.data || []).filter(u =>
      u.active === 1 &&
      u.group_name === 'Vertrieb Außendienst' &&
      u.firstName && u.lastName &&
      (u.phone || u.phone_alias)
    );

    // Load today's appointments
    const today = new Date();
    today.setHours(0,0,0,0);
    const todayStr = today.toISOString().slice(0,10);
    const dayName = DN[today.getDay()];
    const dateLabel = `${dayName}, ${today.getDate()}. ${MN[today.getMonth()]} ${today.getFullYear()}`;

    const aptsRes = await fetch(`${LEVETO_BASE}/appointments`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const aptsData = await aptsRes.json();
    const allApts = aptsData.data || [];
    const todayApts = allApts.filter(a =>
      (a.start_date || '').slice(0, 10) === todayStr &&
      a.status !== 'Cancelled'
    );

    const results = [];

    for (const vt of vtUsers) {
      const myApts = todayApts
        .filter(a => a.user_received === vt.username)
        .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));

      if (!myApts.length) continue; // No message if no appointments

      const phone = vt.phone_alias || vt.phone;
      const firstName = vt.firstName.trim();

      let msg = `🌅 *Guten Morgen ${firstName}!*\n`;
      msg += `Dein Tagesplan für *${dateLabel}*:\n\n`;

      myApts.forEach((a, i) => {
        const name = [a.vorname, a.nachname].filter(Boolean).join(' ') || '–';
        const addr = [a.strasse, a.hausnummer].filter(Boolean).join(' ');
        const location = [addr, a.plz, a.stadt].filter(Boolean).join(', ');
        msg += `*${i+1}. ${fmtT(a.start_date)} Uhr*\n`;
        msg += `👤 ${name}\n`;
        if (location) msg += `📍 ${location}\n`;
        if (a.telefon) msg += `📞 ${a.telefon}\n`;
        msg += '\n';
      });

      msg += `_${myApts.length} Termin${myApts.length !== 1 ? 'e' : ''} heute_\n`;
      msg += `📱 bee-doo-tools.vercel.app/mein-kalender.html?vt=${encodeURIComponent(vt.username)}`;

      try {
        await sendWhatsApp(phone, msg);
        results.push({ vt: vt.username, apts: myApts.length, status: 'sent' });
      } catch(e) {
        results.push({ vt: vt.username, status: 'error', error: e.message });
      }

      // Rate limit: 1 per second
      await new Promise(r => setTimeout(r, 1200));
    }

    res.json({ ok: true, date: todayStr, sent: results.length, results });

  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
