// api/gcal-sync.js
// Bidirectional Google Calendar ↔ Leveto sync
// 
// ENV VARS needed in Vercel:
//   GOOGLE_SERVICE_ACCOUNT_EMAIL  = beedoo-calendar@bee-doo-XXXXX.iam.gserviceaccount.com
//   GOOGLE_PRIVATE_KEY            = -----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----
//   LEVETO_USER                   = ' + (process.env.LEVETO_USER || 'api@bee-doo.de') + '  
//   LEVETO_PASS                   = ' + (process.env.LEVETO_PASS || '') + '
//
// Actions:
//   GET ?action=push&vt=Andreas+Klee   → Leveto → Google (today + next 14 days)
//   GET ?action=push_all               → all active VTs
//   GET ?action=pull_blocks&vt=...     → Google → read blocks/vacation
//   GET ?action=pull_all_blocks        → all VTs, returns blocked slots

const LEVETO_BASE = "https://beedoo.leveto.net/API";
const GCAL_BASE   = "https://www.googleapis.com/calendar/v3";

// ── JWT / OAuth2 for Service Account ─────────────────────────────
async function getGoogleToken(scopes = ["https://www.googleapis.com/auth/calendar"]) {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key   = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!email || !key) {
    console.log("[gcal-sync] Skipped: GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY not configured");
    throw new Error("Google Calendar not configured — set env vars to enable");
  }

  const now   = Math.floor(Date.now() / 1000);
  const claim = { iss: email, scope: scopes.join(" "), aud: "https://oauth2.googleapis.com/token", exp: now + 3600, iat: now };

  // Build JWT (RS256) — using Web Crypto API available in Vercel Edge/Node
  const header  = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" })).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
  const payload = btoa(JSON.stringify(claim)).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
  const unsigned = `${header}.${payload}`;

  // Import private key
  const pemBody = key.replace(/-----BEGIN RSA PRIVATE KEY-----|-----END RSA PRIVATE KEY-----|-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const keyData = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("pkcs8", keyData, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sigBuf = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(unsigned));
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
  const jwt = `${unsigned}.${sig}`;

  // Exchange for access token
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }).toString(),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Google auth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

