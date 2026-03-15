-- ============================================
-- ATTENTION SYSTEM
-- Explicit focus preferences + learning feedback
-- ============================================

CREATE TABLE IF NOT EXISTS user_settings (
    cortex_user_id TEXT PRIMARY KEY,
    preference_version INTEGER NOT NULL DEFAULT 1,
    onboarding JSONB NOT NULL DEFAULT '{}'::jsonb,
    dashboard JSONB NOT NULL DEFAULT '{}'::jsonb,
    advanced_ranking JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on user_settings" ON user_settings;
CREATE POLICY "Service role full access on user_settings" ON user_settings
    FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_user_settings_updated_at ON user_settings;
CREATE TRIGGER update_user_settings_updated_at
    BEFORE UPDATE ON user_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_user_settings_updated_at ON user_settings(updated_at DESC);

CREATE TABLE IF NOT EXISTS user_focus_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cortex_user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    parent_entity_type TEXT,
    parent_entity_id TEXT,
    label_snapshot TEXT,
    importance TEXT NOT NULL CHECK (importance IN ('critical', 'normal', 'quiet', 'muted')),
    selector JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(cortex_user_id, provider, entity_type, entity_id)
);

ALTER TABLE user_focus_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on user_focus_preferences" ON user_focus_preferences;
CREATE POLICY "Service role full access on user_focus_preferences" ON user_focus_preferences
    FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_user_focus_preferences_updated_at ON user_focus_preferences;
CREATE TRIGGER update_user_focus_preferences_updated_at
    BEFORE UPDATE ON user_focus_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_user_focus_preferences_user_provider
    ON user_focus_preferences(cortex_user_id, provider);
CREATE INDEX IF NOT EXISTS idx_user_focus_preferences_user_importance
    ON user_focus_preferences(cortex_user_id, provider, importance);
CREATE INDEX IF NOT EXISTS idx_user_focus_preferences_parent
    ON user_focus_preferences(cortex_user_id, parent_entity_type, parent_entity_id);

CREATE TABLE IF NOT EXISTS user_item_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cortex_user_id TEXT NOT NULL,
    item_type TEXT NOT NULL,
    item_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    surface TEXT NOT NULL,
    title TEXT,
    feedback TEXT NOT NULL CHECK (feedback IN ('raise', 'right', 'lower')),
    shown_score NUMERIC,
    resource_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    actor_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    topic_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(cortex_user_id, item_type, item_id)
);

ALTER TABLE user_item_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on user_item_feedback" ON user_item_feedback;
CREATE POLICY "Service role full access on user_item_feedback" ON user_item_feedback
    FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_user_item_feedback_updated_at ON user_item_feedback;
CREATE TRIGGER update_user_item_feedback_updated_at
    BEFORE UPDATE ON user_item_feedback
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_user_item_feedback_user_updated
    ON user_item_feedback(cortex_user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS user_feedback_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cortex_user_id TEXT NOT NULL,
    item_type TEXT NOT NULL,
    item_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    surface TEXT NOT NULL,
    title TEXT,
    old_feedback TEXT CHECK (old_feedback IN ('raise', 'right', 'lower')),
    new_feedback TEXT NOT NULL CHECK (new_feedback IN ('raise', 'right', 'lower')),
    shown_score NUMERIC,
    resource_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    actor_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    topic_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_feedback_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on user_feedback_events" ON user_feedback_events;
CREATE POLICY "Service role full access on user_feedback_events" ON user_feedback_events
    FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_user_feedback_events_user_created
    ON user_feedback_events(cortex_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_feedback_events_item
    ON user_feedback_events(cortex_user_id, item_type, item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_priority_biases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cortex_user_id TEXT NOT NULL,
    dimension_type TEXT NOT NULL CHECK (dimension_type IN ('resource', 'actor', 'topic', 'provider')),
    dimension_key TEXT NOT NULL,
    bias_score NUMERIC NOT NULL DEFAULT 0,
    sample_count INTEGER NOT NULL DEFAULT 0,
    positive_count INTEGER NOT NULL DEFAULT 0,
    negative_count INTEGER NOT NULL DEFAULT 0,
    last_feedback_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(cortex_user_id, dimension_type, dimension_key)
);

ALTER TABLE user_priority_biases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on user_priority_biases" ON user_priority_biases;
CREATE POLICY "Service role full access on user_priority_biases" ON user_priority_biases
    FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_user_priority_biases_updated_at ON user_priority_biases;
CREATE TRIGGER update_user_priority_biases_updated_at
    BEFORE UPDATE ON user_priority_biases
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_user_priority_biases_user_type
    ON user_priority_biases(cortex_user_id, dimension_type);
CREATE INDEX IF NOT EXISTS idx_user_priority_biases_user_score
    ON user_priority_biases(cortex_user_id, bias_score DESC);
