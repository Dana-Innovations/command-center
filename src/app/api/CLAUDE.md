# API Routes

## Conventions

Every API route must:
1. Extract token: `const token = request.headers.get('x-cortex-token')`
2. Early-return `401` if no token, `400` if missing required params
3. Return JSON with `{ data, error }` structure
4. Use `createServiceClient()` for writes (sync), `createAuthClient()` for reads

## Route Types

### Sync Routes (`/api/sync/*`)
Pattern: receive data from frontend → upsert to Supabase → log to `sync_log`.
```
callCortexMCP(mcpName, toolName, args, token)
  → transform response via src/lib/transformers.ts
  → supabase.from(table).upsert(rows, { onConflict: 'user_id,<entity_id>' })
  → supabase.from('sync_log').insert({ data_type, items_synced, status, user_id })
```
Existing: emails, calendar, tasks, chats, teams, slack-feed, salesforce, powerbi, actions

### Data Routes (`/api/data/*`)
Pattern: fetch from Cortex or Supabase → return JSON to frontend.
- `/api/data/live` — main aggregate endpoint (emails, calendar, tasks, etc.)
- `/api/data/email-detail` — full email body by message ID
- `/api/data/person-detail` — individual person data
- `/api/data/hygiene-emails` — non-urgent/bulk emails
- `/api/data/monday` — Monday.com board data

### Action Routes (`/api/actions/*`)
Pattern: POST with action params → call Cortex MCP to execute → return `{ ok, method? }`.
Existing: send-reply, block-sender, report-phishing, unsubscribe-email, send-clip

### AI Routes (`/api/ai/*`)
Pattern: Vercel AI SDK + `@ai-sdk/anthropic` → streaming text response.
- `/api/ai/draft-reply` — drafts email reply using Claude Sonnet (checks `isAri` for writing style)
- `/api/ai/meeting-prep` — generates meeting prep research

## Adding a New API Route

1. Create `src/app/api/<category>/<name>/route.ts`
2. Extract token from `x-cortex-token` header
3. For Cortex calls: use `callCortexMCP(mcpName, toolName, args, token)` from `src/lib/cortex/client.ts`
4. For Supabase writes: use `createServiceClient()` from `src/lib/supabase/server.ts`
5. For Supabase reads: use `createAuthClient()` (respects RLS)
6. Log sync activity to `sync_log` if it's a sync route
