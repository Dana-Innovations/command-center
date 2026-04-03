# Delta Feed — "What Changed" Notification Panel

## Context

Command Center refreshes data every 15 minutes via LiveDataProvider, but never tells the user what changed between visits. The page feels static — you come back and have to re-scan everything to figure out what's new. The Delta Feed adds a lightweight notification layer: a toast on return ("12 things changed while you were away") and a slide-in panel with grouped, item-level detail.

## Design Summary

- **Toast on return:** When the user returns to the tab after 1+ minutes away, a clickable toast appears at bottom-right showing the total change count. Auto-dismisses after 6 seconds.
- **Bell icon in Header:** Always visible from any tab. Badge shows unacknowledged change count. Clicking opens the Delta Feed panel.
- **Slide-in panel:** Right-side drawer (same pattern as PersonDetailPanel). Groups changes by service with item-level detail. "Mark all as seen" button at bottom.
- **Hybrid data source:** sync_log for aggregate counts (toast/badge), client-side snapshot diffing for item-level detail (panel content, computed lazily on open).

## Architecture

### Approach: Hybrid — sync_log Aggregates + Client-Side Enrichment

**Why this approach:**
- The main `/api/data/live` endpoint fetches directly from Cortex (not Supabase), so querying Supabase tables for deltas would show data out of sync with what the user sees.
- The `sync_log` table already tracks every sync event with `data_type`, `items_synced`, `status`, and has Supabase realtime enabled.
- Client-side diffing against LiveDataProvider state gives accurate item-level detail matching what the user actually sees.
- No new API routes or migrations needed.

### Data Flow

```
Tab resume (after 1+ min hidden)
  |
  v
useDeltaFeed hook
  |-- Query sync_log: SELECT data_type, SUM(items_synced) FROM sync_log
  |   WHERE user_id = :uid AND completed_at > :last_seen_at AND status = 'completed'
  |   GROUP BY data_type
  |
  v
totalChanges > 0 ?
  |-- Yes --> Show DeltaToast ("12 things changed while you were away")
  |           Show badge count on bell icon in Header
  |-- No  --> Do nothing

User clicks toast or bell icon
  |
  v
DeltaFeedPanel opens
  |-- enrichGroups() called (lazy)
  |   Diff current LiveDataProvider state against localStorage snapshot
  |   Produce item-level detail per service group
  |
  v
Panel renders grouped changes with item detail

User clicks "Mark all as seen" or closes panel
  |
  v
acknowledge()
  |-- Update localStorage watermark to now
  |-- Fire-and-forget write to user_settings.dashboard.delta_last_seen_at
  |-- Save new snapshot to localStorage
  |-- Clear badge count
```

### Watermark Strategy

- **Primary:** `localStorage['command-center:delta-last-seen']` (ISO timestamp) — fast, no network.
- **Fallback:** `user_settings.dashboard.delta_last_seen_at` in Supabase — cross-device persistence.
- **On mount:** Read localStorage first. Async-check Supabase for a more recent watermark from another device; use whichever is newer.
- **On acknowledge:** Write both simultaneously (localStorage sync, Supabase fire-and-forget).

### Snapshot Strategy

- Stored in `localStorage['command-center:delta-snapshot']`.
- Written after each successful LiveDataProvider fetch.
- Lightweight fingerprint maps per data type:
  - `emails`: `{ [message_id]: { is_read, needs_reply, from_email } }`
  - `tasks`: `{ [task_gid]: { completed, name } }`
  - `calendar`: `{ [event_id]: { subject, start_time } }`
  - `slack`: `{ [key]: { channel_name, posted_by } }`
  - `chats`: `{ [chat_id]: { last_activity } }`
  - `opportunities`: `{ [opp_id]: { stage, amount } }`
- Pruned to most recent 200 items per type to stay under ~100KB.

## Components

### DeltaToast (`src/components/ui/DeltaToast.tsx`)

- Renders at bottom-right, same z-index as existing toasts.
- Shows: bell icon + "12 things changed while you were away"
- Clickable — onClick opens the Delta Feed panel.
- Auto-dismisses after 6 seconds.
- Only fires once per "return" (not on every 15-min refresh). Tracks `hasShownToast` in hook state; resets when user leaves tab again.

