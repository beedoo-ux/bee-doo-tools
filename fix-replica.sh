#!/bin/bash
set -e
echo "=== bee-doo Replica Fix v2 ==="

echo "1/5 Alle fehlenden Tabellen finden..."
PGPASSWORD=lw8CzMtZYAJsY45V psql -h db.hqzpemfaljxcysyqssng.supabase.co -p 5432 -U postgres -d postgres -t -A -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;" > /tmp/sb.txt
sudo -u postgres psql -d beedoo_prod -t -A -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;" > /tmp/rp.txt
MISSING=$(sort /tmp/sb.txt /tmp/rp.txt | uniq -u | grep -Ff /tmp/sb.txt || true)
echo "   Fehlend: $MISSING"

if [ -n "$MISSING" ]; then
  echo "2/5 Fehlende Tabellen exportieren..."
  TABLES=""
  for t in $MISSING; do TABLES="$TABLES -t public.$t"; done
  PGPASSWORD=lw8CzMtZYAJsY45V /usr/lib/postgresql/17/bin/pg_dump \
    -h db.hqzpemfaljxcysyqssng.supabase.co -p 5432 -U postgres -d postgres \
    --schema=public --schema-only --no-owner --no-privileges $TABLES > /tmp/missing2.sql
  echo "   $(wc -l < /tmp/missing2.sql) Zeilen exportiert"
  
  echo "3/5 Tabellen importieren..."
  sudo -u postgres psql -d beedoo_prod < /tmp/missing2.sql 2>&1 | tail -3
fi

TCOUNT=$(sudo -u postgres psql -t -A -d beedoo_prod -c "SELECT count(*) FROM pg_tables WHERE schemaname='public';")
echo "   $TCOUNT Tabellen in Replica"

echo "4/5 Publication aktualisieren..."
PGPASSWORD=lw8CzMtZYAJsY45V psql -h db.hqzpemfaljxcysyqssng.supabase.co -p 5432 -U postgres -d postgres \
  -c "DROP PUBLICATION IF EXISTS beedoo_full_replica; CREATE PUBLICATION beedoo_full_replica FOR TABLES IN SCHEMA public;"

echo "5/5 Subscription starten..."
sudo -u postgres psql -d beedoo_prod -c "DROP SUBSCRIPTION IF EXISTS beedoo_supabase_sub;" 2>/dev/null
sudo -u postgres psql -d beedoo_prod -c "CREATE SUBSCRIPTION beedoo_supabase_sub CONNECTION 'host=db.hqzpemfaljxcysyqssng.supabase.co port=5432 dbname=postgres user=postgres password=lw8CzMtZYAJsY45V' PUBLICATION beedoo_full_replica WITH (copy_data = true, create_slot = true);"

sleep 5
echo ""
echo "=== STATUS ==="
sudo -u postgres psql -d beedoo_prod -c "SELECT subname, subenabled FROM pg_subscription;"
SYNCING=$(sudo -u postgres psql -t -A -d beedoo_prod -c "SELECT count(*) FROM pg_subscription_rel;" 2>/dev/null || echo "0")
echo "Tabellen in Sync: $SYNCING"
echo ""
echo "=== FERTIG! ==="
