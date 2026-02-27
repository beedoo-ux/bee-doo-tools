#!/bin/bash
echo "=== Fix Status Script ==="

cat > /opt/beedoo/status.sh << 'STATUSEOF'
#!/bin/bash
export PGPASSWORD="j64Xur3HMGeJJh5Xku08"
DB_USER="beedoo_replica"
DB_NAME="beedoo_prod"
PSQL="psql -U $DB_USER -d $DB_NAME -t -A"

ENABLED=$($PSQL -c "SELECT subenabled FROM pg_subscription WHERE subname='beedoo_supabase_sub'" 2>/dev/null | head -1)
LAG=$($PSQL -c "SELECT COALESCE(EXTRACT(EPOCH FROM (now() - last_msg_send_time))::int, -1) FROM pg_stat_subscription WHERE subname='beedoo_supabase_sub'" 2>/dev/null | head -1)
TABLES=$($PSQL -c "SELECT count(*) FROM pg_subscription_rel" 2>/dev/null | head -1)
[ -z "$LAG" ] && LAG=-1
[ -z "$TABLES" ] && TABLES=0
[ "$ENABLED" = "t" ] && EN="true" || EN="false"

ROWS=$($PSQL -c "SELECT json_object_agg(relname, n_live_tup ORDER BY n_live_tup DESC) FROM (SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 15) t" 2>/dev/null | head -1)
[ -z "$ROWS" ] && ROWS="{}"

DISK_TOTAL=$(df -BG / | awk 'NR==2{gsub("G","");print $2}')
DISK_USED=$(df -BG / | awk 'NR==2{gsub("G","");print $3}')
DISK_PCT=$(df / | awk 'NR==2{gsub("%","");print $5}')
MEM_TOTAL=$(free -m | awk '/^Mem:/{print $2}')
MEM_USED=$(free -m | awk '/^Mem:/{print $3}')
LOAD=$(cat /proc/loadavg | awk '{print $1}')
PG_STATUS=$(systemctl is-active postgresql 2>/dev/null || echo "unknown")

printf '{"status":"ok","timestamp":"%s","replication":{"enabled":%s,"lag_seconds":%s,"tables":%s},"rows":%s,"system":{"disk_total_gb":%s,"disk_used_gb":%s,"disk_pct":%s,"mem_total_mb":%s,"mem_used_mb":%s,"load":%s,"postgresql":"%s"}}' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$EN" "$LAG" "$TABLES" "$ROWS" "$DISK_TOTAL" "$DISK_USED" "$DISK_PCT" "$MEM_TOTAL" "$MEM_USED" "$LOAD" "$PG_STATUS" | python3 -m json.tool
STATUSEOF

chmod +x /opt/beedoo/status.sh
/opt/beedoo/status.sh > /var/www/html/status
cp /var/www/html/status /var/www/html/status.json
systemctl restart beedoo-status 2>/dev/null || true

echo ""
echo "=== Testing ==="
python3 -c "import json; d=json.load(open('/var/www/html/status')); print('JSON valid'); print(f'Lag: {d[\"replication\"][\"lag_seconds\"]}s, Tables: {d[\"replication\"][\"tables\"]}')"
