// api/twilio-call.js
// Initiiert ausgehenden Twilio-Anruf vom CC-Agent zum Kunden.
// Credentials kommen im Body (aus localStorage im Frontend gespeichert).

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const { to, sid, token, from } = req.body || {};

    if (!to)    return res.status(400).json({ ok: false, error: 'Empfaengernummer (to) fehlt' });
    if (!sid)   return res.status(400).json({ ok: false, error: 'Twilio Account SID fehlt' });
    if (!token) return res.status(400).json({ ok: false, error: 'Twilio Auth Token fehlt' });

    // Nummer normalisieren
    let toNum = to.replace(/\s+/g, '');
    if (!toNum.startsWith('+')) {
      toNum = toNum.startsWith('0') ? '+49' + toNum.slice(1) : '+49' + toNum;
    }

    // Absendernummer (Twilio SMS-Nummer)
    const fromNum = from || '+4915888651131';

    // TwiML: direkter Anruf
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${fromNum}" timeout="30" record="record-from-answer">
    <Number>${toNum}</Number>
  </Dial>
</Response>`;

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`;
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');

    const params = new URLSearchParams({
      To:    toNum,
      From:  fromNum,
      Twiml: twiml,
    });

    const twilioRes = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await twilioRes.json();

    if (data.sid) {
      return res.json({
        ok: true,
        callSid: data.sid,
        status: data.status,
        to: data.to,
        from: data.from,
      });
    } else {
      return res.status(400).json({
        ok: false,
        error: data.message || ('Twilio Fehler Code ' + (data.code || '?')),
        code: data.code,
      });
    }

  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
