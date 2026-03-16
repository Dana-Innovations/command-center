-- ============================================
-- MORNING BRIEF CACHE
-- Stores AI-generated daily briefs per user
-- ============================================

CREATE TABLE IF NOT EXISTS morning_brief_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cortex_user_id TEXT NOT NULL,
    brief_date DATE NOT NULL,
    brief_json JSONB NOT NULL,
    input_hash TEXT NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    model_id TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
    token_count INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(cortex_user_id, brief_date)
);

ALTER TABLE morning_brief_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on morning_brief_cache" ON morning_brief_cache;
CREATE POLICY "Service role full access on morning_brief_cache" ON morning_brief_cache
    FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_morning_brief_cache_updated_at ON morning_brief_cache;
CREATE TRIGGER update_morning_brief_cache_updated_at
    BEFORE UPDATE ON morning_brief_cache
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_morning_brief_cache_user_date
    ON morning_brief_cache(cortex_user_id, brief_date);
CREATE INDEX IF NOT EXISTS idx_morning_brief_cache_user_expires
    ON morning_brief_cache(cortex_user_id, expires_at);
