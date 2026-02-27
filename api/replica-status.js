export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const r = await fetch('http://91.98.26.59/status', { signal: AbortSignal.timeout(5000) });
    const data = await r.json();
    res.setHeader('Cache-Control', 'no-cache');
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: 'Replica not reachable', ts: new Date().toISOString() });
  }
}
