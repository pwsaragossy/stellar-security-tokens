-- Migration: Create triggers for automatic updated_at column updates
-- Ensures updated_at is always current without manual updates

-- Function to update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for investors table
DROP TRIGGER IF EXISTS update_investors_updated_at ON investors;
CREATE TRIGGER update_investors_updated_at
  BEFORE UPDATE ON investors
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for tokens table
DROP TRIGGER IF EXISTS update_tokens_updated_at ON tokens;
CREATE TRIGGER update_tokens_updated_at
  BEFORE UPDATE ON tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

