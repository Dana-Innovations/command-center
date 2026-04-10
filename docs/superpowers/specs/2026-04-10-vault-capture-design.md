# Vault Capture — Design Spec

**Date:** 2026-04-10
**Status:** Draft
**Scope:** AI-routed capture of Command Center content into the Vault Graph

## Problem

Yesterday's work made the Vault Graph a context source for AI features (meeting prep, morning brief, draft reply). But context flows one way — out of the vault, into the app. Meanwhile, the Command Center sees hundreds of valuable signals every day (emails with key decisions, Teams threads with project updates, Slack announcements, meeting outcomes) that never make it into the knowledge graph. The vault grows stale relative to the live work happening in the app.

## Goal

Give Ari the ability to capture content from anywhere in the Command Center into the Vault Graph with one click. AI routes each capture intelligently: relationship signals append to the relevant person's page, project updates append to the relevant initiative, and standalone insights become new intelligence notes. The vault grows smarter every time the Command Center is used.

## Constraints

- **Personal vault:** Writes are gated to Ari's account only (`hasVaultAccess()` check). Other users see no capture buttons and API endpoints return 403.
- **Non-destructive:** Appends only add new sections with timestamps. No overwrites. No deletes. Original Obsidian-authored content is never modified in place — new captures always append after a `---` separator.
- **Explicit user action:** No automatic capture. Every write requires the user to click "Save to Vault" after reviewing the AI's routing plan.
- **Source segregation:** All Command Center captures get `source: 'cortex-capture'` so they're distinguishable from Obsidian-authored (`obsidian`) and existing Cortex sweep (`cortex`) content.
- **Text only:** No attachment extraction (PDFs, images, docx) in this phase.
- **Auditable:** Every write is logged to a new `vault_write_log` table.

## Architecture

Three layers:

### 1. Vault write layer (`src/lib/vault-client.ts`)

Three new exported functions added to the existing vault client:

- **`createVaultPage(page: VaultPageInsert): Promise<{ ok: true; filePath: string } | { ok: false; error: string }>`** — Inserts a new row into `vault_pages`. Computes checksum, validates required fields, returns the canonical file_path on success.
- **`appendToVaultPage(filePath: string, section: string, newWikilinks: string[]): Promise<{ ok: true } | { ok: false; error: string }>`** — Fetches the existing page, appends `\n\n---\n\n${section}` to its content, merges wikilinks as the deduplicated union of `existing.wikilinks ∪ newWikilinks`, updates checksum and `updated_at`, writes back. The `source` field is NOT modified (if original was `obsidian`, it stays `obsidian`). Returns 404-equivalent error if the page doesn't exist.
- **`checkVaultPageExists(filePath: string): Promise<boolean>`** — Lightweight existence check using `select('file_path').eq('file_path', filePath).maybeSingle()`.

All three functions short-circuit with error responses if the vault is unconfigured or the caller lacks access. Errors are logged via `console.warn`.

### 2. AI routing endpoint (`src/app/api/ai/vault-capture/route.ts`)

A read-only endpoint that generates a routing plan but does not write anything.

**Request:**
```typescript
{
  content: string;           // raw text to capture
  sourceType: "email" | "teams" | "slack" | "calendar" | "asana";
  sourceMeta: {
    from?: string;           // sender/organizer name
    subject?: string;        // email subject / event title
    timestamp: string;       // ISO date
    channel?: string;        // slack channel name
    url?: string;            // deep link back to source
  };
}
```

**Processing:**
1. Auth check: `getCortexUserFromRequest()` + `hasVaultAccess()`. Return 403 otherwise.
2. Call `searchVaultText()` with the sender name + content keywords (first 100 chars) to fetch up to 10 candidate pages.
3. Build a prompt that includes: the source content, source metadata, candidate pages (title + folder + tags), and the vault folder taxonomy.
4. Call Claude Sonnet (`claude-sonnet-4-20250514`) with the prompt and routing rules.
5. Parse and return the structured routing plan.

**Routing rules in the prompt:**
- Relationship signals (sentiment, personal updates, direct statements from a known person) → `action: "append"` to that person's page at `company/people/<slug>.md`
- Project/initiative updates → `action: "append"` to the relevant initiative or project page
- Meeting notes, multi-person content, or standalone insights → `action: "create"` as new intelligence note at `company/intelligence/captures/YYYY-MM-DD-<slug>.md`
- People mentioned in content → extract as `detectedPeople` for wikilinks
- Topics/initiatives mentioned → extract as `detectedTopics` for tags

