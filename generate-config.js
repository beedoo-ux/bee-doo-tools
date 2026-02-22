const fs = require('fs');
// Hardcoded config – kein Vercel Secret-Lookup nötig
const config = [
  "window.BEEDOO_SVC='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxenBlbWZhbGp4Y3lzeXFzc25nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczOTQ1MzYyOCwiZXhwIjoyMDU1MDI5NjI4fQ.LSlMAp-LxNGMj4r8wNPTSgKFMIexZg-Y4p1YLRKqLdc';",
  "window.BEEDOO_SB='https://hqzpemfaljxcysyqssng.supabase.co';",
  "window.BEEDOO_GKEY='AIzaSyD1ZYkqURi5upHcIk_uUeZErgf5kZB9Jd8';",
  "window.BEEDOO_MGMT='sbp_0faa1551f2f59c918b0a54880f565af0d0adfe5f';",
].join('\n');

fs.writeFileSync('config.js', config);
console.log('config.js generated OK');
