// api/leveto.js - Leveto API Proxy for bee-doo CC Calendar
// Deployed on Vercel, handles CORS and Leveto auth

const LEVETO_BASE = "https://beedoo.leveto.net/API";
const LEVETO_USER = process.env.LEVETO_USER || 'api@bee-doo.de';
const LEVETO_PASS = process.env.LEVETO_PASS;

let _tokenCache = { token: null, expires: 0 };

async function getLeveloToken() {
  if (_tokenCache.token && Date.now() < _tokenCache.expires) {
    return _tokenCache.token;
  }
  const body = new URLSearchParams({ username: LEVETO_USER, password: LEVETO_PASS });
  const res = await fetch(`${LEVETO_BASE}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = await res.json();
  _tokenCache = { token: data.token, expires: Date.now() + 13 * 60 * 1000 };
  return data.token;
}

async function levetoGet(path, params = {}) {
  const token = await getLeveloToken();
  const qs = new URLSearchParams(params).toString();
  const url = `${LEVETO_BASE}${path}${qs ? "?" + qs : ""}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { action } = req.method === "GET" ? req.query : (req.body || {});

  try {
    if (action === "appointments") {
      res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=300");

      // Only fetch Open appointments (2.8s vs 5s for all statuses)
      const data = await levetoGet("/appointments", { status: "Open" });
      const all = data.data || [];

      // Only today + future
      const todayStr = new Date().toISOString().slice(0, 10);
      const filtered = all.filter((a) => (a.start_date || "").slice(0, 10) >= todayStr);

      return res.json({ ok: true, data: filtered, total: filtered.length });
    }

    if (action === "users") {
      res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1200");
      const data = await levetoGet("/users", { limit: 500 });
      const users = (data.data || []).filter(
        (u) =>
          u.active === 1 &&
          u.group_name === "Vertrieb Außendienst" &&
          !u.username.startsWith("DELETED") &&
          !u.username.startsWith("Administrator") &&
          !u.username.startsWith("Schulung") &&
          !u.username.startsWith("Außendienst") &&
          u.firstName &&
          u.lastName
      );
      return res.json({ ok: true, data: users });
    }

    if (action === "leads") {
      const { search, plz } = req.query;
      const params = { limit: 20 };
      if (search) params.search = search;
      if (plz) params.plz = plz;
      const data = await levetoGet("/leads", params);
      return res.json({ ok: true, data: data.leads || [], total: data.totalrecords || 0 });
    }

    if (action === "book" && req.method === "POST") {
      const { appointmentData } = req.body;
      const token = await getLeveloToken();
      const formBody = new URLSearchParams({
        title: appointmentData.title || `Termin ${appointmentData.vorname||''} ${appointmentData.nachname||''}`.trim(),
        description: appointmentData.description || appointmentData.text || '',
        assigned_user: String(appointmentData.assigned_user || ''),
        start_date: appointmentData.start_date || '',
        end_date: appointmentData.end_date || '',
        leadID: String(appointmentData.leadID || ''),
        type: appointmentData.type || appointmentData.appointment_type || 'Termin vor ORT',
      }).toString();
      const r2 = await fetch(`${LEVETO_BASE}/app`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formBody,
      });
      const result = await r2.json();
      return res.json({ ok: true, data: result });
    }

    return res.status(400).json({ ok: false, error: "Unknown action" });
  } catch (e) {
    console.error("Leveto proxy error:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
