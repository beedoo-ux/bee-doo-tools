const fs = require('fs');
try {
  const svc = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const sb  = process.env.SUPABASE_URL || 'https://hqzpemfaljxcysyqssng.supabase.co';
  const gk  = process.env.GOOGLE_API_KEY || 'AIzaSyD1ZYkqURi5upHcIk_uUeZErgf5kZB9Jd8';
  const config = `window.BEEDOO_SVC='${svc}';\nwindow.BEEDOO_SB='${sb}';\nwindow.BEEDOO_GKEY='${gk}';\n`;
  fs.writeFileSync('config.js', config);
  console.log('config.js generated OK');
} catch(e) {
  console.error('config.js error (non-fatal):', e.message);
  fs.writeFileSync('config.js', "window.BEEDOO_SVC='';window.BEEDOO_SB='https://hqzpemfaljxcysyqssng.supabase.co';window.BEEDOO_GKEY='';\n");
}
