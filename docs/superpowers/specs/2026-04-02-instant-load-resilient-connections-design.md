# Instant Load & Resilient Connections

**Date:** 2026-04-02
**Status:** Approved
**Approach:** Supabase-first loading + resilient connection status

## Context

When users open Command Center, two problems make the experience slow and frustrating:

1. **M365 appears "disconnected" every session** -- `getConnections()` in `src/lib/cortex/connections.ts` silently returns `[]` on any HTTP error, making all services appear disconnected even though the Cortex token auto-refresh in middleware works fine. Users are forced to re-authenticate through the Microsoft OAuth flow unnecessarily.

2. **No cached data on cold open** -- `/api/data/live` fetches everything fresh from Cortex every time (15-50 API calls, 600-2000ms). The sync routes already write all this data to Supabase, but the live endpoint never reads from it. Users stare at skeletons even though yesterday's data is sitting in the database.

## Part 1: Resilient Connection Status

### 1a. Retry with delay

**File:** `src/lib/cortex/connections.ts`

When `getConnections()` fails (HTTP error from Cortex `/api/v1/oauth/connections`), retry once after 500ms before giving up. Currently it returns `[]` silently.

### 1b. Cache last-known status in Supabase

**New table:** `connection_status`

```sql
CREATE TABLE connection_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  service TEXT NOT NULL,        -- 'm365', 'asana', 'slack', 'salesforce', 'powerbi', 'monday'
  connected BOOLEAN NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, service)
);

ALTER TABLE connection_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own status" ON connection_status
  FOR SELECT USING (user_id = current_setting('request.jwt.claims')::json->>'sub');

CREATE TRIGGER set_updated_at BEFORE UPDATE ON connection_status
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_connection_status_user ON connection_status(user_id);
```

**Write path (in `/api/data/live`):** After each successful `getConnections()` call, upsert results to `connection_status` via `createServiceClient()`.

**Read path (fallback):** If `getConnections()` fails after retry, read from `connection_status` where `checked_at` is < 1 hour old. If cache is also stale (> 1 hour), return empty with `connectionError: true`.

### 1c. Log failures

When `getConnections()` fails, `console.error` with HTTP status and truncated response body. Currently the error is swallowed silently.

### 1d. Propagate partial failures

`/api/data/live` response gains a new field: `connectionError: boolean`. When true, frontend knows the connection check failed and cached status was used. This enables the UI to show "Some services may be stale" instead of hiding all sections.

## Part 2: Supabase-First Data Loading

### 2a. New endpoint: `/api/data/cached`

**File:** `src/app/api/data/cached/route.ts` (new)

Authenticates via `getCortexUserFromRequest()` (same as other routes). Reads all user data from Supabase using `createAuthClient()` (RLS-filtered). Returns the same shape as `/api/data/live`. Connection status is read via `createServiceClient()` from `connection_status` table (service-role, since RLS on that table uses JWT claims that may not be present in this context).

**Tables queried:**
- `emails` (inbox + sent, ordered by `received_at` desc, limit 50)
- `calendar_events` (future events, ordered by `start_time` asc)
- `tasks` (ordered by `due_on` asc)
- `teams_channels`
- `teams_channel_messages` (ordered by `timestamp` desc, limit 200)
- `chats` (ordered by `last_activity` desc)
- `salesforce_opportunities` (where `is_closed = false`)
- `slack_messages` (ordered by `timestamp` desc, limit 100)
- `connection_status` (for which services are connected)
- `sync_log` (most recent entry per `data_type` for `cachedAt` timestamps)

**Response:**
```typescript
{
  emails: Email[],
  sentEmails: Email[],
  calendar: CalendarEvent[],
  tasks: Task[],
  chats: Chat[],
  teamsChannelMessages: TeamsChannelMessage[],
  slack: SlackMessage[],
  pipeline: SalesforceOpportunity[],
  connections: { m365: boolean, asana: boolean, ... },
  source: "cache",
  cachedAt: string,   // ISO timestamp of most recent sync_log entry
  fetchedAt: string,
}
```

