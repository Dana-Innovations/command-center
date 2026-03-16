# Attention / Priority System

Smart priority ranking that learns from user feedback.

## How It Works

1. **Importance tiers** — explicit rules per folder/channel: Critical > High > Normal > Low
2. **Bias scores** — learned from user feedback (raise/lower/right) by dimension (resource, actor, topic, provider)
3. **Final score** = base score + importance tier bonus + learned bias + energy bonus

## Supabase Tables

- `user_settings` — attention preferences, dashboard config (JSON)
- `focus_preferences` — explicit folder/channel importance rules (provider, entity_type, entity_id, importance)
- `item_feedback` — per-item user feedback (item_type, item_id, feedback: raise/lower/right)
- `priority_bias` — learned bias scores by dimension

## Key Files

- `client.tsx` — React context + `applyAttentionProfile()` scoring logic
- `server.ts` — server-side priority calculations
- `targets.ts` — target generation for focus tree
- `types.ts` — ImportanceTier, FocusNode, AttentionItem, FocusPreference interfaces
- `utils.ts` — scoring helpers

## UI Components

- `src/components/command-center/PriorityEngine.tsx` — priority scoring widget
- `src/components/ui/AttentionFeedbackControl.tsx` — upvote/downvote per item
- `src/app/api/attention/feedback/route.ts` — feedback persistence endpoint
- `src/app/api/focus/map/route.ts` — focus tree generation