**Response:**
```typescript
{
  action: "create" | "append";
  targetPath: string;
  targetTitle: string;
  formattedContent: string;     // the markdown section to create or append
  detectedPeople: string[];     // person names for wikilinks
  detectedTopics: string[];     // topic/initiative names for tags
  reasoning: string;            // 1-2 sentence explanation of routing
  confidence: "high" | "medium" | "low";
}
```

**formattedContent format:**
```markdown
## Captured 2026-04-10 from email

**Source:** "Q2 Marketing Plans" — Debbie Michelle
**Link:** <sourceUrl if present>

<AI-summarized or verbatim content>
```

### 3. Mutation endpoint (`src/app/api/vault/write/route.ts`)

The only endpoint that writes to the vault. Separated from the AI route so that writes only happen on explicit user action.

**Request:**
```typescript
{
  action: "create" | "append";
  targetPath: string;
  targetTitle: string;
  formattedContent: string;
  detectedPeople: string[];
  detectedTopics: string[];
  sourceUrl?: string;
}
```

**Auth:** `getCortexUserFromRequest()` + `hasVaultAccess()`. 403 for non-Ari.

**Logic for `action: "create"`:**
1. Validate `targetPath` starts with `company/intelligence/captures/` — reject other paths for safety.
2. Build frontmatter: `{ date: ISO, type: 'capture', title: targetTitle, source: 'cortex-capture', sourceUrl, detectedPeople, detectedTopics }`
3. Build `wikilinks` from `detectedPeople.map(toKebabSlug)`.
4. Build `tags: ['capture', ...detectedTopics.map(toKebabSlug)]`
5. Call `createVaultPage()`.
6. Insert audit log row.
7. Return `{ ok: true, filePath }`.

**Logic for `action: "append"`:**
1. Call `checkVaultPageExists(targetPath)`. If false, return 404 with a suggestion to use `action: "create"` instead.
2. Call `appendToVaultPage(targetPath, formattedContent, detectedPeople.map(toKebabSlug))`.
3. Insert audit log row.
4. Return `{ ok: true, filePath: targetPath }`.

**Audit log table (`vault_write_log`):**
```sql
create table public.vault_write_log (
  id uuid primary key default gen_random_uuid(),
  cortex_user_id text not null,
  action text not null check (action in ('create', 'append')),
  target_path text not null,
  content_hash text not null,
  source_type text,
  source_url text,
  created_at timestamptz not null default now()
);
create index idx_vault_write_log_user on vault_write_log(cortex_user_id, created_at desc);
```

RLS: enabled. Policy: only the `cortex_user_id` matching the authenticated user can read their own log rows.

### 4. Capture drawer UI

**Components to create:**

- **`src/components/modals/CaptureDrawer.tsx`** — Right-side slide-out drawer following the `ReplyDrawer` pattern. Three states: `analyzing`, `preview`, `saving`. Contains the preview form with editable content textarea and a "Change target" dropdown.
- **`src/hooks/useVaultCapture.ts`** — Central hook that manages drawer open/close state, calls `/api/ai/vault-capture` on open, calls `/api/vault/write` on save, emits toast on success/error. Exposes `{ isOpen, open(source, meta), close, plan, save, saving, error }`.
- **`src/components/ui/CaptureButton.tsx`** — Small reusable button that takes a capture source + metadata, calls `useVaultCapture().open()` on click. Returns `null` if `!isAri`. Icon + label: "⤴ Vault".
- **`src/lib/capture-routing.ts`** — Shared prompt builder + TypeScript types for `CaptureSource`, `RoutingPlan`, `CaptureRequest`. Exports `buildCapturePrompt(request, candidates)`.

**Drawer states:**
- **Analyzing:** Spinner + "Analyzing content..." — `/api/ai/vault-capture` is in flight.
- **Preview:** Shows routing, reasoning, detected people/topics, editable content preview, and action buttons. User can edit the markdown, change the target via dropdown, or click Save.
- **Saving:** Save button shows spinner while `/api/vault/write` is in flight.
- **Success:** Drawer closes, toast appears: *"Saved to [target title]"*.
- **Error:** Inline error message with "Try again" button. Drawer stays open, content preserved.