**Performance target:** < 100ms (single Supabase round-trip with parallel queries via `Promise.all`).

### 2b. LiveDataProvider two-phase fetch

**File:** `src/lib/live-data-context.tsx`

New loading strategy on mount:

1. **Phase 1 (immediate):** Call `/api/data/cached` → set state with cached data → UI renders immediately
2. **Phase 2 (background):** Call `/api/data/live` → merge fresh data into state when it arrives

**New state fields:**
- `dataSource: "loading" | "cache" | "live"` -- tracks what the user is currently seeing
- `cachedAt: string | null` -- when the cached data was last synced

**Behavior:**
- If cache returns data → `dataSource = "cache"`, render immediately, then kick off live fetch
- If cache is empty (first-ever login) → `dataSource = "loading"`, show skeletons, fall through to live fetch only
- When live fetch completes → `dataSource = "live"`, replace state with fresh data
- Existing 15-minute refresh cycle unchanged -- continues to fetch live and sync to Supabase

**State merge strategy:** Full replacement, not merge. When live data arrives, it completely replaces cached data. This is simplest and avoids stale items lingering.

### 2c. Sync routes keep Supabase warm

No changes needed to existing sync routes. They already write to Supabase after each live fetch. The 15-minute refresh cycle in LiveDataProvider means Supabase stays warm while a tab is open. Overnight staleness is acceptable -- users see 12-hour-old data instantly, then fresh data replaces it within 1-2 seconds.

## Part 3: UI Indicators

**File:** `src/components/layout/Header.tsx`

### Cache staleness indicator

- `dataSource === "loading"`: no indicator (skeletons are visible)
- `dataSource === "cache"`: muted text "Cached · Xm ago" with a small spinning refresh icon (live fetch in progress)
- `dataSource === "live"`: briefly shows "Updated just now" then fades out after 3 seconds
- `connectionError === true`: amber text "Some services may be stale" -- dismissible

### No other UI changes

- No per-section staleness badges
- No skeleton changes (skeletons only appear on first-ever login with empty cache)
- No changes to individual view components -- they read from LiveDataContext transparently

## Files Modified

| File | Change |
|---|---|
| `src/lib/cortex/connections.ts` | Add retry logic, error logging, Supabase cache read/write for connection status |
| `src/app/api/data/cached/route.ts` | **New** -- Supabase-first read endpoint |
| `src/app/api/data/live/route.ts` | Upsert connection status after check, return `connectionError` flag |
| `src/lib/live-data-context.tsx` | Two-phase fetch (cached → live), new `dataSource` and `cachedAt` state |
| `src/components/layout/Header.tsx` | Cache staleness indicator with refresh animation |
| `supabase/migrations/YYYYMMDD_connection_status.sql` | **New** -- `connection_status` table with RLS + indexes |

**Not modified:**
- Auth/middleware/cookies (token refresh already works correctly)
- Existing sync routes (already write to Supabase)
- Individual view components (read from LiveDataContext transparently)

## Verification

1. **Connection resilience:** Disconnect from network briefly, reload app → should show last-known connection status from Supabase instead of "Connect M365" button
2. **Instant load:** Open app in new tab → data should render immediately from Supabase cache (no skeletons), header shows "Cached · Xm ago"
3. **Background refresh:** After cached data renders, wait 1-2 seconds → header should transition to "Updated just now", data may update with fresh values
4. **First-ever login:** Clear Supabase data for user → app should fall through to live fetch with skeletons (same as today)
5. **Overnight staleness:** Open app after 12+ hours away → cached data shows immediately with "Cached · 12h ago", live refresh replaces within seconds
6. **Connection error indicator:** If Cortex connections API fails → amber "Some services may be stale" message in header, data still loads from cache
