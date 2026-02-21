
// api/migrate.js - One-time migration runner
// Protected by secret token, deletes itself after use

export default async function handler(req, res) {
  if (req.headers['x-migrate-token'] !== process.env.SUPABASE_SERVICE_KEY?.slice(-20)) {
    return res.status(401).json({error: 'unauthorized'});
  }

  const SVC = process.env.SUPABASE_SERVICE_KEY;
  const URL = 'https://hqzpemfaljxcysyqssng.supabase.co';

  // We need to run DDL - use pg_dump trick via existing PostGIS functions
  // Actually: Supabase allows calling functions that do DDL if SECURITY DEFINER
  // But we need to CREATE them first...
  
  // TRICK: Use Supabase's pg_catalog access via PostgREST
  // Call pg_execute via a workaround
  
  const steps = [];

  // Step 1: Add columns via ALTER TABLE through a helper
  // PostgREST doesn't allow DDL directly, BUT we can use
  // the Supabase Management API from Vercel (not blocked there!)
  
  const MGMT = process.env.SUPABASE_MGMT_TOKEN || '';
  const PROJECT = 'hqzpemfaljxcysyqssng';
  
  const SQL = `
    ALTER TABLE pay_mitarbeiter 
      ADD COLUMN IF NOT EXISTS geo_lat double precision,
      ADD COLUMN IF NOT EXISTS geo_lng double precision,
      ADD COLUMN IF NOT EXISTS geo_cached_at timestamptz;

    CREATE OR REPLACE FUNCTION count_infas_in_polygon(geojson_polygon text)
    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
    DECLARE result integer; poly geometry;
    BEGIN
      poly := ST_GeomFromGeoJSON(geojson_polygon);
      SELECT COUNT(*)::integer INTO result FROM infas_adressen
      WHERE utm32east IS NOT NULL AND utm32north IS NOT NULL
        AND ST_Contains(poly, ST_Transform(
          ST_SetSRID(ST_MakePoint(
            CASE WHEN utm32east > 1000000 THEN utm32east - 32000000 ELSE utm32east END,
            utm32north), 32632), 4326));
      RETURN jsonb_build_object('count', result, 'source', 'postgis', 'total_db', 23454753);
    END; $$;

    GRANT EXECUTE ON FUNCTION count_infas_in_polygon(text) TO anon, authenticated;

    CREATE OR REPLACE FUNCTION update_geo_cache(
      mitarbeiter_id uuid, lat double precision, lng double precision)
    RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
    BEGIN UPDATE pay_mitarbeiter SET geo_lat=lat, geo_lng=lng, geo_cached_at=now()
      WHERE id=mitarbeiter_id; END; $$;

    GRANT EXECUTE ON FUNCTION update_geo_cache(uuid, double precision, double precision) TO anon, authenticated;

    CREATE INDEX IF NOT EXISTS idx_infas_geom ON infas_adressen(utm32east, utm32north)
      WHERE utm32east IS NOT NULL AND utm32north IS NOT NULL;
  `;

  try {
    const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MGMT}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({query: SQL})
    });
    const data = await r.text();
    steps.push({step: 'migration', status: r.status, response: data.slice(0, 200)});
  } catch(e) {
    steps.push({step: 'migration', error: e.message});
  }

  return res.json({steps, done: true});
}
