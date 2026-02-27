export const config = { maxDuration: 10 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'no-cache');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    const r = await fetch('http://91.98.26.59/status', { signal: controller.signal });
    clearTimeout(t);
    let txt = await r.text();
    txt = txt.replace(/(\d)\s+(\d+)\s*,/g, '$1,');
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(txt);
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
