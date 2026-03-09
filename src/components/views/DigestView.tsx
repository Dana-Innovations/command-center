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
import { toPacificDate } from "@/lib/calendar";
import type { Task, CalendarEvent } from "@/lib/types";

// ─── Constants ───────────────────────────────────────────────────────────────

const STALE_DAYS = 5;
const TODAY = new Date();
const TODAY_STR = TODAY.toISOString().slice(0, 10);

const GORILLA_KEYWORDS =
  /\b(initiative|launch|program|rollout|strategy|overhaul|transformation|campaign|integration|migration|implementation|pilot)\b/i;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  return Math.floor((TODAY.getTime() - new Date(dateStr).getTime()) / 86400000);
}

function isStale(modifiedAt: string | null | undefined): boolean {
  const d = daysSince(modifiedAt);
  return d !== null && d >= STALE_DAYS;
}

function isAsanaGorilla(task: Task): boolean {
  if (GORILLA_KEYWORDS.test(task.name)) return true;
  if (task.project_name && GORILLA_KEYWORDS.test(task.project_name)) return true;
  if (task.num_subtasks && task.num_subtasks > 0) return true;
  if (task.due_on) {
    const daysUntilDue = Math.ceil(
      (new Date(task.due_on).getTime() - TODAY.getTime()) / 86400000
    );
    if (daysUntilDue >= 30) return true;
  }
  const followerCount = task.follower_names?.length ?? 0;
  const collabCount = task.collaborator_names?.length ?? 0;
  if (followerCount + collabCount >= 3) return true;
  if (task.project_name && task.project_name.trim().length > 0) return true;
  return false;
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

function formatTimeShort(isoStr: string): string {
  const d = toPacificDate(isoStr);
  if (!d) return "";
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
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
  const { user, isAri } = useAuth();
  const { events: calEvents, loading: calLoading } = useCalendar();
  const { tasks, loading: tasksLoading } = useTasks();
  const { emails, loading: emailsLoading } = useEmails();
  const { opportunities, loading: sfLoading } = useSalesforce();
  const { orders, loading: mondayLoading } = useMonday();
  const { comments: asanaComments, loading: commentsLoading } = useAsanaComments();

  const userName = user?.user_metadata?.full_name ?? "";
  const firstName = userName.split(" ")[0] || "there";
  const userEmail = user?.email?.toLowerCase() ?? "";

  // Real-time PST clock
  const [now, setNow] = useState(getPSTNow);
  useEffect(() => {
    const id = setInterval(() => setNow(getPSTNow()), 1000);
    return () => clearInterval(id);
  }, []);

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
      if (!nameOrEmail || !userEmail) return false;
      const n = nameOrEmail.toLowerCase().trim();
      return n === userEmail || n === userName.toLowerCase();
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
        const eventDate = pst.toISOString().slice(0, 10);
        return eventDate === TODAY_STR && !e.is_all_day;
      })
      .sort(
        (a, b) =>
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );
  }, [calEvents]);

  const isCurrentMeeting = useCallback(
    (event: CalendarEvent): boolean => {
      const start = new Date(event.start_time).getTime();
      const end = new Date(event.end_time).getTime();
      const nowMs = new Date().getTime();
      return nowMs >= start && nowMs <= end;
    },
    []
  );

  // ─── Active tasks (not completed) ──────────────────────────────────────────

  const activeTasks = useMemo(
    () => tasks.filter((t) => !t.completed),
    [tasks]
  );

  // ─── My monkeys due today / overdue ────────────────────────────────────────

  const myMonkeysDueOrOverdue = useMemo(() => {
    return activeTasks
      .filter((t) => {
        const isMine =
          isUserMatch(t.assignee_email) ||
          isUserMatch(t.assignee_name ?? t.assignee);
        if (!isMine) return false;
        if (isAsanaGorilla(t)) return false;
        // Due today or overdue
        return t.days_overdue > 0 || t.due_on === TODAY_STR;
      })
      .sort((a, b) => {
        // Overdue first (more overdue = higher)
        if (a.days_overdue > 0 && b.days_overdue <= 0) return -1;
        if (b.days_overdue > 0 && a.days_overdue <= 0) return 1;
        if (a.days_overdue > 0 && b.days_overdue > 0)
          return b.days_overdue - a.days_overdue;
        return (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999");
      });
  }, [activeTasks, isUserMatch]);

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

    // Emails needing reply (oldest first)
    for (const e of emails) {
      if (e.needs_reply) {
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
    }

    // Asana comments awaiting response
    for (const c of asanaComments) {
      if (
        (c.relevance_reason === "assignee" ||
          c.relevance_reason === "collaborator") &&
        !isUserMatch(c.latest_commenter_name) &&
        !isUserMatch(c.latest_commenter_email)
      ) {
        const d = daysSince(c.latest_comment_at) ?? 0;
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

    // Gorillas at risk (stale Salesforce opps)
    for (const opp of opportunities) {
      if (opp.is_closed) continue;
      if (isStale(opp.last_activity_date)) {
        const d = daysSince(opp.last_activity_date) ?? 0;
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
    }

    // Stale gorilla tasks
    for (const t of activeTasks) {
      if (!isAsanaGorilla(t)) continue;
      if (t.days_overdue > 0 || isStale(t.modified_at)) {
        items.push({
          id: `ag-${t.id}`,
          title: t.name,
          source: "asana",
          preview: t.days_overdue > 0 ? `${t.days_overdue}d overdue` : `${daysSince(t.modified_at)}d stale`,
          timeAgo: relativeTime(t.modified_at),
          daysWaiting: t.days_overdue || (daysSince(t.modified_at) ?? 0),
          urgency: t.days_overdue > 0 ? "red" : "amber",
          url: t.permalink_url,
        });
      }
    }

    return items.sort((a, b) => b.daysWaiting - a.daysWaiting);
  }, [emails, asanaComments, opportunities, activeTasks, isUserMatch]);

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
        // No update in 5+ days
        const d = daysSince(t.modified_at);
        return d !== null && d >= STALE_DAYS;
      })
      .sort((a, b) => {
        const aStale = daysSince(a.modified_at) ?? 0;
        const bStale = daysSince(b.modified_at) ?? 0;
        return bStale - aStale;
      });
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

    return items;
  }, [opportunities, orders, activeTasks]);

  // ─── Quick stats ───────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const meetingsToday = todayMeetings.length;
    const openMonkeys = activeTasks.filter(
      (t) =>
        (isUserMatch(t.assignee_email) ||
          isUserMatch(t.assignee_name ?? t.assignee)) &&
        !isAsanaGorilla(t)
    ).length;
    const gorillasAtRisk = gorillasInFlight.filter(
      (g) => g.urgency === "red" || g.urgency === "amber"
    ).length;
    const emailsNeedReply = emails.filter((e) => e.needs_reply).length;
    return { meetingsToday, openMonkeys, gorillasAtRisk, emailsNeedReply };
  }, [todayMeetings, activeTasks, gorillasInFlight, emails, isUserMatch]);

  const loading =
    calLoading || tasksLoading || emailsLoading || sfLoading || mondayLoading || commentsLoading;

  // Gorilla expand state
  const [expandedGorilla, setExpandedGorilla] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ─── Gate behind isAri ───────────────────────────────────────────────────

  if (!isAri) {
    return (
      <div className="glass-card p-10 text-center">
        <p className="text-text-muted text-sm">
          This view is not available for your account.
        </p>
      </div>
    );
  }

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
      salesforce: "tag-slack",
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
              { label: "Meetings", value: stats.meetingsToday, color: "text-accent-teal" },
              { label: "Monkeys", value: stats.openMonkeys, color: "text-accent-amber" },
              { label: "At Risk", value: stats.gorillasAtRisk, color: stats.gorillasAtRisk > 0 ? "text-accent-red" : "text-text-muted" },
              { label: "Reply", value: stats.emailsNeedReply, color: stats.emailsNeedReply > 0 ? "text-accent-red" : "text-text-muted" },
            ].map((s) => (
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
          {/* Today's Schedule */}
          <div
            className="glass-card anim-card p-5"
            style={{ animationDelay: "80ms" }}
          >
            <h2 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2">
              {SunriseIcon}
              Today&apos;s Schedule
              <span className="text-xs text-text-muted font-normal">
                ({todayMeetings.length})
              </span>
            </h2>

            {loading ? (
              <SectionSkeleton />
            ) : todayMeetings.length === 0 ? (
              <SectionEmpty message="No meetings today" />
            ) : (
              <div className="space-y-2">
                {todayMeetings.map((event) => {
                  const isCurrent = isCurrentMeeting(event);
                  return (
                    <div
                      key={event.id}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-lg transition-colors",
                        isCurrent
                          ? "bg-accent-teal/10 border border-accent-teal/30"
                          : "bg-white/[0.03] hover:bg-white/[0.06]"
                      )}
                    >
                      {/* Time column */}
                      <div className="text-xs text-text-muted font-mono tabular-nums shrink-0 w-[70px] pt-0.5">
                        {formatTimeShort(event.start_time)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {isCurrent && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-accent-teal uppercase tracking-wider">
                              <span className="w-1.5 h-1.5 rounded-full bg-accent-teal animate-pulse" />
                              NOW
                            </span>
                          )}
                          <p className="text-sm font-medium text-text-heading truncate">
                            {event.subject}
                          </p>
                        </div>
                        <p className="text-xs text-text-muted truncate mt-0.5">
                          {formatTimeShort(event.start_time)} –{" "}
                          {formatTimeShort(event.end_time)}
                          {event.organizer && ` · ${event.organizer}`}
                        </p>
                      </div>

                      {/* Join link */}
                      {event.is_online && event.join_url && (
                        <a
                          href={event.join_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            "shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors",
                            isCurrent
                              ? "bg-accent-teal/20 text-accent-teal hover:bg-accent-teal/30"
                              : "bg-white/5 text-text-muted hover:text-text-body hover:bg-white/10"
                          )}
                        >
                          {VideoIcon} Join
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* My Monkeys Due Today / Overdue */}
          <div
            className="glass-card anim-card p-5"
            style={{ animationDelay: "160ms" }}
          >
            <h2 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
              My Monkeys — Due Today &amp; Overdue
              <span className="text-xs text-text-muted font-normal">
                ({myMonkeysDueOrOverdue.length})
              </span>
            </h2>

            {loading ? (
              <SectionSkeleton />
            ) : myMonkeysDueOrOverdue.length === 0 ? (
              <SectionEmpty message="No monkeys due today or overdue" />
            ) : (
              <div className="space-y-2">
                {myMonkeysDueOrOverdue.map((task) => {
                  const isOverdue = task.days_overdue > 0;
                  return (
                    <a
                      key={task.id}
                      href={task.permalink_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "block p-3 rounded-lg transition-colors bg-white/[0.03] hover:bg-white/[0.06]",
                        urgencyBorder(isOverdue ? "red" : "amber")
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
                              : "bg-accent-amber/15 text-accent-amber"
                          )}
                        >
                          {isOverdue ? `${task.days_overdue}d overdue` : "Due today"}
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
          </div>
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
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                {needsAttention.map((item) => (
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
                      <div className="flex items-center gap-2 shrink-0">
                        {sourceBadge(item.source)}
                        <span className="text-[10px] text-text-muted">
                          {item.timeAgo}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-text-muted mt-1 truncate pl-4">
                      {item.preview}
                    </p>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Delegated — Going Cold */}
          <div
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
          </div>
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
        )}
      </div>
    </div>
  );
}
