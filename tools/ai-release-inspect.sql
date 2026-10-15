-- Safe read-only baseline inspection for M00-M05 release.
-- Run separately via Supabase SQL Editor against STAGING and PRODUCTION.
-- No rows, customer data, API keys or secrets are returned.
SELECT jsonb_build_object(
 'tables',coalesce((
  SELECT jsonb_agg(t.table_name ORDER BY t.table_name)
  FROM information_schema.tables t
  WHERE t.table_schema='public' AND t.table_type='BASE TABLE'
 ),'[]'::jsonb),
 'columns',coalesce((
  SELECT jsonb_object_agg(t.table_name,t.names)
  FROM (SELECT c.table_name,jsonb_agg(c.column_name ORDER BY c.column_name) names
       FROM information_schema.columns c
       WHERE c.table_schema='public'
       GROUP BY c.table_name)t
 ),'{}'::jsonb)
) AS ai_release_schema_snapshot;
