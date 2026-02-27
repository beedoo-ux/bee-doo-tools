#!/bin/bash
set -e
echo "=== CLEAN REPLICA SETUP ==="

echo "1/4 Schema komplett neu laden..."
sudo -u postgres psql -d beedoo_prod -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; CREATE EXTENSION postgis; CREATE EXTENSION pg_trgm; CREATE EXTENSION \"uuid-ossp\";"
PGPASSWORD=lw8CzMtZYAJsY45V /usr/lib/postgresql/17/bin/pg_dump -h db.hqzpemfaljxcysyqssng.supabase.co -p 5432 -U postgres -d postgres --schema=public --schema-only --no-owner --no-privileges | sudo -u postgres psql -d beedoo_prod 2>&1 | tail -3

TCOUNT=$(sudo -u postgres psql -t -A -d beedoo_prod -c "SELECT count(*) FROM pg_tables WHERE schemaname='public';")
echo "   $TCOUNT Tabellen geladen"

echo "2/4 Supabase Tabellen zaehlen..."
SCOUNT=$(PGPASSWORD=lw8CzMtZYAJsY45V psql -h db.hqzpemfaljxcysyqssng.supabase.co -p 5432 -U postgres -d postgres -t -A -c "SELECT count(*) FROM pg_tables WHERE schemaname='public';")
echo "   Supabase: $SCOUNT | Replica: $TCOUNT"

echo "3/4 Publication..."
PGPASSWORD=lw8CzMtZYAJsY45V psql -h db.hqzpemfaljxcysyqssng.supabase.co -p 5432 -U postgres -d postgres -c "DROP PUBLICATION IF EXISTS beedoo_full_replica; CREATE PUBLICATION beedoo_full_replica FOR TABLES IN SCHEMA public;"

echo "4/4 Subscription..."
sudo -u postgres psql -d beedoo_prod -c "DROP SUBSCRIPTION IF EXISTS beedoo_supabase_sub;" 2>/dev/null || true
sudo -u postgres psql -d beedoo_prod -c "CREATE SUBSCRIPTION beedoo_supabase_sub CONNECTION 'host=db.hqzpemfaljxcysyqssng.supabase.co port=5432 dbname=postgres user=postgres password=lw8CzMtZYAJsY45V' PUBLICATION beedoo_full_replica WITH (copy_data = true, create_slot = true);"

sleep 5
sudo -u postgres psql -d beedoo_prod -c "SELECT subname, subenabled FROM pg_subscription;"
echo "=== DONE ==="
