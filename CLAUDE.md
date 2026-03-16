# Command Center

Next.js 16 executive dashboard for Sonance. Aggregates email, calendar, tasks, chats, Slack, Salesforce, Power BI, and Monday.com via Cortex MCP. Multi-tenant — any Sonance employee signs in via Okta AD; services are per-user.

**Repo:** `Dana-Innovations/command-center-cortex`  **Production:** `command-center-sonance.vercel.app`

## Commands

```bash
npm install                    # install dependencies
vercel env pull .env.local     # pull env vars (REQUIRED before first run)
npm run dev                    # start dev server on :3000
npm run build                  # production build
npm run lint                   # run linter
```

## DO NOT TOUCH — Protected Files

These files implement Cortex OAuth (PKCE) and MUST NOT be modified unless explicitly asked:

- `src/middleware.ts`
- `src/lib/cortex/auth.ts`
- `src/app/auth/cortex/callback/route.ts`
- `src/lib/cortex/pkce.ts`

## MUST Rules

- All user-specific content MUST come from the authenticated Cortex user. NEVER hardcode names, emails, user IDs, or demo data.
- All external data MUST flow through `callCortexMCP()` or `cortexCall()` in `src/lib/cortex/client.ts` using the user's token. MUST NOT add direct API keys or bypass Cortex.
- User-specific features (e.g. Jeana, CEO tone) MUST be gated behind `isAri` or a similar authenticated user check. MUST NOT make them globally visible.
- Supabase schema changes MUST use a new migration file in `supabase/migrations/`. MUST NOT modify existing migration files.
- All new Supabase tables MUST have RLS enabled, `updated_at` triggers, and indexes — follow `supabase/migrations/20260305_setup_schema.sql`.

## Workspace Map

| Working on... | Read this context | Key files to know |
|---------------|-------------------|-------------------|
| API routes (`src/app/api/`) | `src/app/api/CLAUDE.md` | `cortex/client.ts`, `transformers.ts` |
| Cortex MCP integration | `src/lib/cortex/CLAUDE.md` | `client.ts`, `connections.ts` |
| Supabase / database | `src/lib/supabase/CLAUDE.md` | `server.ts`, `client.ts`, `supabase/migrations/` |
| Components / views / hooks | `src/components/CLAUDE.md` | `page.tsx`, `tab-config.ts`, `live-data-context.tsx` |
| Priority / attention system | `src/lib/attention/CLAUDE.md` | `client.tsx`, `server.ts`, `types.ts` |

## Architecture (brief)

- **Auth:** Cortex OAuth2 PKCE → httpOnly cookies → middleware auto-refreshes → `x-cortex-token` header to API routes
- **Data:** Cortex MCP → `/api/sync/*` → Supabase (service-role writes, RLS reads) → LiveDataProvider → hooks → components
- **Routing:** Single-page, tab-based via URL search params (`?tab=&sub=`). No file-based routes beyond `/` and `/login`.

## Deployment

- **Push to `main`** → Vercel auto-deploys. That's it.
- **NEVER** run `vercel --prod`, `vercel deploy`, or any Vercel CLI deploy command — deploys to wrong account.
- **NEVER** run `vercel env add` — manage env vars through the Vercel dashboard or `vercel env pull` only.

## Common Mistakes

- Adding direct service API keys — everything goes through Cortex (exception: `ANTHROPIC_API_KEY` server-side for AI features)
- Hardcoding user data instead of using authenticated Cortex user
- Modifying auth cookies or middleware token logic
- Creating Supabase tables via dashboard instead of migration files
- Fetching from a Cortex service without checking `connections.<service>` first
- Adding file-based routes under `src/app/` — navigation is tab-based via search params
- Using `createServiceClient()` outside sync routes — reads must use `createAuthClient()` for RLS
