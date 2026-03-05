// api/calendar-ics.js - iCal feed per VT
// URL: /api/calendar-ics?vt=Andreas+Klee

const LEVETO_BASE = "https://beedoo.leveto.net/API";
const LEVETO_USER = "api@bee-doo.de";
const LEVETO_PASS = "Patrick123456789!";

let _token = null, _tokenExp = 0;

async function getToken() {
  if (_token && Date.now() < _tokenExp) return _token;
  const res = await fetch(`${LEVETO_BASE}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: LEVETO_USER, password: LEVETO_PASS }).toString(),
  });
  const d = await res.json();
  _token = d.token;
  _tokenExp = Date.now() + 13 * 60 * 1000;
  return _token;
}

function toIcalDate(dtStr) {
  // "2026-03-05 10:00:00" → "20260305T100000"
  return dtStr.replace(/[-: ]/g, '').replace(/(\d{8})T(\d{6}).*/, '$1T$2');
}

function escIcal(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export default async function handler(req, res) {
  const { vt } = req.query;
  if (!vt) {
    res.status(400).send('Missing ?vt= parameter');
    return;
  }

  try {
    const token = await getToken();
    const r = await fetch(`${LEVETO_BASE}/appointments`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await r.json();
    const all = data.data || [];

    // Filter: this VT, not deleted, last 30 days + next 90 days
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const apts = all.filter(a =>
      a.user_received === decodeURIComponent(vt) &&
      (a.start_date || '').slice(0, 10) >= cutoffStr &&
      a.status !== 'Deleted'
    );

    const vtName = decodeURIComponent(vt);
    const now = new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');

    let ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//bee-doo GmbH//CC Kalender//DE',
      `X-WR-CALNAME:bee-doo – ${vtName}`,
      'X-WR-CALDESC:Termine aus Leveto',
      'X-WR-TIMEZONE:Europe/Berlin',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
      'X-PUBLISHED-TTL:PT15M',
    ];

    apts.forEach(a => {
      const uid = `beedoo-${a.id || a.leadsID || Math.random().toString(36).slice(2)}@bee-doo.de`;
      const name = [a.vorname, a.nachname].filter(Boolean).join(' ') || 'Termin';
      const addr = [a.strasse, a.hausnummer].filter(Boolean).join(' ');
      const location = [addr, a.plz, a.stadt].filter(Boolean).join(', ');
      const statusLabel = a.status === 'Closed' ? '✓ ' : a.status === 'Cancelled' ? '✗ STORNO – ' : '';
      const summary = `${statusLabel}${name}`;
      const dtStart = toIcalDate(a.start_date || '');
      const dtEnd = toIcalDate(a.end_date || a.start_date || '');

      let desc = `Kunde: ${name}`;
      if (a.telefon) desc += `\\nTel: ${a.telefon}`;
      if (location) desc += `\\nAdresse: ${location}`;
      if (a.text) desc += `\\nNotiz: ${a.text}`;
      desc += `\\n\\nbee-doo CC-Kalender`;

      ics.push('BEGIN:VEVENT');
      ics.push(`UID:${uid}`);
      ics.push(`DTSTAMP:${now}`);
      ics.push(`DTSTART;TZID=Europe/Berlin:${dtStart}`);
      ics.push(`DTEND;TZID=Europe/Berlin:${dtEnd}`);
      ics.push(`SUMMARY:${escIcal(summary)}`);
      ics.push(`DESCRIPTION:${escIcal(desc)}`);
      if (location) ics.push(`LOCATION:${escIcal(location)}`);
      if (a.telefon) ics.push(`URL:tel:${a.telefon}`);
      ics.push(`STATUS:${a.status === 'Cancelled' ? 'CANCELLED' : 'CONFIRMED'}`);
      ics.push('END:VEVENT');
    });

    ics.push('END:VCALENDAR');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="${vtName.replace(/ /g,'-')}.ics"`);
    res.setHeader('Cache-Control', 'no-cache, max-age=900'); // 15min
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).send(ics.join('\r\n'));

  } catch (e) {
    res.status(500).send(`Error: ${e.message}`);
  }
}
