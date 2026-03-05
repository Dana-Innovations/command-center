-- ============================================
-- COMMAND CENTER DATABASE SCHEMA
-- Follows Cortex patterns: RLS, audit logging,
-- updated_at triggers, proper indexes
-- ============================================

-- ============================================
-- 1. ENHANCE USER PROFILES (existing table)
-- ============================================

-- Add user_id column (references nothing since we use Cortex OAuth, not Supabase Auth)
-- but keeps the pattern consistent
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 2. SYNC LOG (activity tracking)
-- ============================================

CREATE TABLE IF NOT EXISTS sync_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_type TEXT NOT NULL,
    items_synced INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    user_id TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on sync_log" ON sync_log
    FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_sync_log_started_at ON sync_log(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_log_data_type ON sync_log(data_type);
CREATE INDEX IF NOT EXISTS idx_sync_log_user_id ON sync_log(user_id);

-- Enable realtime for sync_log
ALTER PUBLICATION supabase_realtime ADD TABLE sync_log;

-- ============================================
-- 3. AUDIT LOG (Cortex pattern)
-- ============================================

CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    details JSONB,
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on audit_log" ON audit_log
    FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);

-- ============================================
-- 4. EMAILS
-- ============================================

CREATE TABLE IF NOT EXISTS emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    from_name TEXT,
    from_email TEXT,
    subject TEXT,
    preview TEXT,
    body_html TEXT,
    received_at TIMESTAMPTZ,
    is_read BOOLEAN DEFAULT FALSE,
    folder TEXT,
    has_attachments BOOLEAN DEFAULT FALSE,
    outlook_url TEXT,
    needs_reply BOOLEAN DEFAULT FALSE,
    days_overdue INTEGER DEFAULT 0,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, message_id)
);

ALTER TABLE emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on emails" ON emails
    FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_emails_updated_at ON emails;
CREATE TRIGGER update_emails_updated_at
    BEFORE UPDATE ON emails
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_emails_user_id ON emails(user_id);
CREATE INDEX IF NOT EXISTS idx_emails_received_at ON emails(received_at DESC);

-- ============================================
-- 5. CALENDAR EVENTS
-- ============================================

CREATE TABLE IF NOT EXISTS calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    subject TEXT,
    location TEXT,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    is_all_day BOOLEAN DEFAULT FALSE,
    organizer TEXT,
    is_online BOOLEAN DEFAULT FALSE,
    join_url TEXT,
    outlook_url TEXT,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, event_id)
);

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on calendar_events" ON calendar_events
    FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_calendar_events_updated_at ON calendar_events;
CREATE TRIGGER update_calendar_events_updated_at
    BEFORE UPDATE ON calendar_events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_calendar_events_user_id ON calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start ON calendar_events(start_time);

-- ============================================
-- 6. TASKS (Asana)
-- ============================================

CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    task_gid TEXT NOT NULL,
    name TEXT,
    notes TEXT,
    due_on DATE,
    completed BOOLEAN DEFAULT FALSE,
    assignee TEXT,
    project_name TEXT,
    permalink_url TEXT,
    priority TEXT,
    days_overdue INTEGER DEFAULT 0,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, task_gid)
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on tasks" ON tasks
    FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks;
CREATE TRIGGER update_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_on) WHERE NOT completed;

-- ============================================
-- 7. TEAMS CHANNELS
-- ============================================

CREATE TABLE IF NOT EXISTS teams_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    team_id TEXT,
    team_name TEXT,
    channel_id TEXT NOT NULL,
    channel_name TEXT,
    is_private BOOLEAN DEFAULT FALSE,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, channel_id)
);

ALTER TABLE teams_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on teams_channels" ON teams_channels
    FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_teams_channels_updated_at ON teams_channels;
CREATE TRIGGER update_teams_channels_updated_at
    BEFORE UPDATE ON teams_channels
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_teams_channels_user_id ON teams_channels(user_id);
CREATE INDEX IF NOT EXISTS idx_teams_channels_team_name ON teams_channels(team_name);

-- ============================================
-- 8. CHATS (Teams)
-- ============================================

CREATE TABLE IF NOT EXISTS chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    topic TEXT,
    chat_type TEXT,
    last_message_preview TEXT,
    last_message_from TEXT,
    last_activity TIMESTAMPTZ,
    members TEXT[],
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, chat_id)
);

