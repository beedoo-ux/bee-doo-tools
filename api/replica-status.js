export const config = { maxDuration: 10 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    const r = await fetch('http://91.98.26.59/status', { signal: controller.signal });
    clearTimeout(t);
    let txt = await r.text();
    // Fix: lag_seconds outputs value 3x on separate lines
    txt = txt.replace(/"lag_seconds":\s*(\d+)[\s\d]+,/, '"lag_seconds": $1,');
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(txt);
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