### DeltaFeedPanel (`src/components/command-center/DeltaFeedPanel.tsx`)

- Fixed right drawer with backdrop overlay, `animate-in slide-in-from-right` (matches PersonDetailPanel pattern).
- Header: "What Changed" + relative time range ("since 2 hours ago").
- Summary bar: total count + per-service breakdown.
- Service groups, each with:
  - Service icon + label + count badge
  - Top 5 items with human-readable descriptions
  - "+N more" overflow indicator
- Footer: "Mark all as seen" button.
- Close via X button, backdrop click, or Escape key.

### Bell Icon in Header (`src/components/layout/Header.tsx`)

- Bell SVG icon added next to existing search/refresh controls.
- Badge: small dot with count when `totalChanges > 0`.
- Click handler opens DeltaFeedPanel.
- Visible from all tabs.

### useDeltaFeed Hook (`src/hooks/useDeltaFeed.ts`)

```typescript
interface DeltaGroup {
  service: 'emails' | 'calendar' | 'tasks' | 'chats' | 'slack' | 'salesforce';
  label: string;
  count: number;
  items: DeltaItem[];  // Populated lazily on panel open
}

interface DeltaItem {
  id: string;
  title: string;
  changeType: 'new' | 'updated' | 'completed' | 'stage_change';
  detail?: string;
  timestamp?: string;
}

interface DeltaFeedState {
  totalChanges: number;
  groups: DeltaGroup[];
  lastSeenAt: Date | null;
  loading: boolean;
  acknowledge: () => void;
  enrichGroups: () => void;
}
```

- On mount + visibilitychange (after 1+ min hidden): query sync_log, compute totalChanges.
- `enrichGroups()`: called lazily when panel opens. Runs snapshot diff against LiveDataProvider state.
- `acknowledge()`: updates watermark, saves new snapshot, clears counts.

### delta-snapshot.ts (`src/lib/delta-snapshot.ts`)

Pure utility functions:
- `createSnapshot(data: LiveData): Snapshot` — extracts lightweight fingerprint maps from live data.
- `diffSnapshot(prev: Snapshot, current: Snapshot): DeltaGroup[]` — computes per-service change lists.
- `loadSnapshot(): Snapshot | null` — reads from localStorage.
- `saveSnapshot(snapshot: Snapshot): void` — writes to localStorage with pruning.

## Files

| File | Action | Purpose |
|------|--------|---------|
| `src/hooks/useDeltaFeed.ts` | Create | Core hook: sync_log query, toast trigger, lazy enrichment |
| `src/lib/delta-snapshot.ts` | Create | Pure functions: snapshot create/diff/load/save |
| `src/components/command-center/DeltaFeedPanel.tsx` | Create | Slide-in drawer with grouped changes |
| `src/components/ui/DeltaToast.tsx` | Create | Clickable toast with change count |
| `src/components/layout/Header.tsx` | Modify | Add bell icon with badge count |
| `src/app/page.tsx` | Modify | Add deltaOpen state, wire toast trigger + panel |

## Verification

1. **Toast fires on return:** Open Command Center, switch to another tab, wait 1+ min, switch back. Toast should appear with a change count.
2. **Toast is clickable:** Clicking the toast opens the Delta Feed panel.
3. **Bell icon shows badge:** After returning with changes, the Header bell icon shows a count badge.
4. **Panel shows grouped changes:** Panel lists changes grouped by service with item-level detail.
5. **Mark all as seen:** Clicking the button clears the badge, closes the panel, updates the watermark.
6. **No re-fire on refresh:** The toast does not re-appear on the regular 15-min refresh cycle, only on tab-resume after absence.
7. **Multi-tab:** Only the leader tab triggers the toast; other tabs read shared state without duplicating notifications.
8. **Cross-device watermark:** Acknowledge on one device, open on another — the second device should not show stale changes.

## Out of Scope

- Acting on items from the panel (reply, complete, etc.) — potential future enhancement.
- Real-time push notifications (WebSocket) — the current poll-based model is sufficient.
- Filtering or searching within the panel.
