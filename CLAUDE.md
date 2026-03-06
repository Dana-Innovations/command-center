# Command Center

Next.js app — executive dashboard that aggregates email, calendar, tasks, chats, Slack, Salesforce, and Power BI via Cortex MCP.

## Critical Rules

- **DO NOT modify authentication.** Cortex OAuth (PKCE flow) is fully implemented in `src/middleware.ts`, `src/lib/cortex/auth.ts`, and `src/app/auth/cortex/callback/route.ts`. Do not touch these files unless explicitly asked.
- **No hardcoded user data.** All user-specific content must come from the authenticated Cortex user. Never hardcode names, emails, or demo data.
- **All external data flows through Cortex MCP.** Use `callCortexMCP()` or `cortexCall()` from `src/lib/cortex/client.ts` with the user's token. Do not add direct API keys or bypass Cortex.
- **Ari-specific features must be gated.** Features like Jeana and CEO tone are behind an `isAri` check. Follow this pattern for any user-specific features.

## Architecture

- **Auth:** Cortex OAuth2 PKCE → cookies (`cortex_access_token`, `cortex_user`) → middleware validates & forwards token
- **Data:** Sync routes (`src/app/api/sync/*`) call Cortex MCP → upsert to Supabase
- **Supabase:** User profiles + 11 data tables. Schema in `supabase/migrations/`. New changes require new migration files — do not modify existing ones.
- **Types:** All table interfaces in `src/lib/types.ts`

## Setup

```bash
npm install
vercel env pull .env.local
npm run dev
```

## Supabase Tables

`user_profiles`, `emails`, `calendar_events`, `tasks`, `chats`, `teams_channels`, `slack_feed`, `salesforce_opportunities`, `salesforce_reports`, `sync_log`, `action_queue`, `audit_log`

All tables have RLS enabled, `updated_at` triggers, and proper indexes following Cortex patterns.
