-- Connection status cache for resilient service detection
-- Stores last-known connection status per user per service,
-- used as fallback when Cortex connections API is unavailable.

CREATE TABLE IF NOT EXISTS connection_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  service TEXT NOT NULL,
  connected BOOLEAN NOT NULL DEFAULT false,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, service)
);

ALTER TABLE connection_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own connection status"
  ON connection_status FOR SELECT
  USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

CREATE TRIGGER set_connection_status_updated_at
  BEFORE UPDATE ON connection_status
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_connection_status_user ON connection_status(user_id);