// ── Leveto helpers ────────────────────────────────────────────────
let _levToken = null, _levExp = 0;
async function getLevToken() {
  if (_levToken && Date.now() < _levExp) return _levToken;
  const r = await fetch(`${LEVETO_BASE}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: process.env.LEVETO_USER || "' + (process.env.LEVETO_USER || 'api@bee-doo.de') + '", password: process.env.LEVETO_PASS || "' + (process.env.LEVETO_PASS || '') + '" }).toString(),
  });
  const d = await r.json();
  _levToken = d.token; _levExp = Date.now() + 13 * 60 * 1000;
  return _levToken;
}

async function levGet(path, params = {}) {
  const token = await getLevToken();
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(`${LEVETO_BASE}${path}${qs ? "?" + qs : ""}`, { headers: { Authorization: `Bearer ${token}` } });
  return r.json();
}

// ── Google Calendar helpers ───────────────────────────────────────
function vtEmail(vtName) {
  // Convert "Andreas Klee" → "a.klee@bee-doo.de" — adjust mapping as needed
  const [fn, ...ln] = vtName.trim().split(" ");
  const last = ln.join("").toLowerCase().replace(/ü/g,"ue").replace(/ö/g,"oe").replace(/ä/g,"ae").replace(/ß/g,"ss").replace(/[^a-z]/g,"");
  const first = fn.toLowerCase().replace(/ü/g,"ue").replace(/ö/g,"oe").replace(/ä/g,"ae").replace(/ß/g,"ss").replace(/[^a-z]/g,"");
  return `${first.charAt(0)}.${last}@bee-doo.de`;
}

function toGCalDate(levStr) {
  // "2026-03-05 10:00:00" → "2026-03-05T10:00:00+01:00"
  return levStr.replace(" ", "T") + "+01:00";
}

function fromGCalDate(gcalStr) {
  return gcalStr.replace("T", " ").slice(0, 19);
}

function aptToEvent(a) {
  const name = [a.vorname, a.nachname].filter(Boolean).join(" ") || "Termin";
  const addr = [a.strasse, a.hausnummer].filter(Boolean).join(" ");
  const location = [addr, a.plz, a.stadt].filter(Boolean).join(", ");
  const statusPrefix = a.status === "Cancelled" ? "✗ STORNO – " : a.status === "Closed" ? "✓ " : "";
  
  return {
    id: `beedoo${String(a.id || a.leadsID || "").replace(/[^a-z0-9]/gi,"").toLowerCase()}`,
    summary: `${statusPrefix}${name}`,
    location: location || undefined,
    description: [
      `Kunde: ${name}`,
      a.telefon ? `Tel: ${a.telefon}` : null,
      location ? `Adresse: ${location}` : null,
      a.text ? `Notiz: ${a.text}` : null,
      `Status: ${a.status || "Open"}`,
      `\nbee-doo CC-Kalender`,
    ].filter(Boolean).join("\n"),
    start: { dateTime: toGCalDate(a.start_date), timeZone: "Europe/Berlin" },
    end:   { dateTime: toGCalDate(a.end_date),   timeZone: "Europe/Berlin" },
    status: a.status === "Cancelled" ? "cancelled" : "confirmed",
    colorId: a.status === "Closed" ? "2" : a.status === "Cancelled" ? "8" : "1", // green / graphite / blue
    extendedProperties: { private: { beedooId: String(a.id || ""), beedooSource: "leveto" } },
  };
}

// ── PUSH: Leveto → Google Calendar ───────────────────────────────
async function pushVT(vtName, gToken) {
  const email = vtEmail(vtName);
  const calId = encodeURIComponent(email);

  // Load Leveto appointments for this VT (next 21 days)
  const data = await levGet("/appointments");
  const all  = data.data || [];
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 1);
  const future = new Date(); future.setDate(future.getDate() + 21);
  const apts = all.filter(a =>
    a.user_received === vtName &&
    new Date(a.start_date) >= cutoff &&
    new Date(a.start_date) <= future
  );

  let created = 0, updated = 0, errors = 0;

  for (const a of apts) {
    const event = aptToEvent(a);
    // Try update first, then create
    const updateRes = await fetch(`${GCAL_BASE}/calendars/${calId}/events/${event.id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${gToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
    if (updateRes.ok) { updated++; continue; }
    if (updateRes.status === 404) {
      const createRes = await fetch(`${GCAL_BASE}/calendars/${calId}/events`, {
        method: "POST",
        headers: { Authorization: `Bearer ${gToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });
      if (createRes.ok) created++;
      else { errors++; console.error(`Create failed for ${a.id}:`, await createRes.text()); }
    } else { errors++; }
  }

  return { vt: vtName, email, total: apts.length, created, updated, errors };
}

// ── PULL: Google Calendar → Blocked Slots ────────────────────────
async function pullBlocks(vtName, gToken) {
  const email = vtEmail(vtName);
  const calId = encodeURIComponent(email);

  const now   = new Date().toISOString();
  const until = new Date(); until.setDate(until.getDate() + 30);

  // Get all events — filter those NOT from Leveto (= manually added blocks)
  const r = await fetch(
    `${GCAL_BASE}/calendars/${calId}/events?timeMin=${now}&timeMax=${until.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=250`,
    { headers: { Authorization: `Bearer ${gToken}` } }
  );
  const data = await r.json();
  const events = data.items || [];

  const blocks = events
    .filter(e => {
      const isFromLeveto = e.extendedProperties?.private?.beedooSource === "leveto";
      const isDeclined   = e.status === "cancelled";
      return !isFromLeveto && !isDeclined;
    })
    .map(e => ({
      id:       e.id,
      title:    e.summary || "Blockiert",
      start:    e.start?.dateTime || e.start?.date,
      end:      e.end?.dateTime   || e.end?.date,
      allDay:   !e.start?.dateTime,
      type:     detectBlockType(e.summary || ""),
    }));

  return { vt: vtName, email, blocks };
}

function detectBlockType(title) {
  const t = title.toLowerCase();
  if (t.includes("urlaub") || t.includes("vacation") || t.includes("frei")) return "vacation";
  if (t.includes("krank") || t.includes("ill"))                             return "sick";
  if (t.includes("block") || t.includes("gesperrt") || t.includes("⛔") || t.includes("🚫")) return "block";
  return "other";
}

// ── MAIN HANDLER ─────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { action, vt, secret } = req.query;

  // Simple auth for manual triggers
  if (secret !== "bee-doo2026" && req.headers["x-vercel-cron"] !== "1") {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const gToken = await getGoogleToken();

    // ── PUSH single VT
    if (action === "push" && vt) {
      const result = await pushVT(decodeURIComponent(vt), gToken);
      return res.json({ ok: true, result });
    }

    // ── PUSH ALL active VTs
    if (action === "push_all") {
      const usersData = await levGet("/users/plz", { limit: 500 });
      const vts = (usersData.data || [])
        .filter(u => u.active === 1 && u.group_name === "Vertrieb Außendienst" && u.firstName && u.lastName);
      const results = [];
      for (const u of vts) {
        try { results.push(await pushVT(u.username, gToken)); }
        catch(e) { results.push({ vt: u.username, error: e.message }); }
        await new Promise(r => setTimeout(r, 200)); // rate limit
      }
      return res.json({ ok: true, total: vts.length, results });
    }

    // ── PULL blocks for single VT
    if (action === "pull_blocks" && vt) {
      const result = await pullBlocks(decodeURIComponent(vt), gToken);
      return res.json({ ok: true, result });
    }

    // ── PULL blocks ALL VTs (used by CC calendar every 5 min)
    if (action === "pull_all_blocks") {
      const usersData = await levGet("/users/plz", { limit: 500 });
      const vts = (usersData.data || [])
        .filter(u => u.active === 1 && u.group_name === "Vertrieb Außendienst" && u.firstName && u.lastName);
      const allBlocks = {};
      for (const u of vts) {
        try {
          const r = await pullBlocks(u.username, gToken);
          if (r.blocks.length) allBlocks[u.username] = r.blocks;
        } catch(e) { /* skip unavailable calendars */ }
        await new Promise(r => setTimeout(r, 150));
      }
      return res.json({ ok: true, blocks: allBlocks });
    }

    return res.status(400).json({ error: "Unknown action" });

  } catch (e) {
    console.error("gcal-sync error:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
