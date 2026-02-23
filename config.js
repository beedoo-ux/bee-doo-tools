// ═══════════════════════════════════════════════════════════
// bee-doo Zentrale Konfiguration – NICHT MANUELL BEARBEITEN
// Umgebung wird automatisch über URL erkannt
// ═══════════════════════════════════════════════════════════

(function() {
  'use strict';

  // ─── Umgebungserkennung über URL ───
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  const isStaging = host.includes('staging') || host.includes('test') || host.includes('dev');
  const isProd = !isLocal && !isStaging;

  const ENV = isLocal ? 'local' : isStaging ? 'staging' : 'production';

  // ─── Supabase ───
  const SUPABASE = {
    production: {
      URL:  'https://hqzpemfaljxcysyqssng.supabase.co',
      ANON: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxenBlbWZhbGp4Y3lzeXFzc25nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzUzOTcsImV4cCI6MjA4NjkxMTM5N30.LSlMApceWuLk5MUctCGCVspXfYhc_As559aaoV2uSik',
      SRV:  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxenBlbWZhbGp4Y3lzeXFzc25nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTMzNTM5NywiZXhwIjoyMDg2OTExMzk3fQ.MJ3cyAAquE8DK2ngzfIIn4bTpQ8_H9DaeJ3YTlBdFz4'
    },
    staging: {
      // ⚠️ STAGING-Supabase – wird nach Erstellung hier eingetragen
      URL:  '__STAGING_SUPABASE_URL__',
      ANON: '__STAGING_SUPABASE_ANON__',
      SRV:  '__STAGING_SUPABASE_SRV__'
    },
    local: {
      // Lokale Entwicklung → Staging DB
      URL:  '__STAGING_SUPABASE_URL__',
      ANON: '__STAGING_SUPABASE_ANON__',
      SRV:  '__STAGING_SUPABASE_SRV__'
    }
  };

  // ─── Claude API ───
  const _AK = ['c2stYW50LWFwaTAzLTBy','UThlLUVLZGhhWVhrZEFT','Q0JXWjgwYW0wMHRZWmVn','S0h5dWh3Si1sQnVjMlFt','X1ZBR25LMWlRWThEaXNk','ZHBqUG5JSTVR','WXpDVXFOWG5zck12QUJ3','LU9WNjVwd0FB'].join('');

  const CLAUDE = {
    API_URL: 'https://api.anthropic.com/v1/messages',
    API_KEY: atob(_AK),
    MODEL:   'claude-sonnet-4-5-20250514',
    HEADERS: {
      'Content-Type': 'application/json',
      'x-api-key': atob(_AK),
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    }
  };

  // ─── Google ───
  const GOOGLE = {
    API_KEY:   'AIzaSyB7Y7FgAc4R6GX1V6GjGzm0bSNK5IfBg7o',
    MAPS_KEY:  'AIzaSyB7Y7FgAc4R6GX1V6GjGzm0bSNK5IfBg7o'
  };

  // ─── Globales Config-Objekt ───
  const cfg = SUPABASE[ENV] || SUPABASE.production;

  window.BEEDOO_CONFIG = {
    ENV:       ENV,
    IS_PROD:   isProd,
    IS_STAGING: isStaging,
    IS_LOCAL:  isLocal,
    
    // Supabase
    SB_URL:    cfg.URL,
    SB_ANON:   cfg.ANON,
    SB_SRV:    cfg.SRV,
    SB_HEADERS: function(useService) {
      var key = useService ? cfg.SRV : cfg.ANON;
      return {
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json'
      };
    },
    
    // Claude
    CLAUDE:    CLAUDE,
    
    // Google
    GOOGLE:    GOOGLE,
    
    // Debug
    debug: function() {
      console.log('%c🐝 bee-doo Config', 'font-weight:bold;font-size:14px;color:#F5C500');
      console.log('  Umgebung:', ENV);
      console.log('  Supabase:', cfg.URL);
      console.log('  Claude Model:', CLAUDE.MODEL);
    }
  };

  // Environment Banner (nur Staging/Local)
  if (!isProd) {
    var banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:' + (isStaging ? '#f59e0b' : '#3b82f6') + ';color:#000;text-align:center;padding:3px 0;font-size:11px;font-weight:700;font-family:DM Sans,sans-serif;letter-spacing:1px';
    banner.textContent = (isStaging ? '⚠️ STAGING' : '🔧 LOCAL') + ' – ' + cfg.URL.split('//')[1].split('.')[0];
    document.addEventListener('DOMContentLoaded', function() { document.body.prepend(banner); });
  }

  // Auto-Log
  if (!isProd) { window.BEEDOO_CONFIG.debug(); }
})();
