#!/bin/bash
echo "window.BEEDOO_SVC='${SUPABASE_SERVICE_KEY}';" > config.js
echo "window.BEEDOO_SB='${SUPABASE_URL}';" >> config.js  
echo "window.BEEDOO_GKEY='${GOOGLE_API_KEY}';" >> config.js
