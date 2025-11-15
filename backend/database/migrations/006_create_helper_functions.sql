-- Migration: Create helper functions for common queries
-- Provides reusable functions for frequently used database operations

-- Function to get investor token balance
CREATE OR REPLACE FUNCTION get_investor_balance(
  p_investor_id INTEGER,
  p_asset_code VARCHAR(12)
) RETURNS NUMERIC AS $$
DECLARE
  v_balance NUMERIC;
BEGIN
  SELECT COALESCE(SUM(amount), 0)
  INTO v_balance
  FROM token_distributions
  WHERE investor_id = p_investor_id 
    AND asset_code = p_asset_code;
  
  RETURN v_balance;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get payment statistics
CREATE OR REPLACE FUNCTION get_payment_statistics(
  p_start_date DATE,
  p_end_date DATE,
  p_asset_code VARCHAR(12) DEFAULT NULL
) RETURNS TABLE (
  payment_date DATE,
  total_payments BIGINT,
  total_usdc NUMERIC,
  unique_investors BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ip.payment_date,
    COUNT(*)::BIGINT as total_payments,
    SUM(ip.usdc_amount) as total_usdc,
    COUNT(DISTINCT ip.investor_id)::BIGINT as unique_investors
  FROM interest_payments ip
  WHERE ip.payment_date BETWEEN p_start_date AND p_end_date
    AND (p_asset_code IS NULL OR ip.asset_code = p_asset_code)
    AND ip.status = 'completed'
  GROUP BY ip.payment_date
  ORDER BY ip.payment_date DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get investor summary with balances
CREATE OR REPLACE FUNCTION get_investor_summary(
  p_investor_id INTEGER,
  p_asset_code VARCHAR(12) DEFAULT NULL
) RETURNS TABLE (
  investor_id INTEGER,
  investor_name VARCHAR(255),
  investor_email VARCHAR(255),
  kyc_status VARCHAR(20),
  asset_code VARCHAR(12),
  total_balance NUMERIC,
  distribution_count BIGINT,
  last_distribution_date TIMESTAMP,
  total_interest_received NUMERIC,
  payment_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    i.id as investor_id,
    i.name as investor_name,
    i.email as investor_email,
    i.kyc_status,
    COALESCE(td.asset_code, p_asset_code) as asset_code,
    COALESCE(SUM(td.amount), 0) as total_balance,
    COUNT(td.id)::BIGINT as distribution_count,
    MAX(td.created_at) as last_distribution_date,
    COALESCE(SUM(ip.usdc_amount), 0) as total_interest_received,
    COUNT(ip.id)::BIGINT as payment_count
  FROM investors i
  LEFT JOIN token_distributions td ON td.investor_id = i.id 
    AND (p_asset_code IS NULL OR td.asset_code = p_asset_code)
  LEFT JOIN interest_payments ip ON ip.investor_id = i.id 
    AND (p_asset_code IS NULL OR ip.asset_code = p_asset_code)
    AND ip.status = 'completed'
  WHERE i.id = p_investor_id
  GROUP BY i.id, i.name, i.email, i.kyc_status, td.asset_code;
END;
$$ LANGUAGE plpgsql STABLE;

