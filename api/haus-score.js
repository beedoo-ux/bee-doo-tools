// Vercel Serverless Function: haus-score
// Analysiert Hausfoto mit Claude Vision → Solar-Score 1-10

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { imageBase64, mediaType } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'API key not configured' });

  const prompt = `Du bist ein erfahrener Solar-Gutachter. Analysiere dieses Hausfoto für die Eignung einer Photovoltaik-Anlage.

Bewerte folgende Kriterien und gib AUSSCHLIESSLICH gültiges JSON zurück (kein Markdown, keine Erklärung außerhalb):

{
  "score": <Gesamtscore 1-10>,
  "empfehlung": "<SEHR GEEIGNET|GEEIGNET|BEDINGT GEEIGNET|NICHT GEEIGNET>",
  "zusammenfassung": "<2-3 Sätze Zusammenfassung für Berater>",
  "kriterien": {
    "dachausrichtung": { "score": <1-10>, "bewertung": "<kurz>" },
    "dachneigung": { "score": <1-10>, "bewertung": "<kurz>" },
    "verschattung": { "score": <1-10>, "bewertung": "<kurz>" },
    "dachzustand": { "score": <1-10>, "bewertung": "<kurz>" },
    "dachflaeche": { "score": <1-10>, "bewertung": "<kurz>" },
    "dachtyp": { "score": <1-10>, "bewertung": "<kurz>" }
  },
  "geschaetzte_module": <Anzahl geschätzte Module, 0 wenn unklar>,
  "geschaetzte_kwp": <geschätzte kWp, 0 wenn unklar>,
  "einwaende": ["<möglicher Einwand 1>", "<möglicher Einwand 2>"],
  "argumente": ["<Verkaufsargument 1>", "<Verkaufsargument 2>", "<Verkaufsargument 3>"],
  "naechste_schritte": "<Empfehlung für den Berater>"
}

Sei präzise und realistisch. Falls kein Dach sichtbar ist, setze score auf 1.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const text = data.content?.[0]?.text || '';
    let result;
    try {
      result = JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch {
      return res.status(500).json({ error: 'Parse error', raw: text });
    }

    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
