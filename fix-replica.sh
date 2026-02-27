#!/bin/bash
set -e
echo "=== bee-doo Replica Fix ==="

echo "1/4 Fehlende Tabellen exportieren..."
PGPASSWORD=lw8CzMtZYAJsY45V /usr/lib/postgresql/17/bin/pg_dump \
  -h db.hqzpemfaljxcysyqssng.supabase.co -p 5432 -U postgres -d postgres \
  --schema=public --schema-only --no-owner --no-privileges \
  -t public.customers -t public.documents -t public.infas_adressen \
  -t public.milestones -t public.monitoring_daily -t public.monitoring_monthly \
  -t public.notifications -t public.nps_responses -t public.projects \
  -t public.referrals -t public.vertriebler -t public.whatsapp_notifications \
  > /tmp/missing.sql
echo "   $(wc -l < /tmp/missing.sql) Zeilen exportiert"

echo "2/4 Tabellen importieren..."
sudo -u postgres psql -d beedoo_prod < /tmp/missing.sql 2>&1 | grep -c "CREATE\|ALTER" || true
TCOUNT=$(sudo -u postgres psql -t -A -d beedoo_prod -c "SELECT count(*) FROM pg_tables WHERE schemaname='public';")
echo "   $TCOUNT Tabellen in Replica"

echo "3/4 Publication auf Supabase erstellen..."
PGPASSWORD=lw8CzMtZYAJsY45V psql -h db.hqzpemfaljxcysyqssng.supabase.co -p 5432 -U postgres -d postgres \
  -c "DROP PUBLICATION IF EXISTS beedoo_full_replica; CREATE PUBLICATION beedoo_full_replica FOR TABLES IN SCHEMA public;"

echo "4/4 Subscription starten..."
sudo -u postgres psql -d beedoo_prod -c "DROP SUBSCRIPTION IF EXISTS beedoo_supabase_sub;"
sudo -u postgres psql -d beedoo_prod -c "CREATE SUBSCRIPTION beedoo_supabase_sub CONNECTION 'host=db.hqzpemfaljxcysyqssng.supabase.co port=5432 dbname=postgres user=postgres password=lw8CzMtZYAJsY45V' PUBLICATION beedoo_full_replica WITH (copy_data = true, create_slot = true);"

sleep 5
echo ""
echo "=== STATUS ==="
sudo -u postgres psql -d beedoo_prod -c "SELECT subname, subenabled FROM pg_subscription;"
sudo -u postgres psql -d beedoo_prod -c "SELECT count(*) as syncing_tables FROM pg_subscription_rel;"
echo ""
echo "=== FERTIG! Replication laeuft! ==="