**Integration points (where `<CaptureButton>` gets mounted):**
- `src/components/command-center/ReplyCenter.tsx` — per-email button
- `src/components/command-center/EmailHygiene.tsx` — per-email button
- `src/components/home/HomeCommunications.tsx` — per-item button (email/teams/slack/asana rows)
- `src/components/command-center/CalendarTimeline.tsx` — per-event button
- `src/components/home/HomeCalendar.tsx` — per-event button
- `src/components/command-center/SlackCard.tsx` — per-message button
- `src/components/home/HomeTasks.tsx` — per-asana-comment button

## Data Safety Guarantees

1. **Append-only for existing pages** — never overwrite prior content, always add new sections separated by `---`
2. **No deletes** — the write endpoint has no delete capability
3. **Path validation** — `action: "create"` rejects any path outside `company/intelligence/captures/`
4. **Source segregation** — captures use `source: 'cortex-capture'`, distinguishable from Obsidian-authored content
5. **Checksum tracking** — every write computes a new SHA-256 checksum
6. **Audit log** — every write inserts a row into `vault_write_log` with user, action, path, hash, and timestamp
7. **Explicit user action** — no automatic capture; every write requires a click on "Save to Vault"
8. **Three-layer gating** — UI hides button, API returns 403, library functions short-circuit

## Key Files

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/vault-client.ts` | Modify | Add `createVaultPage`, `appendToVaultPage`, `checkVaultPageExists` |
| `src/lib/capture-routing.ts` | Create | Prompt builder, routing types |
| `src/app/api/ai/vault-capture/route.ts` | Create | AI routing endpoint (read-only) |
| `src/app/api/vault/write/route.ts` | Create | Write endpoint with audit logging |
| `supabase/migrations/20260410_vault_write_log.sql` | Create | Audit table + RLS policy |
| `src/components/modals/CaptureDrawer.tsx` | Create | Drawer UI component |
| `src/hooks/useVaultCapture.ts` | Create | Drawer state + API orchestration |
| `src/components/ui/CaptureButton.tsx` | Create | Reusable capture trigger button |
| `src/components/command-center/ReplyCenter.tsx` | Modify | Mount CaptureButton per email |
| `src/components/command-center/EmailHygiene.tsx` | Modify | Mount CaptureButton per email |
| `src/components/home/HomeCommunications.tsx` | Modify | Mount CaptureButton per row |
| `src/components/command-center/CalendarTimeline.tsx` | Modify | Mount CaptureButton per event |
| `src/components/home/HomeCalendar.tsx` | Modify | Mount CaptureButton per event |
| `src/components/command-center/SlackCard.tsx` | Modify | Mount CaptureButton per message |
| `src/components/home/HomeTasks.tsx` | Modify | Mount CaptureButton per Asana comment |

## Not In Scope (future phases)

- Attachment text extraction (PDF, docx, images)
- Bulk capture (select multiple items at once)
- Capture history view showing everything you've saved
- Editing captured pages from within the Command Center
- Delete/undo (intentionally excluded for data safety)
- Multi-user support (other users having their own vaults)
- Real-time sync back to Obsidian filesystem (relies on Obsidian's existing Supabase sync)

## Verification

1. **Unit tests for vault-client writes** — mock Supabase, verify `createVaultPage` inserts with correct frontmatter/checksum, `appendToVaultPage` preserves original content and adds section, `checkVaultPageExists` returns correct boolean
2. **Unit tests for capture-routing** — verify prompt includes candidates, source metadata, and correct routing rules
3. **AI routing integration test** — call `/api/ai/vault-capture` with a sample email mentioning Debbie Michelle, verify response has `action: "append"` and `targetPath: "company/people/debbie-michelle.md"`
4. **Write endpoint test** — call `/api/vault/write` with action "create", verify new row in `vault_pages` and audit log entry in `vault_write_log`
5. **Append safety test** — call append on an existing obsidian-sourced page, verify original content is preserved and new section added with `---` separator, and `source` field remains `obsidian`
6. **Path validation test** — attempt `action: "create"` with `targetPath: "company/people/..."`, verify 400 rejection
7. **Non-Ari test** — log in as another user, verify capture buttons don't render and API endpoints return 403
8. **End-to-end test** — click capture button on an email in the dev environment, verify drawer opens, routing plan generates, edit content, click Save, verify page appears in vault-graph Supabase
