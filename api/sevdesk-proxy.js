// api/sevdesk-proxy.js - Proxy for SevDesk API (avoids CORS issues in Safari)
const TOKEN = '038aa548ad6b053b4d6679676fb859a2';
const BASE = 'https://my.sevdesk.de/api/v1';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const endpoint = req.query.endpoint;
  if (!endpoint) return res.status(400).json({ error: 'Missing endpoint param' });

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) {
    if (k !== 'endpoint') params.set(k, v);
  }

  const url = BASE + '/' + endpoint + (params.toString() ? '?' + params.toString() : '');

  try {
    const resp = await fetch(url, {
      headers: { 'Accept': 'application/json', 'Authorization': TOKEN }
    });
    const data = await resp.json();
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
    return res.status(resp.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
