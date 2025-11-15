-- Migration: Optimize table settings for better performance
-- Adjusts fillfactor and autovacuum settings for tables with frequent updates

-- Set fillfactor for tables with frequent updates (leaves space for HOT updates)
ALTER TABLE investors SET (fillfactor = 90);
ALTER TABLE tokens SET (fillfactor = 90);
ALTER TABLE interest_payments SET (fillfactor = 90);

-- Optimize autovacuum for large tables (interest_payments will grow over time)
ALTER TABLE interest_payments SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

-- Optimize autovacuum for token_distributions (will grow with usage)
ALTER TABLE token_distributions SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

