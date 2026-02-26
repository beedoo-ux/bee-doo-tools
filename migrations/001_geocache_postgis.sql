-- Migration: geocaching + PostGIS infas counter
-- Runs automatically via GitHub Action

-- Add geo cache columns to pay_mitarbeiter
ALTER TABLE pay_mitarbeiter 
  ADD COLUMN IF NOT EXISTS geo_lat double precision,
  ADD COLUMN IF NOT EXISTS geo_lng double precision,
  ADD COLUMN IF NOT EXISTS geo_cached_at timestamptz;

-- PostGIS index on infas_adressen for fast spatial queries
CREATE INDEX IF NOT EXISTS idx_infas_utm ON infas_adressen(utm32east, utm32north) 
  WHERE utm32east IS NOT NULL AND utm32north IS NOT NULL;

-- Drop existing functions first (return type changes require DROP)
DROP FUNCTION IF EXISTS count_infas_in_polygon(text);
DROP FUNCTION IF EXISTS update_geo_cache(uuid, double precision, double precision);

-- RPC function: count all 23.4M infas addresses inside a drawn polygon
CREATE OR REPLACE FUNCTION count_infas_in_polygon(geojson_polygon text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result integer;
  poly geometry;
BEGIN
  poly := ST_GeomFromGeoJSON(geojson_polygon);
  
  SELECT COUNT(*)::integer INTO result
  FROM infas_adressen
  WHERE utm32east IS NOT NULL AND utm32north IS NOT NULL
    AND ST_Contains(
      poly,
      ST_Transform(
        ST_SetSRID(
          ST_MakePoint(
            CASE WHEN utm32east > 1000000 THEN utm32east - 32000000 ELSE utm32east END,
            utm32north
          ), 32632
        ), 4326
      )
    );
  
  RETURN jsonb_build_object(
    'count', result,
    'source', 'postgis',
    'total_db', 23454753
  );
END;
$$;

GRANT EXECUTE ON FUNCTION count_infas_in_polygon(text) TO anon, authenticated;

-- RPC function: geocode cache upsert (called from browser after Nominatim)
CREATE OR REPLACE FUNCTION update_geo_cache(
  mitarbeiter_id uuid,
  lat double precision,
  lng double precision
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE pay_mitarbeiter 
  SET geo_lat = lat, geo_lng = lng, geo_cached_at = now()
  WHERE id = mitarbeiter_id;
END;
$$;

GRANT EXECUTE ON FUNCTION update_geo_cache(uuid, double precision, double precision) TO anon, authenticated;
