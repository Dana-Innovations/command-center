# Supabase

## Clients

- `createAuthClient()` in `server.ts` — respects RLS, use for reads and user-facing queries
- `createServiceClient()` in `server.ts` — bypasses RLS, use ONLY in `/api/sync/*` routes for upserts
- `getSupabase()` in `client.ts` — browser singleton with no-op proxy fallback when env vars missing

## Tables (15)

**Core:** `user_profiles`, `emails`, `calendar_events`, `tasks`, `chats`, `teams_channels`, `slack_feed`
**Business:** `salesforce_opportunities`, `salesforce_reports`, `bookings_targets`
**System:** `sync_log`, `action_queue`, `audit_log`
**Attention:** `user_settings`, `focus_preferences`, `item_feedback`, `priority_bias`

## Patterns

- **RLS on every table** — policies grant access via service-role key only; auth client respects user-scoped access
- **Upsert pattern:** `supabase.from(table).upsert(rows, { onConflict: 'user_id,<entity_id>' })`
- **Sync logging:** every sync route logs to `sync_log` (`data_type`, `items_synced`, `status`, `user_id`)
- **updated_at trigger** on all tables — auto-maintained by Postgres
- **All queries must include `user_id`** — RLS policies filter by it

## Schema Changes

- MUST create a new migration file in `supabase/migrations/`
- MUST NOT modify existing migration files
- Reference `20260305_setup_schema.sql` for patterns (RLS policies, indexes, triggers)
- Every new table needs: RLS enabled, service-role INSERT/UPDATE/SELECT policy, `updated_at` trigger, appropriate indexes
