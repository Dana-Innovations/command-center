# Components

## Tab Routing

Single-page app — all views render in `src/app/page.tsx`. Navigation is URL search params:
- `?tab=<TabId>` — home, communications, people, calendar, performance, operations
- `&sub=<SubView>` — sub-view within a tab
- `&eventId=<id>` — deep link to calendar event
- `&setupTab=<tab>` — workspace setup panel

No file-based routes. Tab types defined in `src/lib/tab-config.ts`.

## Directory Structure

- `views/` — full-page views, one per tab (HomeView, CommunicationsView, PeopleHubView, CalendarHubView, PerformanceView, OperationsView, etc.)
- `command-center/` — domain widgets (AIFeedCard, CalendarTimeline, EmailHygiene, MeetingPrep, PriorityEngine, ReplyCenter, SalesforcePipeline, SlackCard, etc.)
- `layout/` — Header, TabBar, Footer
- `modals/` — ComposeEmail, EODSummary, QuickReply
- `ui/` — base components (GlassCard, CommandBar, ConnectPrompt, badge, button, card, tabs, toast)

## Conventions

- `"use client"` directive on all interactive components
- Hooks before JSX; utility functions outside components
- Async action state machine: `idle → pending → done | error`
- API calls via plain `fetch()` — no SWR/React Query
- All data hooks in `src/hooks/` — they wrap LiveDataContext from `src/lib/live-data-context.tsx`

## Styling

- Tailwind 4 with CSS variables: `--bg-primary`, `--text-heading`, `--accent-amber`, `--glass-card`
- Forced dark mode (class="dark" on html)
- Semantic classes: `glass-card`, `anim-card`, `grain-overlay`
- Icons: Lucide React via `src/components/ui/icons.tsx`

## Live Data

`src/lib/live-data-context.tsx` — central provider with leader election:
- One browser tab claims leadership via localStorage; refreshes every 15 min
- Others read shared state; re-check on tab visibility change
- All data hooks read from this context

## Adding a New View/Tab

1. Create `src/components/views/<Name>View.tsx`
2. Add TabId to `src/lib/tab-config.ts`
3. Wire into tab switch in `src/app/page.tsx`
4. Add tab entry in `src/components/layout/TabBar.tsx`
