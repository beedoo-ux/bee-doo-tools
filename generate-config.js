const fs = require('fs');
const config = `window.BEEDOO_SVC='${process.env.SUPABASE_SERVICE_KEY||''}';
window.BEEDOO_SB='${process.env.SUPABASE_URL||'https://hqzpemfaljxcysyqssng.supabase.co'}';
window.BEEDOO_GKEY='${process.env.GOOGLE_API_KEY||''}';
`;
fs.writeFileSync('config.js', config);
console.log('config.js generated');
