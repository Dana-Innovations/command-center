"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useCalendar } from "@/hooks/useCalendar";
import { useTasks } from "@/hooks/useTasks";
import { useEmails } from "@/hooks/useEmails";
import { useSalesforce } from "@/hooks/useSalesforce";
import { useMonday } from "@/hooks/useMonday";
import { useAsanaComments } from "@/hooks/useAsanaComments";
import { useLiveData } from "@/lib/live-data-context";
import { useConnections } from "@/hooks/useConnections";
import { ConnectedServicesPanel } from "@/components/ui/ConnectedServicesPanel";
import { toPacificDate } from "@/lib/calendar";
import type { Task, CalendarEvent } from "@/lib/types";

const SERVICE_LABELS: Record<string, string> = {
  m365: "Microsoft 365",
  asana: "Asana",
  slack: "Slack",
  salesforce: "Salesforce",
  powerbi: "Power BI",
  monday: "Monday.com",
};

// ─── Constants ───────────────────────────────────────────────────────────────

const STALE_DAYS = 5;
const MAX_ATTENTION_AGE_DAYS = 60; // Don't surface items older than this
const MAX_ITEMS_PER_GROUP = 8; // Cap per source group in Needs Attention
const MAX_GORILLAS_DISPLAY = 15;

const GORILLA_KEYWORDS =
  /\b(initiative|launch|program|rollout|strategy|overhaul|transformation|campaign|integration|migration|implementation|pilot)\b/i;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  return Math.floor((new Date().getTime() - new Date(dateStr).getTime()) / 86400000);
}

function isStale(modifiedAt: string | null | undefined): boolean {
  const d = daysSince(modifiedAt);
  return d !== null && d >= STALE_DAYS;
}

function isAsanaGorilla(task: Task): boolean {
  // Strong signals — any one of these alone qualifies
  if (GORILLA_KEYWORDS.test(task.name)) return true;
  if (task.project_name && GORILLA_KEYWORDS.test(task.project_name)) return true;

  // Weak signals — need at least 2 to qualify
  let signals = 0;
  if (task.num_subtasks && task.num_subtasks > 0) signals++;
  if (task.due_on) {
    const daysUntilDue = Math.ceil(
      (new Date(task.due_on).getTime() - new Date().getTime()) / 86400000
    );
    if (daysUntilDue >= 30) signals++;
  }
  const followerCount = task.follower_names?.length ?? 0;
  const collabCount = task.collaborator_names?.length ?? 0;
  if (followerCount + collabCount >= 5) return true; // Many people = gorilla
  if (followerCount + collabCount >= 3) signals++;

  return signals >= 2;
}

function relativeTime(dateStr: string | null | undefined): string {
  const d = daysSince(dateStr);
  if (d === null) return "—";
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getPSTNow(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })
  );
}

function getGreeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatPSTTime(d: Date): string {
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTimeShort(isoStr: string): string {
  const d = toPacificDate(isoStr);
  if (!d) return "";
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatRelativeDay(dateStr: string): string {
  const now = getPSTNow();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Handle both YYYY-MM-DD and ISO datetime strings
  const parts = dateStr.slice(0, 10).split("-").map(Number);
  const eventDay = new Date(parts[0], parts[1] - 1, parts[2]);
  const diffDays = Math.round(
    (eventDay.getTime() - todayStart.getTime()) / 86400000
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 7)
    return eventDay.toLocaleDateString("en-US", { weekday: "long" });
  return eventDay.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtAmount(n: number | null | undefined) {
  if (!n) return "";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

// ─── Icons ───────────────────────────────────────────────────────────────────

const SunriseIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 18a5 5 0 00-10 0" /><line x1="12" y1="2" x2="12" y2="9" /><line x1="4.22" y1="10.22" x2="5.64" y2="11.64" /><line x1="1" y1="18" x2="3" y2="18" /><line x1="21" y1="18" x2="23" y2="18" /><line x1="18.36" y1="11.64" x2="19.78" y2="10.22" /><line x1="23" y1="22" x2="1" y2="22" /><polyline points="8 6 12 2 16 6" />
  </svg>
);

const ClockIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);

const VideoIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
);

const NudgeIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" />
  </svg>
);

const ExternalIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const PrepIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
  </svg>
);

// ─── Skeleton ────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-white/5",
        className
      )}
    />
  );
}

function SectionSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

// ─── Section Empty State ─────────────────────────────────────────────────────

