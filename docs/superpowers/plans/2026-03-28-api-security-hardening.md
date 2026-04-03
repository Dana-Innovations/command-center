# API Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close three security gaps: cron auth failing open, sync routes trusting client-supplied user_id, and Power BI embed token accepting unscoped IDs.

**Architecture:** Add `getCortexUserFromRequest()` auth gate to all sync routes (7 routes), replace client-supplied `user_id` with `user.sub` from the auth context. Harden cron secret check to fail closed. Power BI embed-token is already scoped by the user's Cortex token (Cortex MCP enforces ACLs), so no code change needed -- just document.

**Tech Stack:** Next.js API routes, `getCortexUserFromRequest` from `src/lib/cortex/user.ts`, existing Supabase service client pattern.

**Key finding:** The sync routes (`/api/sync/*`) are NOT called anywhere in the codebase -- the `/api/data/live` mega-route handles all Cortex fetching and Supabase writes directly. These sync routes are exposed HTTP endpoints with no callers, making them dead code _and_ an attack surface. The safest fix is to add auth to them (in case they're used in the future) rather than delete them (they may be needed for future architectural refactoring).

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/app/api/cron/sync-powerbi/route.ts` | Modify | Fail closed when CRON_SECRET missing |
| `src/app/api/sync/emails/route.ts` | Modify | Add auth, derive user_id from token |
| `src/app/api/sync/calendar/route.ts` | Modify | Add auth, derive user_id from token |
| `src/app/api/sync/tasks/route.ts` | Modify | Add auth, derive user_id from token |
| `src/app/api/sync/chats/route.ts` | Modify | Add auth, derive user_id from token |
| `src/app/api/sync/teams/route.ts` | Modify | Add auth, derive user_id from token |
| `src/app/api/sync/salesforce/route.ts` | Modify | Add auth, derive user_id from token |
| `src/app/api/sync/actions/route.ts` | Modify | Add auth, derive user_id from token |
| `src/app/api/sync/slack-feed/route.ts` | Modify | Add auth (no user_id -- global data, but still needs auth gate) |

---

### Task 1: Harden Cron Secret to Fail Closed

**Files:**
- Modify: `src/app/api/cron/sync-powerbi/route.ts:9-13`

- [ ] **Step 1: Read the current file**

Verify line 11: `if (cronSecret && authHeader !== ...)` -- this skips auth when env var is unset.

- [ ] **Step 2: Fix the auth check to fail closed**

Replace lines 9-13 with:

```typescript
const cronSecret = process.env.CRON_SECRET;

if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

Key change: `cronSecret &&` becomes `!cronSecret ||` -- now rejects if secret is missing OR doesn't match.

- [ ] **Step 3: Verify build passes**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/sync-powerbi/route.ts
git commit -m "fix: cron auth fails closed when CRON_SECRET is not set"
```

---

### Task 2: Add Auth to Sync Email Route (template for all sync routes)

**Files:**
- Modify: `src/app/api/sync/emails/route.ts:1-10`

- [ ] **Step 1: Read the current file**

Note line 6: `const { emails, user_id } = await request.json()` -- user_id from client body.

- [ ] **Step 2: Add auth import and gate**

Replace the file contents with:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCortexUserFromRequest } from '@/lib/cortex/user';

export async function POST(request: NextRequest) {
  const user = await getCortexUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { emails } = await request.json();

    if (!emails || !Array.isArray(emails)) {
      return NextResponse.json({ error: 'Invalid payload: emails array required' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const now = new Date().toISOString();

    const rows = emails.map((email: Record<string, unknown>) => ({
      ...email,
      user_id: user.sub,
      synced_at: now,
    }));

    const { data, error } = await supabase
      .from('emails')
      .upsert(rows, { onConflict: 'user_id,message_id' })
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabase.from('sync_log').insert({
      data_type: 'emails',
      items_synced: data.length,
      status: 'completed',
      user_id: user.sub,
      started_at: now,
      completed_at: new Date().toISOString(),
    });

    return NextResponse.json({ synced: data.length, timestamp: now });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

Changes:
1. Added `getCortexUserFromRequest` import
2. Auth check at top -- returns 401 if not authenticated
3. Removed `user_id` from destructured body
4. All uses of `user_id` now use `user.sub` from auth context

- [ ] **Step 3: Verify lint passes**

Run: `npx eslint src/app/api/sync/emails/route.ts`
Expected: No errors or warnings.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/sync/emails/route.ts
git commit -m "fix: sync/emails authenticates user instead of trusting client-supplied user_id"
```

---

### Task 3: Add Auth to Remaining Sync Routes (calendar, tasks, chats, teams, salesforce)

Apply the same pattern from Task 2 to each route. The only differences are the table name, data field name, and upsert conflict key.

**Files:**
- Modify: `src/app/api/sync/calendar/route.ts`
- Modify: `src/app/api/sync/tasks/route.ts`
- Modify: `src/app/api/sync/chats/route.ts`
- Modify: `src/app/api/sync/teams/route.ts`
- Modify: `src/app/api/sync/salesforce/route.ts`

For each file, the pattern is identical:

- [ ] **Step 1: Add auth to calendar sync**

In `src/app/api/sync/calendar/route.ts`:
1. Add import: `import { getCortexUserFromRequest } from '@/lib/cortex/user';`
2. Add auth gate at top of POST handler (before try block):
```typescript
const user = await getCortexUserFromRequest(request);
if (!user) {
  return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
}
```
3. Change destructure from `const { events, user_id } = await request.json()` to `const { events } = await request.json()`
4. Replace all `user_id` references with `user.sub`

- [ ] **Step 2: Add auth to tasks sync**

Same pattern in `src/app/api/sync/tasks/route.ts`. Destructure `{ tasks }` instead of `{ tasks, user_id }`.

- [ ] **Step 3: Add auth to chats sync**

Same pattern in `src/app/api/sync/chats/route.ts`. Destructure `{ chats }` instead of `{ chats, user_id }`.

- [ ] **Step 4: Add auth to teams sync**

Same pattern in `src/app/api/sync/teams/route.ts`. Destructure `{ channels }` instead of `{ channels, user_id }`.

- [ ] **Step 5: Add auth to salesforce sync**

Same pattern in `src/app/api/sync/salesforce/route.ts`. Destructure `{ opportunities, reports }` instead of `{ opportunities, reports, user_id }`.

- [ ] **Step 6: Verify all lint passes**

Run: `npx eslint src/app/api/sync/`
Expected: No errors or warnings.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/sync/calendar/route.ts src/app/api/sync/tasks/route.ts src/app/api/sync/chats/route.ts src/app/api/sync/teams/route.ts src/app/api/sync/salesforce/route.ts
git commit -m "fix: all sync routes authenticate user instead of trusting client-supplied user_id"
```

---

### Task 4: Add Auth to Sync Actions Route

**Files:**
- Modify: `src/app/api/sync/actions/route.ts`

This route is slightly different -- it reads/updates an `action_queue` record by `action_id`. Still needs auth to prevent unauthorized action processing.

- [ ] **Step 1: Add auth gate**

1. Add import: `import { getCortexUserFromRequest } from '@/lib/cortex/user';`
2. Add auth check before try block:
```typescript
const user = await getCortexUserFromRequest(request);
if (!user) {
  return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
}
```
3. Change destructure from `const { action_id, user_id }` to `const { action_id }`
4. Remove the `user_id` required check (lines 8-10) -- auth gate covers this

- [ ] **Step 2: Verify lint passes**

Run: `npx eslint src/app/api/sync/actions/route.ts`
Expected: No errors or warnings.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/sync/actions/route.ts
git commit -m "fix: sync/actions authenticates user via Cortex token"
```

---

### Task 5: Add Auth to Slack Feed Sync Route

**Files:**
- Modify: `src/app/api/sync/slack-feed/route.ts`

This route doesn't use `user_id` at all (Slack messages are global), but it still needs an auth gate to prevent unauthenticated writes.

- [ ] **Step 1: Add auth gate**

1. Add import: `import { getCortexUserFromRequest } from '@/lib/cortex/user';`
2. Add auth check before try block:
```typescript
const user = await getCortexUserFromRequest(request);
if (!user) {
  return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
}
```

No other changes needed -- this route doesn't reference `user_id`.

- [ ] **Step 2: Verify lint passes**

Run: `npx eslint src/app/api/sync/slack-feed/route.ts`
Expected: No errors or warnings.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/sync/slack-feed/route.ts
git commit -m "fix: sync/slack-feed requires authentication"
```

---

### Task 6: Document Power BI Embed Token Security Model

**Files:**
- No code changes needed

The Power BI embed token route (`src/app/api/powerbi/embed-token/route.ts`) already:
1. Checks `cortexToken` and returns 401 if missing
2. Passes the user's token to `cortexCall()` which delegates to Cortex MCP
3. Cortex MCP enforces ACLs -- the user's token can only access reports/workspaces they have permissions for

No additional server-side ACL check is needed because Cortex is the authorization layer. The user can only generate embed tokens for resources their Okta identity has access to.

- [ ] **Step 1: Add inline comment documenting the security model**

In `src/app/api/powerbi/embed-token/route.ts`, after the auth check (line 8), add:

```typescript
  // Security: reportId/workspaceId are scoped by the user's cortexToken.
  // Cortex MCP enforces Okta AD permissions -- users can only embed reports they own.
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/powerbi/embed-token/route.ts
git commit -m "docs: document Power BI embed token security model"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Run full lint**

Run: `npx eslint src/`
Expected: 0 errors, 0 warnings.

- [ ] **Step 2: Run tests**

Run: `npx vitest run`
Expected: 14/14 passing.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Verify auth patterns are consistent**

Grep to confirm every sync route now imports auth:
```bash
grep -l "getCortexUserFromRequest" src/app/api/sync/*/route.ts
```
Expected: All 8 sync route files listed.
