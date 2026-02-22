const fs = require('fs');
const config = `window.BEEDOO_SVC='${process.env.SUPABASE_SERVICE_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxenBlbWZhbGp4Y3lzeXFzc25nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTMzNTM5NywiZXhwIjoyMDg2OTExMzk3fQ.MJ3cyAAquE8DK2ngzfIIn4bTpQ8_H9DaeJ3YTlBdFz4'}';
window.BEEDOO_SB='${process.env.SUPABASE_URL||'https://hqzpemfaljxcysyqssng.supabase.co'}';
window.BEEDOO_GKEY='${process.env.GOOGLE_API_KEY||'AIzaSyD1ZYkqURi5upHcIk_uUeZErgf5kZB9Jd8'}';
`;
fs.writeFileSync('config.js', config);
console.log('config.js generated');
