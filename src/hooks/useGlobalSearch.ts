"use client";

import { useState, useEffect, useMemo, useCallback, useRef, startTransition } from "react";
import { useLiveData } from "@/lib/live-data-context";
import { usePeople, type Person } from "@/hooks/usePeople";
import type {
  Email,
  CalendarEvent,
  Task,
  SalesforceOpportunity,
} from "@/lib/types";

/* ── Result categories ── */
export type SearchCategory = "tasks" | "people" | "emails" | "meetings" | "opportunities";

export interface SearchResult {
  id: string;
  category: SearchCategory;
  title: string;
  subtitle: string;
  url?: string;
  /** tab to navigate to when selected */
  tab: string;
  raw: Task | Person | Email | CalendarEvent | SalesforceOpportunity;
}

const RECENT_KEY = "cc_recent_searches";
const MAX_RECENT = 8;

/* ── Helpers ── */
function score(haystack: string, needle: string): number {
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  if (h === n) return 3; // exact
  if (h.startsWith(n)) return 2; // prefix
  if (h.includes(n)) return 1; // contains
  return 0;
}

function bestScore(fields: (string | undefined | null)[], needle: string): number {
  let best = 0;
  for (const f of fields) {
    if (!f) continue;
    const s = score(f, needle);
    if (s > best) best = s;
    if (best === 3) return 3;
  }
  return best;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ── Hook ── */
export function useGlobalSearch() {
  const { emails, calendar, tasks, opportunities, loading: dataLoading } = useLiveData();
  const { people } = usePeople();

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Debounce 200ms
  useEffect(() => {
    timerRef.current = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(timerRef.current);
  }, [query]);

  // Recent searches (localStorage)
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_KEY);
      if (stored) startTransition(() => setRecentSearches(JSON.parse(stored)));
    } catch { /* ignore */ }
  }, []);

  const addRecent = useCallback((term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setRecentSearches((prev) => {
      const next = [trimmed, ...prev.filter((s) => s !== trimmed)].slice(0, MAX_RECENT);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const clearRecent = useCallback(() => {
    setRecentSearches([]);
    try { localStorage.removeItem(RECENT_KEY); } catch { /* ignore */ }
  }, []);

  // Search results
  const results = useMemo<SearchResult[]>(() => {
    const q = debouncedQuery.trim();
    if (!q) return [];

    const hits: (SearchResult & { _score: number })[] = [];

    // Tasks
    for (const t of tasks) {
      const s = bestScore([t.name, t.notes, t.project_name, t.assignee_name], q);
      if (s > 0) {
        hits.push({
          id: `task-${t.id}`,
          category: "tasks",
          title: t.name,
          subtitle: [t.project_name, t.due_on ? `Due ${formatDate(t.due_on)}` : null].filter(Boolean).join(" · "),
          url: t.permalink_url,
          tab: "priority",
          raw: t,
          _score: s,
        });
      }
    }

    // People
    for (const p of people) {
      const s = bestScore([p.name, p.email], q);
      if (s > 0) {
        hits.push({
          id: `person-${p.name}`,
          category: "people",
          title: p.name,
          subtitle: [p.email, `${p.touchpoints} touchpoint${p.touchpoints !== 1 ? "s" : ""}`].filter(Boolean).join(" · "),
          tab: "people",
          raw: p,
          _score: s,
        });
      }
    }

    // Emails
    for (const e of emails) {
      const s = bestScore([e.subject, e.from_name, e.from_email, e.preview], q);
      if (s > 0) {
        hits.push({
          id: `email-${e.id}`,
          category: "emails",
          title: e.subject || "(no subject)",
          subtitle: [e.from_name, formatDate(e.received_at)].filter(Boolean).join(" · "),
          url: e.outlook_url,
          tab: "priority",
          raw: e,
          _score: s,
        });
      }
    }

    // Meetings
    for (const ev of calendar) {
      const s = bestScore([ev.subject, ev.organizer, ev.location], q);
      if (s > 0) {
        hits.push({
          id: `event-${ev.id}`,
          category: "meetings",
          title: ev.subject,
          subtitle: [ev.organizer, formatDate(ev.start_time)].filter(Boolean).join(" · "),
          url: ev.outlook_url || ev.join_url,
          tab: "calendar",
          raw: ev,
          _score: s,
        });
      }
    }

    // SF Opps
    for (const o of opportunities) {
      const s = bestScore([o.name, o.account_name, o.stage, o.owner_name], q);
      if (s > 0) {
        hits.push({
          id: `opp-${o.id}`,
          category: "opportunities",
          title: o.name,
          subtitle: [o.account_name, o.stage, o.amount ? `$${(o.amount / 1000).toFixed(0)}k` : null].filter(Boolean).join(" · "),
          url: o.sf_url,
          tab: "sales",
          raw: o,
          _score: s,
        });
      }
    }

    // Sort by score desc, then alphabetical
    hits.sort((a, b) => b._score - a._score || a.title.localeCompare(b.title));

    return hits;
  }, [debouncedQuery, tasks, people, emails, calendar, opportunities]);

  // Group by category
  const grouped = useMemo(() => {
    const groups: Record<SearchCategory, SearchResult[]> = {
      tasks: [],
      people: [],
      emails: [],
      meetings: [],
      opportunities: [],
    };
    for (const r of results) {
      groups[r.category].push(r);
    }
    return groups;
  }, [results]);

  const isSearching = query !== debouncedQuery;

  return {
    query,
    setQuery,
    results,
    grouped,
    isSearching: isSearching && dataLoading,
    loading: dataLoading,
    recentSearches,
    addRecent,
    clearRecent,
  };
}
