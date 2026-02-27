// api/leveto-proxy.js — CORS proxy for Leveto API
// Routes: POST /api/leveto-proxy?path=auth|leads|...

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { path } = req.query;
  if (!path) return res.status(400).json({ error: 'Missing ?path= parameter' });

  const LEVETO_BASE = 'https://beedoo.leveto.net/API';
  const targetUrl = `${LEVETO_BASE}/${path}`;

  try {
    const fetchOptions = {
      method: req.method,
      headers: {}
    };

    // Forward Authorization header
    if (req.headers.authorization) {
      fetchOptions.headers['Authorization'] = req.headers.authorization;
    }

    // Forward body for POST
    if (req.method === 'POST') {
      const contentType = req.headers['content-type'] || '';
      fetchOptions.headers['Content-Type'] = contentType;

      if (contentType.includes('application/x-www-form-urlencoded')) {
        // Body comes as parsed object from Vercel, re-encode
        if (typeof req.body === 'object') {
          fetchOptions.body = new URLSearchParams(req.body).toString();
        } else {
          fetchOptions.body = req.body;
        }
      } else {
        fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      }
    }

    // Forward query params (except 'path')
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query)) {
      if (k !== 'path') params.set(k, v);
    }
    const qs = params.toString();
    const finalUrl = qs ? `${targetUrl}?${qs}` : targetUrl;

    const response = await fetch(finalUrl, fetchOptions);
    const data = await response.json();
    
    return res.status(response.status).json(data);
  } catch (err) {
    console.error('Leveto proxy error:', err);
    return res.status(502).json({ error: 'Leveto API unreachable', details: err.message });
  }
}
