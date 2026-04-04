-- ============================================
-- SERVICE PREFERENCES
-- Per-service configuration for the unified setup flow
-- ============================================

CREATE TABLE IF NOT EXISTS user_service_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cortex_user_id TEXT NOT NULL,
    service TEXT NOT NULL,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    configured_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(cortex_user_id, service)
);

ALTER TABLE user_service_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on user_service_preferences" ON user_service_preferences;
CREATE POLICY "Service role full access on user_service_preferences" ON user_service_preferences
    FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_user_service_preferences_updated_at ON user_service_preferences;
CREATE TRIGGER update_user_service_preferences_updated_at
    BEFORE UPDATE ON user_service_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_user_service_preferences_user
    ON user_service_preferences(cortex_user_id);
CREATE INDEX IF NOT EXISTS idx_user_service_preferences_user_service
    ON user_service_preferences(cortex_user_id, service);