ALTER TABLE chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on chats" ON chats
    FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_chats_updated_at ON chats;
CREATE TRIGGER update_chats_updated_at
    BEFORE UPDATE ON chats
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats(user_id);

-- ============================================
-- 9. SLACK FEED
-- ============================================

CREATE TABLE IF NOT EXISTS slack_feed (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_ts TEXT NOT NULL UNIQUE,
    author_name TEXT,
    author_id TEXT,
    text TEXT,
    timestamp TIMESTAMPTZ,
    channel_name TEXT,
    reactions JSONB DEFAULT '[]',
    thread_reply_count INTEGER DEFAULT 0,
    has_files BOOLEAN DEFAULT FALSE,
    permalink TEXT,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE slack_feed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on slack_feed" ON slack_feed
    FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_slack_feed_updated_at ON slack_feed;
CREATE TRIGGER update_slack_feed_updated_at
    BEFORE UPDATE ON slack_feed
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_slack_feed_timestamp ON slack_feed(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_slack_feed_channel ON slack_feed(channel_name);

-- ============================================
-- 10. SALESFORCE OPPORTUNITIES
-- ============================================

CREATE TABLE IF NOT EXISTS salesforce_opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    sf_opportunity_id TEXT NOT NULL,
    name TEXT,
    account_name TEXT,
    owner_name TEXT,
    stage TEXT,
    amount NUMERIC,
    probability NUMERIC,
    close_date DATE,
    days_to_close INTEGER,
    is_closed BOOLEAN DEFAULT FALSE,
    is_won BOOLEAN DEFAULT FALSE,
    last_activity_date DATE,
    next_step TEXT,
    territory TEXT,
    sales_channel TEXT,
    opp_type TEXT,
    forecast_category TEXT,
    record_type TEXT,
    product_line TEXT,
    age_in_days INTEGER,
    days_in_stage INTEGER,
    has_overdue_task BOOLEAN,
    push_count INTEGER,
    sf_url TEXT,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, sf_opportunity_id)
);

ALTER TABLE salesforce_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on salesforce_opportunities" ON salesforce_opportunities
    FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_salesforce_opportunities_updated_at ON salesforce_opportunities;
CREATE TRIGGER update_salesforce_opportunities_updated_at
    BEFORE UPDATE ON salesforce_opportunities
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_sf_opps_user_id ON salesforce_opportunities(user_id);
CREATE INDEX IF NOT EXISTS idx_sf_opps_stage ON salesforce_opportunities(stage) WHERE NOT is_closed;
CREATE INDEX IF NOT EXISTS idx_sf_opps_close_date ON salesforce_opportunities(close_date);

-- ============================================
-- 11. SALESFORCE REPORTS
-- ============================================

CREATE TABLE IF NOT EXISTS salesforce_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    sf_report_id TEXT NOT NULL,
    name TEXT,
    description TEXT,
    report_type TEXT,
    last_run_date TIMESTAMPTZ,
    summary_data JSONB DEFAULT '{}',
    sf_url TEXT,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, sf_report_id)
);

ALTER TABLE salesforce_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on salesforce_reports" ON salesforce_reports
    FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_salesforce_reports_updated_at ON salesforce_reports;
CREATE TRIGGER update_salesforce_reports_updated_at
    BEFORE UPDATE ON salesforce_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_sf_reports_user_id ON salesforce_reports(user_id);

-- ============================================
-- 12. ACTION QUEUE
-- ============================================

CREATE TABLE IF NOT EXISTS action_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_type TEXT NOT NULL,
    payload JSONB DEFAULT '{}',
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE action_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on action_queue" ON action_queue
    FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_action_queue_updated_at ON action_queue;
CREATE TRIGGER update_action_queue_updated_at
    BEFORE UPDATE ON action_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_action_queue_status ON action_queue(status);
CREATE INDEX IF NOT EXISTS idx_action_queue_created_at ON action_queue(created_at DESC);

-- Enable realtime for action_queue
ALTER PUBLICATION supabase_realtime ADD TABLE action_queue;

-- ============================================
-- 13. GRANTS (Cortex pattern)
-- ============================================

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
