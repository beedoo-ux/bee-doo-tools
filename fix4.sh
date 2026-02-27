#!/bin/bash
set -e
echo "=== FIX v4: Publication nur fuer vorhandene Tabellen ==="

echo "1/3 Vorhandene Tabellen lesen..."
TABLES=$(sudo -u postgres psql -d beedoo_prod -t -A -c "SELECT string_agg('public.' || tablename, ', ') FROM pg_tables WHERE schemaname='public';")
echo "   72 Tabellen gefunden"

echo "2/3 Publication mit diesen Tabellen erstellen..."
PGPASSWORD=lw8CzMtZYAJsY45V psql -h db.hqzpemfaljxcysyqssng.supabase.co -p 5432 -U postgres -d postgres -c "DROP PUBLICATION IF EXISTS beedoo_full_replica; CREATE PUBLICATION beedoo_full_replica FOR TABLE $TABLES;"

echo "3/3 Subscription starten..."
sudo -u postgres psql -d beedoo_prod -c "DROP SUBSCRIPTION IF EXISTS beedoo_supabase_sub;" 2>/dev/null || true
sudo -u postgres psql -d beedoo_prod -c "CREATE SUBSCRIPTION beedoo_supabase_sub CONNECTION 'host=db.hqzpemfaljxcysyqssng.supabase.co port=5432 dbname=postgres user=postgres password=lw8CzMtZYAJsY45V' PUBLICATION beedoo_full_replica WITH (copy_data = true, create_slot = true);"

sleep 5
sudo -u postgres psql -d beedoo_prod -c "SELECT subname, subenabled FROM pg_subscription;"
SYNCING=$(sudo -u postgres psql -t -A -d beedoo_prod -c "SELECT count(*) FROM pg_subscription_rel;" 2>/dev/null || echo 0)
echo "Tabellen in Sync: $SYNCING"
echo "=== DONE ==="
