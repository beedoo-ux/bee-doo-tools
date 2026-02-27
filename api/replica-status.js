export const config = { maxDuration: 10 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-cache, no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  
  try {
    const r = await fetch('http://91.98.26.59/status', {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeout);
    let text = await r.text();
    // Sanitize: fix double values from status script bug
    text = text.replace(/:\s*(\d+)\s*
\s*(\d+)\s*,/g, ': $1,');
    // Validate JSON
    const data = JSON.parse(text);
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(data);
  } catch (e) {
    clearTimeout(timeout);
    res.status(502).json({ 
      error: 'Replica not reachable',
      detail: e.message,
      ts: new Date().toISOString()
    });
  }
}