function SectionEmpty({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-6 text-text-muted">
      <p className="text-xs opacity-60">{message}</p>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DigestView() {
  const { user } = useAuth();
  const { events: calEvents, loading: calLoading } = useCalendar();
  const { tasks, loading: tasksLoading } = useTasks();
  const { emails, loading: emailsLoading } = useEmails();
  const { opportunities, loading: sfLoading } = useSalesforce();
  const { orders, loading: mondayLoading } = useMonday();
  const { comments: asanaComments, loading: commentsLoading } = useAsanaComments();
  const { asanaProjects, refetch } = useLiveData();
  const connections = useConnections();

  // ─── Board filter state ───────────────────────────────────────────────────
  const [showBoardSettings, setShowBoardSettings] = useState(false);
  const [selectedProjectGids, setSelectedProjectGids] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("my-monkeys:project-filter");
      return stored ? (JSON.parse(stored) as string[]) : [];
    } catch {
      return [];
    }
  });
  const boardSettingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showBoardSettings) return;
    const handleClick = (e: MouseEvent) => {
      if (boardSettingsRef.current && !boardSettingsRef.current.contains(e.target as Node)) {
        setShowBoardSettings(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showBoardSettings]);

  const handleToggleProject = useCallback(
    (gid: string) => {
      setSelectedProjectGids((prev) => {
        const next = prev.includes(gid)
          ? prev.filter((g) => g !== gid)
          : [...prev, gid];
        try {
          localStorage.setItem("my-monkeys:project-filter", JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
      void refetch();
    },
    [refetch]
  );

  const handleSelectAllBoards = useCallback(() => {
    setSelectedProjectGids([]);
    try {
      localStorage.setItem("my-monkeys:project-filter", JSON.stringify([]));
    } catch {
      // ignore
    }
    void refetch();
  }, [refetch]);

  const userName = user?.user_metadata?.full_name ?? "";
  const firstName = userName.split(" ")[0] || "there";
  const userEmail = user?.email?.toLowerCase() ?? "";

  // Real-time PST clock
  const [now, setNow] = useState(getPSTNow);
  useEffect(() => {
    const id = setInterval(() => setNow(getPSTNow()), 1000);
    return () => clearInterval(id);
  }, []);

  const todayStr = useMemo(() => formatLocalDate(now), [now]);

  const greeting = getGreeting(now.getHours());
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // User match helper
  const isUserMatch = useCallback(
    (nameOrEmail: string | null | undefined): boolean => {
      if (!nameOrEmail) return false;
      const n = nameOrEmail.toLowerCase().trim();
      if (userEmail && n === userEmail) return true;
      if (userName && n === userName.toLowerCase()) return true;
      return false;
    },
    [userEmail, userName]
  );

  // ─── Today's meetings ───────────────────────────────────────────────────────

  const todayMeetings = useMemo(() => {
    if (!calEvents) return [];
    return calEvents
      .filter((e) => {
        const pst = toPacificDate(e.start_time);
        if (!pst) return false;
        const eventDate = formatLocalDate(pst);
        return eventDate === todayStr && !e.is_all_day;
      })
      .sort(
        (a, b) =>
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );
  }, [calEvents, todayStr]);

  // Upcoming meetings (next 7 days, excluding today) — shown when no meetings today
  const upcomingMeetings = useMemo(() => {
    if (!calEvents || todayMeetings.length > 0) return [];
    const pstNow = getPSTNow();
    const weekOutStr = formatLocalDate(new Date(
      pstNow.getFullYear(),
      pstNow.getMonth(),
      pstNow.getDate() + 7
    ));
    return calEvents
      .filter((e) => {
        const pst = toPacificDate(e.start_time);
        if (!pst || e.is_all_day) return false;
        const eventDate = formatLocalDate(pst);
        return eventDate > todayStr && eventDate <= weekOutStr;
      })
      .sort(
        (a, b) =>
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );
  }, [calEvents, todayStr, todayMeetings.length]);

  const showUpcoming = todayMeetings.length === 0 && upcomingMeetings.length > 0;

  // Group upcoming meetings by day label
  const upcomingByDay = useMemo(() => {
    if (!showUpcoming) return [];
    const groups: { label: string; events: CalendarEvent[] }[] = [];
    let currentLabel = "";
    for (const ev of upcomingMeetings) {
      const pst = toPacificDate(ev.start_time);
      const label = pst ? formatRelativeDay(formatLocalDate(pst)) : "Upcoming";
      if (label !== currentLabel) {
        groups.push({ label, events: [] });
        currentLabel = label;
      }
      groups[groups.length - 1].events.push(ev);
    }
    return groups;
  }, [showUpcoming, upcomingMeetings]);

  const isCurrentMeeting = useCallback(
    (event: CalendarEvent): boolean => {
      const start = new Date(event.start_time).getTime();
      const end = new Date(event.end_time).getTime();
      const nowMs = new Date().getTime();
      return nowMs >= start && nowMs <= end;
    },
    []
  );

  // ─── Meeting progress ──────────────────────────────────────────────────────

  const completedMeetingCount = useMemo(
    () => todayMeetings.filter((e) => new Date(e.end_time).getTime() < new Date().getTime()).length,
    [todayMeetings, now]
  );

  const nextMeetingId = useMemo(() => {
    const upcoming = todayMeetings.find(
      (e) => new Date(e.start_time).getTime() > new Date().getTime() && !isCurrentMeeting(e)
    );
    return upcoming?.id ?? null;
  }, [todayMeetings, now, isCurrentMeeting]);

  // ─── Active tasks (not completed) ──────────────────────────────────────────

  const activeTasks = useMemo(
    () => tasks.filter((t) => !t.completed),
    [tasks]
  );

  // ─── My monkeys (progressive fallback) ─────────────────────────────────────

  const weekOutStr = useMemo(() => {
    const pstNow = getPSTNow();
    return formatLocalDate(new Date(
      pstNow.getFullYear(),
      pstNow.getMonth(),
      pstNow.getDate() + 7
    ));
  }, [todayStr]);

  const { myMonkeys, monkeyFallbackTier } = useMemo(() => {
    const nonGorillaActive = activeTasks.filter((t) => !isAsanaGorilla(t));

    const sortMonkeys = (list: typeof activeTasks) =>
      [...list].sort((a, b) => {
        if (a.days_overdue > 0 && b.days_overdue <= 0) return -1;
        if (b.days_overdue > 0 && a.days_overdue <= 0) return 1;
        if (a.days_overdue > 0 && b.days_overdue > 0)
          return b.days_overdue - a.days_overdue;
        // Tasks with dates before tasks without
        const aDue = a.due_on || "";
        const bDue = b.due_on || "";
        if (aDue && !bDue) return -1;
        if (!aDue && bDue) return 1;
        return aDue.localeCompare(bDue);
      });

    // Tier 1: User-matched + date-restricted (overdue + due within 7 days)
    const tier1 = nonGorillaActive.filter((t) => {
      const isMine =
        isUserMatch(t.assignee_email) ||
        isUserMatch(t.assignee_name ?? t.assignee);
      if (!isMine) return false;
      if (t.days_overdue > 0) return true;
      if (!t.due_on) return false;
      return t.due_on >= todayStr && t.due_on <= weekOutStr;
    });
    if (tier1.length > 0) {
      return { myMonkeys: sortMonkeys(tier1), monkeyFallbackTier: 1 as const };
    }

    // Tier 2: User-matched, no date restriction (includes undated tasks)
    const tier2 = nonGorillaActive.filter((t) =>
      isUserMatch(t.assignee_email) ||
      isUserMatch(t.assignee_name ?? t.assignee)
    );
    if (tier2.length > 0) {
      return { myMonkeys: sortMonkeys(tier2), monkeyFallbackTier: 2 as const };
    }

    // Tier 3: All active non-gorilla tasks (API scopes to user's projects)
    return {
      myMonkeys: sortMonkeys(nonGorillaActive).slice(0, 15),
      monkeyFallbackTier: 3 as const,
    };
  }, [activeTasks, isUserMatch, todayStr, weekOutStr]);

  const filteredMonkeys = useMemo(
    () =>
      selectedProjectGids.length === 0
        ? myMonkeys
        : myMonkeys.filter(
            (t) => t.project_gid && selectedProjectGids.includes(t.project_gid)
          ),
    [myMonkeys, selectedProjectGids]
  );

  // ─── Needs Attention (combined feed) ───────────────────────────────────────

  interface AttentionItem {
    id: string;
    title: string;
    source: "email" | "asana" | "salesforce";
    preview: string;
    timeAgo: string;
    daysWaiting: number;
    urgency: "red" | "amber" | "teal";
    url: string;
  }

  const needsAttention = useMemo(() => {
    const items: AttentionItem[] = [];

    // Emails needing reply
    for (const e of emails) {
      if (!e.needs_reply) continue;
      const age = daysSince(e.received_at) ?? 0;
      if (age > MAX_ATTENTION_AGE_DAYS) continue;
      items.push({
        id: `em-${e.id}`,
        title: e.subject,
        source: "email",
        preview: `From ${e.from_name}`,
        timeAgo: relativeTime(e.received_at),
        daysWaiting: e.days_overdue,
        urgency: e.days_overdue > 2 ? "red" : e.days_overdue > 0 ? "amber" : "teal",
        url: e.outlook_url,
      });
    }

    // Asana comments awaiting response (recent only)
    for (const c of asanaComments) {
      const d = daysSince(c.latest_comment_at) ?? 0;
      if (d > MAX_ATTENTION_AGE_DAYS) continue;
      if (
        (c.relevance_reason === "assignee" ||
          c.relevance_reason === "collaborator") &&
        !isUserMatch(c.latest_commenter_name) &&
        !isUserMatch(c.latest_commenter_email)
      ) {
        items.push({
          id: `ac-${c.id}`,
          title: c.task_name,
          source: "asana",
          preview: c.latest_comment_text?.slice(0, 80) ?? "",
          timeAgo: relativeTime(c.latest_comment_at),
          daysWaiting: d,
          urgency: d > 3 ? "red" : d > 1 ? "amber" : "teal",
          url: c.permalink_url,
        });
      }
    }

    // Stale Salesforce opps (recent only)
    for (const opp of opportunities) {
      if (opp.is_closed) continue;
      if (!isStale(opp.last_activity_date)) continue;
      const d = daysSince(opp.last_activity_date) ?? 0;
      if (d > MAX_ATTENTION_AGE_DAYS) continue;
      items.push({
        id: `sf-${opp.id}`,
        title: opp.name,
        source: "salesforce",
        preview: `${opp.stage} · ${fmtAmount(opp.amount)}`,
        timeAgo: relativeTime(opp.last_activity_date),
        daysWaiting: d,
        urgency: d > 14 ? "red" : "amber",
        url: opp.sf_url,
      });
    }

    // Stale gorilla tasks (recent only)
    for (const t of activeTasks) {
      if (!isAsanaGorilla(t)) continue;
      const staleDays = daysSince(t.modified_at) ?? 0;
      if (staleDays > MAX_ATTENTION_AGE_DAYS) continue;
      if (t.days_overdue > 0 || isStale(t.modified_at)) {
        items.push({
          id: `ag-${t.id}`,
          title: t.name,
          source: "asana",
          preview: t.days_overdue > 0 ? `${t.days_overdue}d overdue` : `${staleDays}d stale`,
          timeAgo: relativeTime(t.modified_at),
          daysWaiting: t.days_overdue || staleDays,
          urgency: t.days_overdue > 0 ? "red" : "amber",
          url: t.permalink_url,
        });
      }
    }

    return items.sort((a, b) => b.daysWaiting - a.daysWaiting);
  }, [emails, asanaComments, opportunities, activeTasks, isUserMatch]);

  // ─── Needs Attention grouped by source ────────────────────────────────────

  const SOURCE_LABELS: Record<string, string> = {
    email: "Email",
    asana: "Asana",
    salesforce: "Salesforce",
  };

  const attentionGroups = useMemo(() => {
    const groups: Record<string, typeof needsAttention> = {};
    for (const item of needsAttention) {
      (groups[item.source] ??= []).push(item);
    }
    // Sort groups: most red items first, then cap each group
    return Object.entries(groups)
      .sort(([, a], [, b]) => {
        const redA = a.filter((i) => i.urgency === "red").length;
        const redB = b.filter((i) => i.urgency === "red").length;
        return redB - redA;
      })
      .map(([source, items]) => ({
        source,
        items: items.slice(0, MAX_ITEMS_PER_GROUP),
        total: items.length,
        hasMore: items.length > MAX_ITEMS_PER_GROUP,
      }));
  }, [needsAttention]);

  // ─── Delegated going cold ──────────────────────────────────────────────────

  const delegatedCold = useMemo(() => {
    return activeTasks
      .filter((t) => {
        const createdByUser = isUserMatch(t.created_by_email);
        const notAssignedToUser =
          !isUserMatch(t.assignee_email) &&
          !isUserMatch(t.assignee_name ?? t.assignee);
        const hasAssignee = !!(t.assignee_name || t.assignee);
        if (!createdByUser || !notAssignedToUser || !hasAssignee) return false;
        if (isAsanaGorilla(t)) return false;
        // No update in 5+ days, but not ancient (>60d)
        const d = daysSince(t.modified_at);
        return d !== null && d >= STALE_DAYS && d <= MAX_ATTENTION_AGE_DAYS;
      })
      .sort((a, b) => {
        const aStale = daysSince(a.modified_at) ?? 0;
        const bStale = daysSince(b.modified_at) ?? 0;
        return bStale - aStale;
      })
      .slice(0, 10);
  }, [activeTasks, isUserMatch]);

  // ─── Gorillas in Flight ────────────────────────────────────────────────────

  interface GorillaCard {
    id: string;
    name: string;
    source: "salesforce" | "monday" | "asana";
    owner: string;
    stage: string;
    amount: number | null;
    urgency: "red" | "amber" | "teal";
    url: string;
  }

  const gorillasInFlight = useMemo(() => {
    const items: GorillaCard[] = [];

    for (const opp of opportunities) {
      if (opp.is_closed) continue;
      const stale = isStale(opp.last_activity_date);
      items.push({
        id: `sf-${opp.id}`,
        name: opp.name,
        source: "salesforce",
        owner: opp.owner_name,
        stage: opp.stage,
        amount: opp.amount,
        urgency: stale ? "red" : opp.probability < 50 ? "amber" : "teal",
        url: opp.sf_url,
      });
    }

    for (const order of orders) {
      if (order.status.toUpperCase() === "COMPLETE") continue;
      items.push({
        id: `mon-${order.id}`,
        name: order.name,
        source: "monday",
        owner: order.dealer || order.location,
        stage: order.status,
        amount: order.amount,
        urgency: "teal",
        url: order.monday_url,
      });
    }

    for (const t of activeTasks) {
      if (!isAsanaGorilla(t)) continue;
      // Skip ancient gorillas — only show tasks with recent activity
      const age = daysSince(t.modified_at) ?? 0;
      if (age > 90) continue;
      const stale = isStale(t.modified_at);
      items.push({
        id: `ag-${t.id}`,
        name: t.name,
        source: "asana",
        owner: t.assignee_name ?? t.assignee ?? t.created_by_name ?? "—",
        stage: t.days_overdue > 0 ? "Overdue" : stale ? "Stale" : "On Track",
        amount: null,
        urgency: t.days_overdue > 0 ? "red" : stale ? "amber" : "teal",
        url: t.permalink_url,
      });
    }

    // Sort: at-risk first, then cap display
    items.sort((a, b) => {
      const rank = { red: 0, amber: 1, teal: 2 };
      return rank[a.urgency] - rank[b.urgency];
    });
    return items.slice(0, MAX_GORILLAS_DISPLAY);
  }, [opportunities, orders, activeTasks]);

  // ─── Quick stats ───────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const meetingsToday = todayMeetings.length;
    const openMonkeys = myMonkeys.length;
    const gorillasAtRisk = gorillasInFlight.filter(
      (g) => g.urgency === "red" || g.urgency === "amber"
    ).length;
    const emailsNeedReply = emails.filter((e) => e.needs_reply).length;
    return { meetingsToday, openMonkeys, gorillasAtRisk, emailsNeedReply };
  }, [todayMeetings, myMonkeys, gorillasInFlight, emails]);

  // ─── Email inbox summary ──────────────────────────────────────────────────

  const emailStats = useMemo(() => {
    const unread = emails.filter((e) => !e.is_read).length;
    const needReply = emails.filter((e) => e.needs_reply).length;
    const todayEmails = emails.filter((e) => {
      const d = daysSince(e.received_at);
      return d !== null && d === 0;
    }).length;
    return { unread, needReply, todayEmails };
  }, [emails]);

  // ─── Tomorrow's first meeting ──────────────────────────────────────────────

  const tomorrowFirstMeeting = useMemo(() => {
    if (!calEvents) return null;
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = formatLocalDate(tomorrow);
    return calEvents
      .filter((e) => {
        const pst = toPacificDate(e.start_time);
        if (!pst) return false;
        return formatLocalDate(pst) === tomorrowStr && !e.is_all_day;
      })
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0] ?? null;
  }, [calEvents, now]);

  const loading =
    calLoading || tasksLoading || emailsLoading || sfLoading || mondayLoading || commentsLoading;

  // Gorilla expand state
  const [expandedGorilla, setExpandedGorilla] = useState<string | null>(null);

  // Unlock more services
  const [servicesOpen, setServicesOpen] = useState(false);
  const disconnectedServices = useMemo(
    () => Object.entries(connections)
      .filter(([, connected]) => !connected)
      .map(([key]) => key),
    [connections]
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  // ─── Urgency helpers ─────────────────────────────────────────────────────

  const urgencyDot = (u: "red" | "amber" | "teal") => (
    <span
      className={cn(
        "inline-block w-2 h-2 rounded-full shrink-0",
        u === "red" && "bg-accent-red",
        u === "amber" && "bg-accent-amber",
        u === "teal" && "bg-accent-teal"
      )}
    />
  );

  const urgencyBorder = (u: "red" | "amber" | "teal") =>
    cn(
      "border-l-2",
      u === "red" && "border-l-accent-red",
      u === "amber" && "border-l-accent-amber",
      u === "teal" && "border-l-accent-teal"
    );

  const sourceBadge = (source: string) => {
    const map: Record<string, string> = {
      email: "tag-email",
      asana: "tag-asana",
      salesforce: "tag-salesforce",
      monday: "tag-teams",
    };
    return (
      <span
        className={cn(
          "text-[10px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-wide",
          map[source] ?? "bg-white/5 text-text-muted"
        )}
      >
        {source}
      </span>
    );
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* ── Top Strip: Greeting + Stats ──────────────────────────────────────── */}
      <div className="glass-card anim-card p-5" style={{ animationDelay: "0ms" }}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-text-heading">
              {greeting}, {firstName}
            </h1>
            <div className="flex items-center gap-2 mt-1 text-text-muted text-xs">
              <span>{dateStr}</span>
              <span className="opacity-40">·</span>
              <span className="flex items-center gap-1 font-mono tabular-nums">
                {ClockIcon} {formatPSTTime(now)} PST
              </span>
            </div>
          </div>

          {/* Quick stats */}
          <div className="flex items-center gap-4">
            {[
              connections.m365 && { label: "Meetings", value: stats.meetingsToday, color: "text-accent-teal" },
              connections.asana && { label: "Monkeys", value: stats.openMonkeys, color: "text-accent-amber" },
              { label: "At Risk", value: stats.gorillasAtRisk, color: stats.gorillasAtRisk > 0 ? "text-accent-red" : "text-text-muted" },
              connections.m365 && { label: "Reply", value: stats.emailsNeedReply, color: stats.emailsNeedReply > 0 ? "text-accent-red" : "text-text-muted" },
            ].filter((s): s is { label: string; value: number; color: string } => Boolean(s)).map((s) => (
              <div key={s.label} className="text-center min-w-[48px]">
                <p className={cn("text-lg font-bold tabular-nums", s.color)}>
                  {loading ? "—" : s.value}
                </p>
                <p className="text-[10px] text-text-muted uppercase tracking-wide">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 2-Column Grid ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── LEFT COLUMN ────────────────────────────────────────────────────── */}
        <div className="space-y-5">
          {/* Today's Schedule / Upcoming Schedule */}
          {connections.m365 && <div
            className="glass-card anim-card p-5"
            style={{ animationDelay: "80ms" }}
          >
            <h2 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2">
              {SunriseIcon}
              {showUpcoming ? "Upcoming Schedule" : "Today\u2019s Schedule"}
              <span className="text-xs text-text-muted font-normal">
                ({showUpcoming ? upcomingMeetings.length : todayMeetings.length})
              </span>
              {!loading && todayMeetings.length > 0 && (
                <span className="text-xs text-accent-teal font-normal ml-auto">
                  {completedMeetingCount}/{todayMeetings.length} done
                </span>
              )}
            </h2>

            {loading ? (
              <SectionSkeleton />
            ) : todayMeetings.length > 0 ? (
              /* ── Today's meetings (existing behavior) ── */
              <div className="space-y-2">
                {todayMeetings.map((event) => {
                  const isCurrent = isCurrentMeeting(event);
                  const isPast = new Date(event.end_time).getTime() < new Date().getTime();
                  const isUpNext = event.id === nextMeetingId;
                  return (
                    <div
                      key={event.id}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-lg transition-colors",
                        isCurrent
                          ? "bg-accent-teal/10 border border-accent-teal/30"
                          : isUpNext
                          ? "bg-accent-amber/5 border border-accent-amber/20"
                          : "bg-white/[0.03] hover:bg-white/[0.06]",
                        isPast && "opacity-50"
                      )}
                    >
                      <div className="text-xs text-text-muted font-mono tabular-nums shrink-0 w-[70px] pt-0.5">
                        {formatTimeShort(event.start_time)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {isCurrent && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-accent-teal uppercase tracking-wider">
                              <span className="w-1.5 h-1.5 rounded-full bg-accent-teal animate-pulse" />
                              NOW
                            </span>
                          )}
                          {isUpNext && !isCurrent && (
                            <span className="inline-flex items-center text-[10px] font-semibold text-accent-amber uppercase tracking-wider">
                              UP NEXT
                            </span>
                          )}
                          <p className={cn("text-sm font-medium text-text-heading truncate", isPast && "line-through")}>
                            {event.subject}
                          </p>
                        </div>
                        <p className="text-xs text-text-muted truncate mt-0.5">
                          {formatTimeShort(event.start_time)} –{" "}
                          {formatTimeShort(event.end_time)}
                          {event.organizer && ` · ${event.organizer}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() =>
                            window.dispatchEvent(
                              new CustomEvent("navigate-prep", { detail: { eventId: event.id } })
                            )
                          }
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 text-text-muted text-[11px] font-medium hover:text-text-body hover:bg-white/10 transition-colors"
                        >
                          {PrepIcon} Prep
                        </button>
                        {event.is_online && event.join_url && (
                          <a
                            href={event.join_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                              "flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors",
                              isCurrent
                                ? "bg-accent-teal/20 text-accent-teal hover:bg-accent-teal/30"
                                : "bg-white/5 text-text-muted hover:text-text-body hover:bg-white/10"
                            )}
                          >
                            {VideoIcon} Join
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : showUpcoming ? (
              /* ── Upcoming meetings grouped by day ── */
              <div className="space-y-4">
                {upcomingByDay.map((group) => (
                  <div key={group.label}>
                    <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">
                      {group.label}
                    </p>
                    <div className="space-y-2">
                      {group.events.map((event) => (
                        <div
                          key={event.id}
                          className="flex items-start gap-3 p-3 rounded-lg transition-colors bg-white/[0.03] hover:bg-white/[0.06]"
                        >
                          <div className="text-xs text-text-muted font-mono tabular-nums shrink-0 w-[70px] pt-0.5">
                            {formatTimeShort(event.start_time)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-text-heading truncate">
                              {event.subject}
                            </p>
                            <p className="text-xs text-text-muted truncate mt-0.5">
                              {formatTimeShort(event.start_time)} –{" "}
                              {formatTimeShort(event.end_time)}
                              {event.organizer && ` · ${event.organizer}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() =>
                                window.dispatchEvent(
                                  new CustomEvent("navigate-prep", { detail: { eventId: event.id } })
                                )
                              }
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 text-text-muted text-[11px] font-medium hover:text-text-body hover:bg-white/10 transition-colors"
                            >
                              {PrepIcon} Prep
                            </button>
                            {event.is_online && event.join_url && (
                              <a
                                href={event.join_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors bg-white/5 text-text-muted hover:text-text-body hover:bg-white/10"
                              >
                                {VideoIcon} Join
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <SectionEmpty message="No meetings this week" />
            )}
          </div>}

          {/* My Monkeys */}
          {connections.asana && <div
            className="glass-card anim-card p-5"
            style={{ animationDelay: "160ms" }}
          >
            <div ref={boardSettingsRef}>
              <h2 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" />
                </svg>
                My Monkeys
                <span className="text-xs text-text-muted font-normal">
                  ({filteredMonkeys.length})
                </span>
                <div className="ml-auto flex items-center gap-2">
                  {monkeyFallbackTier === 2 && !showBoardSettings && selectedProjectGids.length === 0 && (
                    <span className="text-xs text-text-muted font-normal">All tasks</span>
                  )}
                  {monkeyFallbackTier === 3 && !showBoardSettings && selectedProjectGids.length === 0 && (
                    <span className="text-xs text-text-muted font-normal">From my projects</span>
                  )}
                  {selectedProjectGids.length > 0 && !showBoardSettings && (
                    <span className="text-xs text-text-muted font-normal">{selectedProjectGids.length} board{selectedProjectGids.length !== 1 ? "s" : ""}</span>
                  )}
                  <button
                    onClick={() => setShowBoardSettings((v) => !v)}
                    className={cn(
                      "p-1 rounded transition-colors",
                      showBoardSettings
                        ? "text-text-heading bg-white/10"
                        : "text-text-muted hover:text-text-heading hover:bg-white/[0.06]"
                    )}
                    title="Filter boards"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                    </svg>
                  </button>
                </div>
              </h2>

              {showBoardSettings && (
                <div className="mb-3 p-3 rounded-lg bg-white/[0.04] border border-white/[0.08]">
                  <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Filter by board</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={selectedProjectGids.length === 0}
                        onChange={handleSelectAllBoards}
                        className="accent-accent-teal w-3.5 h-3.5"
                      />
                      <span className="text-xs text-text-heading font-medium group-hover:text-white transition-colors">All boards</span>
                    </label>
                    {asanaProjects.length > 0 && (
                      <div className="border-t border-white/[0.06] my-1.5" />
                    )}
                    {asanaProjects.map((project) => (
                      <label key={project.gid} className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={selectedProjectGids.includes(project.gid)}
                          onChange={() => handleToggleProject(project.gid)}
                          className="accent-accent-teal w-3.5 h-3.5"
                        />
                        <span className="text-xs text-text-muted group-hover:text-text-heading transition-colors truncate">{project.name}</span>
                      </label>
                    ))}
                    {asanaProjects.length === 0 && (
                      <p className="text-xs text-text-muted opacity-60 py-1">Loading boards…</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {loading ? (
              <SectionSkeleton />
            ) : filteredMonkeys.length === 0 ? (
              <SectionEmpty message="No active tasks found" />
            ) : (
              <div className="space-y-2">
                {filteredMonkeys.map((task) => {
                  const isOverdue = task.days_overdue > 0;
                  const isDueToday = !isOverdue && task.due_on === todayStr;
                  const hasDate = !!task.due_on;
                  const urgency: "red" | "amber" | "teal" = isOverdue
                    ? "red"
                    : isDueToday
                    ? "amber"
                    : "teal";
                  const badgeLabel = isOverdue
                    ? `${task.days_overdue}d overdue`
                    : isDueToday
                    ? "Due today"
                    : hasDate
                    ? formatRelativeDay(task.due_on)
                    : "No date";
                  return (
                    <a
                      key={task.id}
                      href={task.permalink_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "block p-3 rounded-lg transition-colors bg-white/[0.03] hover:bg-white/[0.06]",
                        urgencyBorder(urgency)
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-text-heading truncate flex-1">
                          {task.name}
                        </p>
                        <span
                          className={cn(
                            "shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full",
                            isOverdue
                              ? "bg-accent-red/15 text-accent-red"
                              : isDueToday
                              ? "bg-accent-amber/15 text-accent-amber"
                              : !hasDate
                              ? "bg-white/10 text-text-muted"
                              : "bg-accent-teal/15 text-accent-teal"
                          )}
                        >
                          {badgeLabel}
                        </span>
                      </div>
                      <p className="text-xs text-text-muted mt-1 truncate">
                        {task.project_name}
                        {task.assignee_name && ` · ${task.assignee_name}`}
                      </p>
                    </a>
                  );
                })}
              </div>
            )}
          </div>}

          {/* Email Inbox Snapshot */}
          {connections.m365 && <div
            className="glass-card anim-card p-5"
            style={{ animationDelay: "240ms" }}
          >
            <h2 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
              </svg>
              Email Inbox
            </h2>

            {loading ? (
              <SectionSkeleton />
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 rounded-lg bg-white/[0.03]">
                  <p className="text-lg font-bold tabular-nums text-text-heading">
                    {emailStats.todayEmails}
                  </p>
                  <p className="text-[10px] text-text-muted uppercase tracking-wide">
                    Today
                  </p>
                </div>
                <div className="text-center p-3 rounded-lg bg-white/[0.03]">
                  <p className={cn("text-lg font-bold tabular-nums", emailStats.unread > 0 ? "text-accent-amber" : "text-text-muted")}>
                    {emailStats.unread}
                  </p>
                  <p className="text-[10px] text-text-muted uppercase tracking-wide">
                    Unread
                  </p>
                </div>
                <div className="text-center p-3 rounded-lg bg-white/[0.03]">
                  <p className={cn("text-lg font-bold tabular-nums", emailStats.needReply > 0 ? "text-accent-red" : "text-text-muted")}>
                    {emailStats.needReply}
                  </p>
                  <p className="text-[10px] text-text-muted uppercase tracking-wide">
                    Need Reply
                  </p>
                </div>
              </div>
            )}
          </div>}

          {/* Tomorrow Preview — hidden when upcoming schedule already shows it */}
          {connections.m365 && !showUpcoming && tomorrowFirstMeeting && (
            <div
              className="glass-card anim-card p-5"
              style={{ animationDelay: "320ms" }}
            >
              <h2 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
                Tomorrow Starts With
              </h2>
              <div className="p-3 rounded-lg bg-white/[0.03]">
                <p className="text-sm font-medium text-text-heading truncate">
                  {tomorrowFirstMeeting.subject}
                </p>
                <p className="text-xs text-text-muted mt-1">
                  {formatTimeShort(tomorrowFirstMeeting.start_time)} –{" "}
                  {formatTimeShort(tomorrowFirstMeeting.end_time)}
                  {tomorrowFirstMeeting.organizer && ` · ${tomorrowFirstMeeting.organizer}`}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT COLUMN ───────────────────────────────────────────────────── */}
        <div className="space-y-5">
          {/* Needs Attention */}
          <div
            className="glass-card anim-card p-5"
            style={{ animationDelay: "80ms" }}
          >
            <h2 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              Needs Attention
              <span className="text-xs text-text-muted font-normal">
                ({needsAttention.length})
              </span>
            </h2>

            {loading ? (
              <SectionSkeleton />
            ) : needsAttention.length === 0 ? (
              <SectionEmpty message="Nothing needs attention right now" />
            ) : (
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
                {attentionGroups.map((group) => (
                  <div key={group.source}>
                    <div className="flex items-center gap-2 mb-2">
                      {sourceBadge(group.source)}
                      <span className="text-[10px] text-text-muted">
                        {group.total} {group.total === 1 ? "item" : "items"}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {group.items.map((item) => (
                        <a
                          key={item.id}
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            "block p-3 rounded-lg transition-colors bg-white/[0.03] hover:bg-white/[0.06]",
                            urgencyBorder(item.urgency)
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              {urgencyDot(item.urgency)}
                              <p className="text-sm font-medium text-text-heading truncate">
                                {item.title}
                              </p>
                            </div>
                            <span className="text-[10px] text-text-muted shrink-0">
                              {item.timeAgo}
                            </span>
                          </div>
                          <p className="text-xs text-text-muted mt-1 truncate pl-4">
                            {item.preview}
                          </p>
                        </a>
                      ))}
                      {group.hasMore && (
                        <p className="text-[10px] text-text-muted text-center py-1 opacity-60">
                          +{group.total - MAX_ITEMS_PER_GROUP} more
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Delegated — Going Cold */}
          {connections.asana && <div
            className="glass-card anim-card p-5"
            style={{ animationDelay: "160ms" }}
          >
            <h2 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 3h5v5" /><path d="M21 3l-7 7" /><circle cx="12" cy="16" r="4" />
              </svg>
              Delegated — Going Cold
              <span className="text-xs text-text-muted font-normal">
                ({delegatedCold.length})
              </span>
            </h2>

            {loading ? (
              <SectionSkeleton />
            ) : delegatedCold.length === 0 ? (
              <SectionEmpty message="All delegated tasks have recent updates" />
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                {delegatedCold.map((task) => {
                  const staleDays = daysSince(task.modified_at) ?? 0;
                  return (
                    <div
                      key={task.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition-colors",
                        urgencyBorder(staleDays > 14 ? "red" : "amber")
                      )}
                    >
                      {/* Assignee avatar */}
                      <div className="shrink-0 w-7 h-7 rounded-full bg-accent-amber/15 text-accent-amber flex items-center justify-center text-[10px] font-bold">
                        {initials(task.assignee_name ?? task.assignee)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-heading truncate">
                          {task.name}
                        </p>
                        <p className="text-xs text-text-muted truncate">
                          {task.assignee_name ?? task.assignee} ·{" "}
                          <span
                            className={cn(
                              staleDays > 14
                                ? "text-accent-red"
                                : "text-accent-amber"
                            )}
                          >
                            {staleDays}d since update
                          </span>
                        </p>
                      </div>

                      {/* Nudge action */}
                      <a
                        href={task.permalink_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent-amber/10 text-accent-amber text-[11px] font-medium hover:bg-accent-amber/20 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {NudgeIcon} Nudge
                      </a>
                    </div>
                  );
                })}
              </div>
            )}
          </div>}
        </div>
      </div>

      {/* ── Gorillas in Flight (Full Width Bottom Strip) ─────────────────────── */}
      <div
        className="glass-card anim-card p-5"
        style={{ animationDelay: "240ms" }}
      >
        <h2 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5Z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
          </svg>
          Gorillas in Flight
          <span className="text-xs text-text-muted font-normal">
            ({gorillasInFlight.length})
          </span>
        </h2>

        {loading ? (
          <div className="flex gap-3">
            <Skeleton className="h-20 w-64 shrink-0" />
            <Skeleton className="h-20 w-64 shrink-0" />
            <Skeleton className="h-20 w-64 shrink-0" />
            <Skeleton className="h-20 w-64 shrink-0" />
          </div>
        ) : gorillasInFlight.length === 0 ? (
          <SectionEmpty message="No active gorillas" />
        ) : (
          <div className="relative">
            <div
              ref={scrollRef}
              className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin"
            >
            {gorillasInFlight.map((g) => (
              <div
                key={g.id}
                className={cn(
                  "shrink-0 w-64 rounded-lg p-3 transition-all cursor-pointer bg-white/[0.03] hover:bg-white/[0.06]",
                  urgencyBorder(g.urgency),
                  expandedGorilla === g.id && "w-80 bg-white/[0.06]"
                )}
                onClick={() =>
                  setExpandedGorilla(
                    expandedGorilla === g.id ? null : g.id
                  )
                }
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-text-heading truncate flex-1">
                    {g.name}
                  </p>
                  {urgencyDot(g.urgency)}
                </div>

                {/* Stage pill */}
                <div className="flex items-center gap-2 mt-2">
                  <span
                    className={cn(
                      "text-[10px] font-medium px-2 py-0.5 rounded-full",
                      g.urgency === "red"
                        ? "bg-accent-red/15 text-accent-red"
                        : g.urgency === "amber"
                        ? "bg-accent-amber/15 text-accent-amber"
                        : "bg-accent-teal/15 text-accent-teal"
                    )}
                  >
                    {g.stage}
                  </span>
                  {sourceBadge(g.source)}
                </div>

                <p className="text-xs text-text-muted mt-2 truncate">
                  {g.owner}
                  {g.amount ? ` · ${fmtAmount(g.amount)}` : ""}
                </p>

                {/* Expanded detail */}
                {expandedGorilla === g.id && (
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <a
                      href={g.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-accent-amber hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {ExternalIcon} Open in {g.source}
                    </a>
                  </div>
                )}
              </div>
            ))}
            </div>
            {gorillasInFlight.length > 2 && (
              <div className="absolute right-0 top-0 bottom-2 w-12 bg-gradient-to-l from-[var(--bg-card,rgba(0,0,0,0.3))] to-transparent pointer-events-none md:hidden" />
            )}
          </div>
        )}
      </div>

      {/* ── Unlock More Services ──────────────────────────────────────────────── */}
      {disconnectedServices.length > 0 && (
        <div className="glass-card anim-card p-4" style={{ animationDelay: "320ms" }}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-heading">Unlock more insights</p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {disconnectedServices.map((svc) => (
                    <span key={svc} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-text-muted">
                      {SERVICE_LABELS[svc] ?? svc}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <button
              onClick={() => setServicesOpen(true)}
              className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg bg-white/5 hover:bg-white/10 text-text-primary transition-colors cursor-pointer"
            >
              Manage
            </button>
          </div>
        </div>
      )}

      <ConnectedServicesPanel open={servicesOpen} onClose={() => setServicesOpen(false)} />
    </div>
  );
}
