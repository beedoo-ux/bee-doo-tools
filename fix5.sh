#!/bin/bash
set -e
echo "=== Status-API Setup ==="

echo "1/3 Nginx installieren..."
apt-get install -y nginx > /dev/null 2>&1
echo "   OK"

echo "2/3 Status-Script erstellen..."
cat > /opt/beedoo/status.sh << 'STATUS'
#!/bin/bash
# Subscription status
SUB=$(sudo -u postgres psql -t -A -d beedoo_prod -c "SELECT subenabled FROM pg_subscription WHERE subname='beedoo_supabase_sub';" 2>/dev/null || echo "false")

# Replica lag in seconds
LAG=$(sudo -u postgres psql -t -A -d beedoo_prod -c "SELECT COALESCE(EXTRACT(EPOCH FROM (now() - last_msg_send_time))::int, -1) FROM pg_stat_subscription WHERE subname='beedoo_supabase_sub';" 2>/dev/null || echo "-1")

# Table count on replica
RTABLES=$(sudo -u postgres psql -t -A -d beedoo_prod -c "SELECT count(*) FROM pg_tables WHERE schemaname='public';" 2>/dev/null || echo "0")

# Row counts for key tables
ROWS=$(sudo -u postgres psql -t -A -d beedoo_prod -c "
SELECT json_object_agg(relname, n_live_tup)
FROM (SELECT relname, n_live_tup FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY n_live_tup DESC LIMIT 15) t;
" 2>/dev/null || echo "{}")

# Disk usage
DISK_TOTAL=$(df -BG / | awk 'NR==2{print $2}' | tr -d 'G')
DISK_USED=$(df -BG / | awk 'NR==2{print $3}' | tr -d 'G')
DISK_PCT=$(df / | awk 'NR==2{print $5}' | tr -d '%')

# Memory
MEM_TOTAL=$(free -m | awk '/Mem:/{print $2}')
MEM_USED=$(free -m | awk '/Mem:/{print $3}')

# Load
LOAD=$(cat /proc/loadavg | awk '{print $1}')

# PostgreSQL status
PG_UP=$(systemctl is-active postgresql 2>/dev/null || echo "inactive")

cat << JSON
{
  "status": "ok",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "replication": {
    "enabled": $( [ "$SUB" = "t" ] && echo "true" || echo "false" ),
    "lag_seconds": $LAG,
    "tables": $RTABLES
  },
  "rows": $ROWS,
  "system": {
    "disk_total_gb": $DISK_TOTAL,
    "disk_used_gb": $DISK_USED,
    "disk_pct": $DISK_PCT,
    "mem_total_mb": $MEM_TOTAL,
    "mem_used_mb": $MEM_USED,
    "load": $LOAD,
    "postgresql": "$PG_UP"
  }
}
JSON
STATUS
chmod +x /opt/beedoo/status.sh
echo "   OK"

echo "3/3 Nginx konfigurieren..."
cat > /etc/nginx/sites-available/status << 'NGINX'
server {
    listen 80;
    server_name _;
    
    location /status {
        default_type application/json;
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods "GET, OPTIONS";
        add_header Access-Control-Allow-Headers "*";
        add_header Cache-Control "no-cache";
        
        if ($request_method = OPTIONS) {
            return 204;
        }
        
        content_by_lua_block {
            local handle = io.popen("/opt/beedoo/status.sh")
            local result = handle:read("*a")
            handle:close()
            ngx.say(result)
        }
    }
}
NGINX

# Fallback: Use CGI approach if lua not available
cat > /opt/beedoo/status-cgi.sh << 'CGI'
#!/bin/bash
echo "Content-Type: application/json"
echo "Access-Control-Allow-Origin: *"
echo ""
/opt/beedoo/status.sh
CGI
chmod +x /opt/beedoo/status-cgi.sh

# Use simple cron + static file approach (most reliable)
/opt/beedoo/status.sh > /var/www/html/status.json
cat > /etc/nginx/sites-available/status << 'NGINX2'
server {
    listen 80;
    server_name _;
    root /var/www/html;
    
    location /status {
        alias /var/www/html/status.json;
        default_type application/json;
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods "GET, OPTIONS";
        add_header Access-Control-Allow-Headers "*";
        add_header Cache-Control "no-cache, no-store";
    }
}
NGINX2

ln -sf /etc/nginx/sites-available/status /etc/nginx/sites-enabled/status
rm -f /etc/nginx/sites-enabled/default
systemctl restart nginx

# Cron: update status every 10 seconds
cat > /opt/beedoo/update-status.sh << 'CRON'
#!/bin/bash
while true; do
    /opt/beedoo/status.sh > /var/www/html/status.json.tmp 2>/dev/null
    mv /var/www/html/status.json.tmp /var/www/html/status.json
    sleep 10
done
CRON
chmod +x /opt/beedoo/update-status.sh

# Run as background service
cat > /etc/systemd/system/beedoo-status.service << 'SVC'
[Unit]
Description=bee-doo Replica Status Updater
After=postgresql.service

[Service]
ExecStart=/opt/beedoo/update-status.sh
Restart=always

[Install]
WantedBy=multi-user.target
SVC

systemctl daemon-reload
systemctl enable beedoo-status
systemctl start beedoo-status

echo ""
echo "=== STATUS-API AKTIV ==="
echo "URL: http://91.98.26.59/status"
echo "========================"
curl -s http://localhost/status | python3 -m json.tool 2>/dev/null || curl -s http://localhost/status
