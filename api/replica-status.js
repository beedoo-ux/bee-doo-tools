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
    // Fix broken JSON: remove standalone number lines before commas
    let lines = txt.split('\n');
    let cleaned = [];
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      // Skip lines that are just a number followed by comma (broken lag_seconds)
      if (/^\d+,$/.test(line) && i > 0 && cleaned.length > 0) {
        // Append comma to previous line if needed
        let prev = cleaned[cleaned.length - 1].trimEnd();
        if (!prev.endsWith(',') && !prev.endsWith('{') && !prev.endsWith('[')) {
          cleaned[cleaned.length - 1] = prev + ',';
        }
        continue;
      }
      cleaned.push(lines[i]);
    }
    txt = cleaned.join('\n');
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(txt);
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
