#!/bin/bash
set -e
echo "=== Status API Setup ==="

apt-get install -y nginx python3 -q

# Create status script
cat > /opt/beedoo/status-api.sh << 'STATUS'
#!/bin/bash
SUB_STATUS=$(sudo -u postgres psql -t -A -d beedoo_prod -c "SELECT subenabled FROM pg_subscription WHERE subname='beedoo_supabase_sub'" 2>/dev/null || echo "false")
SUB_LAG=$(sudo -u postgres psql -t -A -d beedoo_prod -c "SELECT COALESCE(EXTRACT(EPOCH FROM (now() - last_msg_receipt_time))::int,0) FROM pg_stat_subscription WHERE subname='beedoo_supabase_sub'" 2>/dev/null || echo "0")
TABLE_COUNT=$(sudo -u postgres psql -t -A -d beedoo_prod -c "SELECT count(*) FROM pg_subscription_rel" 2>/dev/null || echo "0")
TOTAL_ROWS=$(sudo -u postgres psql -t -A -d beedoo_prod -c "SELECT sum(n_live_tup) FROM pg_stat_user_tables WHERE schemaname='public'" 2>/dev/null || echo "0")
DISK=$(df -h / | tail -1 | awk '{print $5}')
MEM=$(free -m | awk 'NR==2{printf "%.0f", $3/$2*100}')
echo "{\"status\":\"$([ \"$SUB_STATUS\" = \"t\" ] && echo active || echo inactive)\",\"lag_seconds\":${SUB_LAG:-0},\"synced\":${TABLE_COUNT:-0},\"total_rows\":${TOTAL_ROWS:-0},\"disk\":\"$DISK\",\"memory\":\"${MEM}%\",\"updated\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
STATUS
chmod +x /opt/beedoo/status-api.sh

# Generate status every 10 seconds via cron-like loop
cat > /opt/beedoo/status-loop.sh << 'LOOP'
#!/bin/bash
while true; do
  /opt/beedoo/status-api.sh > /var/www/html/status.json 2>/dev/null
  sleep 10
done
LOOP
chmod +x /opt/beedoo/status-loop.sh

# Systemd service for status loop
cat > /etc/systemd/system/beedoo-status.service << 'SVC'
[Unit]
Description=bee-doo Replica Status API
After=postgresql.service
[Service]
ExecStart=/opt/beedoo/status-loop.sh
Restart=always
[Install]
WantedBy=multi-user.target
SVC

systemctl daemon-reload
systemctl enable beedoo-status
systemctl start beedoo-status

# Nginx config with CORS
cat > /etc/nginx/sites-available/default << 'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    root /var/www/html;
    location /status.json {
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods GET;
        add_header Cache-Control "no-cache, no-store";
        default_type application/json;
    }
}
NGINX

nginx -t && systemctl restart nginx

sleep 3
echo "=== Test ==="
curl -s http://localhost/status.json
echo ""
echo "=== Status API ready at http://91.98.26.59/status.json ==="
