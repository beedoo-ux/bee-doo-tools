export const config = { maxDuration: 10 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Proxy-Version', '4');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    const r = await fetch('http://91.98.26.59/status', { signal: controller.signal });
    clearTimeout(t);
    const txt = await r.text();
    // Aggressive cleanup: remove any line that is just digits+comma
    const fixed = txt.split('\n').filter((line, i, arr) => {
      const trimmed = line.trim();
      if (/^\d+,$/.test(trimmed) && i > 0) {
        // Patch previous non-filtered line to end with comma
        for (let j = arr.length - 1; j >= 0; j--) {
          if (arr[j] !== null) {
            arr[j] = arr[j].replace(/(\d)\s*$/, '$1,');
            break;
          }
        }
        return false;
      }
      return true;
    }).join('\n');
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(fixed);
  } catch (e) {
    return res.status(502).json({ error: e.message, v: 4 });
  }
}
