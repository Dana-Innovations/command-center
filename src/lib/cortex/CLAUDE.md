# Cortex MCP

## Protected Files (DO NOT MODIFY)
- `auth.ts` — OAuth2 token exchange
- `pkce.ts` — PKCE challenge/verifier generation

## Services

| Service | MCP Name | Used For | Notes |
|---------|----------|----------|-------|
| Microsoft 365 | `m365` | Email, calendar, Teams chat | Core — most users have this |
| Asana | `asana` | Tasks, projects, comments | "Ari's Plan" board is key |
| Slack | `slack` | Channel messages, DMs | |
| Power BI | `powerbi` | Reports, KPIs (DAX queries) | Not all users connected |
| Salesforce | `salesforce` | Opportunities, pipeline, reports | Not all users connected |
| Monday.com | `monday` | Manufacturing workflows | Minden facility / James brand |
| GitHub | `github` | Repos, PRs, issues | |

## Two Call Paradigms

**Stateless** (most routes): `callCortexMCP(mcpName, toolName, args, token)` — single request, no session.

**Session-based** (AI/multi-step): `cortexInit(token)` returns session ID → `cortexCall(sessionId, mcpName, toolName, args)` reuses session.

Both are in `client.ts`. Stateless is the default; only use session-based when you need multiple calls in one logical operation.

## Connection Gating

Services are per-user. Always check before fetching:
- API side: `getConnections(token)` from `connections.ts`, check `isUserConnected(connections, mcpName)`
- Component side: `useConnections()` hook → render `<ConnectPrompt>` if not connected

## Key Rules
- Date params: **YYYY-MM-DD** format (not ISO strings)
- All MCP calls require the user's `cortex_access_token` — never hardcode tokens
- Cortex URL: `process.env.NEXT_PUBLIC_CORTEX_URL`

## Adding a New Service Integration
1. Add sync route: `src/app/api/sync/<service>/route.ts` using `callCortexMCP()`
2. Add transformer if needed: map Cortex response → Supabase schema in `src/lib/transformers.ts`
3. Add hook: `src/hooks/use<Service>.ts` reading from LiveDataContext
4. Add connection check in the view: gate on `connections.<service>`
5. Add Supabase table via new migration file (with RLS, indexes, updated_at trigger)
