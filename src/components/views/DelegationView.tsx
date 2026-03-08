"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useTasks } from "@/hooks/useTasks";
import { useAsanaComments } from "@/hooks/useAsanaComments";
import { useSalesforce } from "@/hooks/useSalesforce";
import { useMonday } from "@/hooks/useMonday";
import { useEmails } from "@/hooks/useEmails";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Task } from "@/lib/types";

// ─── Constants ───────────────────────────────────────────────────────────────

const STALE_DAYS = 7;
const TODAY = new Date();

type SourceFilter = "all" | "asana" | "salesforce" | "monday" | "email";
type StatusFilter = "all" | "active" | "overdue" | "stale";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  return Math.floor((TODAY.getTime() - new Date(dateStr).getTime()) / 86400000);
}

function isStale(modifiedAt: string | null | undefined): boolean {
  const d = daysSince(modifiedAt);
  return d !== null && d >= STALE_DAYS;
}

function relativeTime(dateStr: string | null | undefined): string {
  const d = daysSince(dateStr);
  if (d === null) return "—";
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

function fmtDue(dueOn: string | null | undefined, daysOverdue: number): string {
  if (!dueOn) return "No date";
  if (daysOverdue > 0) return `${daysOverdue}d overdue`;
  const d = daysSince(dueOn);
  if (d !== null && d >= 0) return `${Math.abs(d)}d overdue`;
  const diff = Math.ceil((new Date(dueOn).getTime() - TODAY.getTime()) / 86400000);
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  return `Due in ${diff}d`;
}

function fmtAmount(n: number | null | undefined) {
  if (!n) return "—";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
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

function urgencyBorder(task: Task): string {
  if (task.days_overdue > 0) return "border-l-accent-red";
  const diff = task.due_on ? Math.ceil((new Date(task.due_on).getTime() - TODAY.getTime()) / 86400000) : 999;
  if (diff <= 3) return "border-l-accent-amber";
  if (diff <= 7) return "border-l-accent-teal";
  return "border-l-[var(--bg-card-border)]";
}

function dueBadgeColor(task: Task): string {
  if (task.days_overdue > 0) return "bg-accent-red/15 text-accent-red";
  const diff = task.due_on ? Math.ceil((new Date(task.due_on).getTime() - TODAY.getTime()) / 86400000) : 999;
  if (diff <= 3) return "bg-accent-amber/15 text-accent-amber";
  if (diff <= 7) return "bg-accent-teal/15 text-accent-teal";
  return "bg-white/10 text-text-muted";
}

// ─── Persisted dismiss/snooze state ──────────────────────────────────────────

interface DelegationPersistedState {
  dismissedIds: string[];
  snoozedUntil: Record<string, number>;
}

function loadPersistedState(key: string): DelegationPersistedState {
  if (typeof window === "undefined") return { dismissedIds: [], snoozedUntil: {} };
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { dismissedIds: [], snoozedUntil: {} };
    return JSON.parse(raw);
  } catch {
    return { dismissedIds: [], snoozedUntil: {} };
  }
}

function savePersistedState(key: string, state: DelegationPersistedState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(state));
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function KPICard({ label, value, color, delay }: { label: string; value: string | number; color: string; delay: string }) {
  return (
    <div className="glass-card anim-card p-4" style={{ animationDelay: delay }}>
      <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">{label}</div>
      <div className={cn("text-2xl font-bold tabular-nums", color)}>{value}</div>
    </div>
  );
}

function ActionChip({
  label,
  onClick,
  color = "default",
  href,
}: {
  label: string;
  onClick?: () => void;
  color?: "default" | "green" | "amber" | "red";
  href?: string;
}) {
  const styles = {
    default: "text-text-muted hover:text-text-body hover:bg-white/5",
    green: "text-accent-green/70 hover:bg-accent-green/10 hover:text-accent-green",
    amber: "text-accent-amber/70 hover:bg-accent-amber/10 hover:text-accent-amber",
    red: "text-accent-red/70 hover:bg-accent-red/10 hover:text-accent-red",
  };
  const cls = cn("rounded-md px-2 py-1 text-[10px] font-medium transition-colors cursor-pointer", styles[color]);

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {label}
      </a>
    );
  }
  return (
    <button onClick={onClick} className={cls}>
      {label}
    </button>
  );
}

function SectionHeader({
  icon,
  title,
  count,
  countColor = "bg-white/10 text-text-muted",
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  countColor?: string;
}) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold text-text-heading mb-4">
      {icon}
      {title}
      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", countColor)}>
        {count}
      </span>
    </h2>
  );
}

// ─── Gorilla item shape ──────────────────────────────────────────────────────

interface GorillaItem {
  id: string;
  name: string;
  source: "salesforce" | "monday";
  owner: string;
  status: string;
  amount: number | null;
  dueDate: string | null;
  lastActivity: string | null;
  url: string;
}

function gorillaStatusColor(status: string, source: "salesforce" | "monday"): string {
  if (source === "monday") {
    const s = status.toUpperCase();
    if (s.includes("DWG NEEDED") || s.includes("PO NEEDED") || s.includes("SALES ORDER NEEDED"))
      return "bg-accent-amber/15 text-accent-amber";
    if (s.includes("IN PRODUCTION")) return "bg-accent-teal/15 text-accent-teal";
    if (s === "COMPLETE") return "bg-accent-green/15 text-accent-green";
    return "bg-white/10 text-text-muted";
  }
  // Salesforce stages
  const base = status.replace(/ - PG$/, "");
  if (["Closed Won", "Forecasted", "Qualified"].includes(base)) return "bg-accent-green/15 text-accent-green";
  if (["Pending Order", "Design Review"].includes(base)) return "bg-accent-red/15 text-accent-red";
  if (["Quote Created", "Proposal", "Proof of Concept"].includes(base)) return "bg-accent-teal/15 text-accent-teal";
  if (["Discovery", "Rendering"].includes(base)) return "bg-accent-amber/15 text-accent-amber";
  return "bg-white/10 text-text-muted";
}

// ─── Input-needed item shape ─────────────────────────────────────────────────

interface InputNeededItem {
  id: string;
  title: string;
  source: "asana" | "email";
  preview: string;
  timeAgo: string;
  daysWaiting: number;
  url: string;
}

// ─── At-risk item shape ──────────────────────────────────────────────────────

interface AtRiskItem {
  id: string;
  name: string;
  source: "asana" | "salesforce" | "monday";
  reason: string;
  ageBadge: string;
  url: string;
}

// ─── Main View ───────────────────────────────────────────────────────────────

export function DelegationView() {
  const { user, isAri } = useAuth();
  const { tasks, loading: tasksLoading } = useTasks();
  const { comments: asanaComments, loading: commentsLoading } = useAsanaComments();
  const { opportunities, loading: sfLoading } = useSalesforce();
  const { orders, loading: mondayLoading } = useMonday(/* skip */ false);
  const { emails, loading: emailsLoading } = useEmails();

  const userEmail = user?.email?.toLowerCase() ?? "";
  const userName = user?.user_metadata?.full_name ?? "";

  // Persisted dismiss state
  const storageKey = `delegation-center:${userEmail}`;
  const [persisted, setPersisted] = useState<DelegationPersistedState>({ dismissedIds: [], snoozedUntil: {} });

  useEffect(() => {
    setPersisted(loadPersistedState(storageKey));
  }, [storageKey]);

  const dismiss = useCallback(
    (id: string) => {
      setPersisted((prev) => {
        const next = { ...prev, dismissedIds: [...prev.dismissedIds, id] };
        savePersistedState(storageKey, next);
        return next;
      });
    },
    [storageKey]
  );

  const snooze = useCallback(
    (id: string) => {
      setPersisted((prev) => {
        const next = { ...prev, snoozedUntil: { ...prev.snoozedUntil, [id]: Date.now() + 12 * 3600_000 } };
        savePersistedState(storageKey, next);
        return next;
      });
    },
    [storageKey]
  );

  const isDismissed = useCallback(
    (id: string) => persisted.dismissedIds.includes(id),
    [persisted.dismissedIds]
  );

  const isSnoozed = useCallback(
    (id: string) => (persisted.snoozedUntil[id] ?? 0) > Date.now(),
    [persisted.snoozedUntil]
  );

  // Filters
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [personFilter, setPersonFilter] = useState("");

  // User identity matching
  const isUserMatch = useCallback(
    (nameOrEmail: string | null | undefined): boolean => {
      if (!nameOrEmail || !userEmail) return false;
      const n = nameOrEmail.toLowerCase().trim();
      return n === userEmail || n === userName.toLowerCase();
    },
    [userEmail, userName]
  );

  // ─── Data classification ────────────────────────────────────────────────────

  const activeTasks = useMemo(
    () => tasks.filter((t) => !t.completed && !isDismissed(t.id) && !isSnoozed(t.id)),
    [tasks, isDismissed, isSnoozed]
  );

  const myMonkeys = useMemo(() => {
    let result = activeTasks.filter(
      (t) => isUserMatch(t.assignee_email) || isUserMatch(t.assignee_name ?? t.assignee)
    );
    if (sourceFilter !== "all" && sourceFilter !== "asana") result = [];
    if (statusFilter === "overdue") result = result.filter((t) => t.days_overdue > 0);
    if (statusFilter === "stale") result = result.filter((t) => isStale(t.modified_at));
    if (personFilter) result = result.filter((t) => t.assignee_name === personFilter || t.created_by_name === personFilter);
    return result.sort((a, b) => {
      if (a.days_overdue > 0 && b.days_overdue <= 0) return -1;
      if (b.days_overdue > 0 && a.days_overdue <= 0) return 1;
      if (a.days_overdue > 0 && b.days_overdue > 0) return b.days_overdue - a.days_overdue;
      return (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999");
    });
  }, [activeTasks, isUserMatch, sourceFilter, statusFilter, personFilter]);

  const delegatedMonkeys = useMemo(() => {
    let result = activeTasks.filter(
      (t) =>
        isUserMatch(t.created_by_email) &&
        !isUserMatch(t.assignee_email) &&
        !isUserMatch(t.assignee_name ?? t.assignee) &&
        (t.assignee_name || t.assignee)
    );
    if (sourceFilter !== "all" && sourceFilter !== "asana") result = [];
    if (statusFilter === "overdue") result = result.filter((t) => t.days_overdue > 0);
    if (statusFilter === "stale") result = result.filter((t) => isStale(t.modified_at));
    if (personFilter) result = result.filter((t) => t.assignee_name === personFilter);
    return result.sort((a, b) => {
      const aStale = daysSince(a.modified_at) ?? 0;
      const bStale = daysSince(b.modified_at) ?? 0;
      return bStale - aStale;
    });
  }, [activeTasks, isUserMatch, sourceFilter, statusFilter, personFilter]);

  const waitingBlocked = useMemo(() => {
    let result = activeTasks.filter((t) => {
      if (isUserMatch(t.assignee_email) || isUserMatch(t.assignee_name ?? t.assignee)) return false;
      if (isUserMatch(t.created_by_email)) return false;
      const isFollower =
        t.follower_names?.some((n) => isUserMatch(n)) ||
        t.follower_emails?.some((e) => isUserMatch(e));
      const isCollab =
        t.collaborator_names?.some((n) => isUserMatch(n)) ||
        t.collaborator_emails?.some((e) => isUserMatch(e));
      return (isFollower || isCollab) && isStale(t.modified_at);
    });
    if (sourceFilter !== "all" && sourceFilter !== "asana") result = [];
    if (personFilter) result = result.filter((t) => t.assignee_name === personFilter);
    return result.sort((a, b) => (daysSince(b.modified_at) ?? 0) - (daysSince(a.modified_at) ?? 0));
  }, [activeTasks, isUserMatch, sourceFilter, personFilter]);

  // Gorillas
  const gorillas = useMemo(() => {
    const items: GorillaItem[] = [];

    if (sourceFilter === "all" || sourceFilter === "salesforce") {
      for (const opp of opportunities) {
        if (opp.is_closed) continue;
        if (personFilter && opp.owner_name !== personFilter) continue;
        if (statusFilter === "stale" && !isStale(opp.last_activity_date)) continue;
        items.push({
          id: `sf-${opp.id}`,
          name: opp.name,
          source: "salesforce",
          owner: opp.owner_name,
          status: opp.stage,
          amount: opp.amount,
          dueDate: opp.close_date,
          lastActivity: opp.last_activity_date,
          url: opp.sf_url,
        });
      }
    }

    if (sourceFilter === "all" || sourceFilter === "monday") {
      for (const order of orders) {
        if (order.status.toUpperCase() === "COMPLETE") continue;
        if (personFilter && order.dealer !== personFilter) continue;
        items.push({
          id: `mon-${order.id}`,
          name: order.name,
          source: "monday",
          owner: order.dealer || order.location,
          status: order.status,
          amount: order.amount,
          dueDate: order.due_date,
          lastActivity: null,
          url: order.monday_url,
        });
      }
    }

    return items.sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
  }, [opportunities, orders, sourceFilter, statusFilter, personFilter]);

  // Needs my input
  const needsInput = useMemo(() => {
    const items: InputNeededItem[] = [];

    if (sourceFilter === "all" || sourceFilter === "asana") {
      for (const c of asanaComments) {
        if (
          (c.relevance_reason === "assignee" || c.relevance_reason === "collaborator") &&
          !isUserMatch(c.latest_commenter_name) &&
          !isUserMatch(c.latest_commenter_email)
        ) {
          const d = daysSince(c.latest_comment_at);
          items.push({
            id: `ac-${c.id}`,
            title: c.task_name,
            source: "asana",
            preview: c.latest_comment_text?.slice(0, 80) ?? "",
            timeAgo: relativeTime(c.latest_comment_at),
            daysWaiting: d ?? 0,
            url: c.permalink_url,
          });
        }
      }
    }

    if (sourceFilter === "all" || sourceFilter === "email") {
      for (const e of emails) {
        if (e.needs_reply && e.days_overdue > 0) {
          items.push({
            id: `em-${e.id}`,
            title: e.subject,
            source: "email",
            preview: `From ${e.from_name}`,
            timeAgo: relativeTime(e.received_at),
            daysWaiting: e.days_overdue,
            url: e.outlook_url,
          });
        }
      }
    }

    return items.sort((a, b) => b.daysWaiting - a.daysWaiting);
  }, [asanaComments, emails, isUserMatch, sourceFilter]);

  // At risk / aging
  const atRisk = useMemo(() => {
    const items: AtRiskItem[] = [];

    for (const t of myMonkeys) {
      if (t.days_overdue > 0 || isStale(t.modified_at)) {
        items.push({
          id: `risk-${t.id}`,
          name: t.name,
          source: "asana",
          reason: t.days_overdue > 0 ? "overdue" : "stale",
          ageBadge: t.days_overdue > 0 ? `${t.days_overdue}d overdue` : `${daysSince(t.modified_at)}d stale`,
          url: t.permalink_url,
        });
      }
    }

    for (const t of delegatedMonkeys) {
      if (t.days_overdue > 0 || isStale(t.modified_at)) {
        items.push({
          id: `risk-d-${t.id}`,
          name: t.name,
          source: "asana",
          reason: t.days_overdue > 0 ? "overdue" : "stale",
          ageBadge: t.days_overdue > 0 ? `${t.days_overdue}d overdue` : `${daysSince(t.modified_at)}d stale`,
          url: t.permalink_url,
        });
      }
    }

    for (const g of gorillas) {
      if (g.source === "salesforce" && g.lastActivity && isStale(g.lastActivity)) {
        items.push({
          id: `risk-${g.id}`,
          name: g.name,
          source: "salesforce",
          reason: "stale",
          ageBadge: `${daysSince(g.lastActivity)}d stale`,
          url: g.url,
        });
      }
    }

    return items;
  }, [myMonkeys, delegatedMonkeys, gorillas]);

  // Unique people for person filter
  const allPeople = useMemo(() => {
    const names = new Set<string>();
    for (const t of tasks) {
      if (t.assignee_name) names.add(t.assignee_name);
      if (t.created_by_name) names.add(t.created_by_name);
    }
    for (const o of opportunities) {
      if (o.owner_name) names.add(o.owner_name);
    }
    return Array.from(names).sort();
  }, [tasks, opportunities]);

  // Source counts for filter pills
  const sourceCounts = useMemo(
    () => ({
      asana: tasks.filter((t) => !t.completed).length,
      salesforce: opportunities.filter((o) => !o.is_closed).length,
      monday: orders.filter((o) => o.status.toUpperCase() !== "COMPLETE").length,
      email: emails.filter((e) => e.needs_reply && e.days_overdue > 0).length,
    }),
    [tasks, opportunities, orders, emails]
  );

  const loading = tasksLoading || commentsLoading || sfLoading || mondayLoading || emailsLoading;

  // ─── Gate behind isAri ──────────────────────────────────────────────────────

  if (!isAri) {
    return (
      <div className="glass-card p-10 text-center">
        <p className="text-text-muted text-sm">This view is not available for your account.</p>
      </div>
    );
  }

  // ─── Icons ──────────────────────────────────────────────────────────────────

  const MonkeyIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  );

  const DelegatedIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 3h5v5" /><path d="M21 3l-7 7" /><circle cx="12" cy="16" r="4" />
    </svg>
  );

  const GorillaIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5Z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
    </svg>
  );

  const AlertIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );

  const WaitingIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );

  const InputIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* ── Filter Bar ──────────────────────────────────────────────────────── */}
      <div className="glass-card anim-card p-4 flex flex-wrap items-center gap-3" style={{ animationDelay: "80ms" }}>
        {/* Source pills */}
        <div className="flex items-center gap-1">
          {(
            [
              { id: "all" as SourceFilter, label: "All" },
              { id: "asana" as SourceFilter, label: "Asana" },
              { id: "salesforce" as SourceFilter, label: "Salesforce" },
              { id: "monday" as SourceFilter, label: "Monday" },
              { id: "email" as SourceFilter, label: "Email" },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer",
                sourceFilter === id
                  ? "bg-accent-amber/15 text-accent-amber"
                  : "bg-white/5 text-text-muted hover:text-text-body"
              )}
              onClick={() => setSourceFilter(id)}
            >
              {label}
              {id !== "all" && sourceCounts[id] > 0 && (
                <span className="ml-1 text-[10px] opacity-70">({sourceCounts[id]})</span>
              )}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-white/10" />

        {/* Status pills */}
        <div className="flex items-center gap-1">
          {(
            [
              { id: "all" as StatusFilter, label: "All" },
              { id: "active" as StatusFilter, label: "Active" },
              { id: "overdue" as StatusFilter, label: "Overdue" },
              { id: "stale" as StatusFilter, label: "Stale" },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer",
                statusFilter === id
                  ? "bg-accent-teal/15 text-accent-teal"
                  : "bg-white/5 text-text-muted hover:text-text-body"
              )}
              onClick={() => setStatusFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-white/10" />

        {/* Person dropdown */}
        <select
          value={personFilter}
          onChange={(e) => setPersonFilter(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-text-body focus:border-accent-amber/50 focus:outline-none"
        >
          <option value="">All People</option>
          {allPeople.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {/* ── KPI Row ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="My Monkeys" value={myMonkeys.length} color="text-accent-amber" delay="160ms" />
        <KPICard label="Delegated Out" value={delegatedMonkeys.length} color="text-accent-teal" delay="240ms" />
        <KPICard label="Gorillas Active" value={gorillas.length} color="text-[#5BB5F5]" delay="320ms" />
        <KPICard label="At Risk" value={atRisk.length} color="text-accent-red" delay="400ms" />
      </div>

      {/* ── Main Grid ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5">
        {/* ── Left Column ───────────────────────────────────────────────────── */}
        <div className="space-y-5">
          {/* My Monkeys */}
          <section className="glass-card anim-card p-5" style={{ animationDelay: "480ms" }}>
            <SectionHeader icon={MonkeyIcon} title="My Monkeys" count={myMonkeys.length} countColor="bg-accent-amber/15 text-accent-amber" />
            {loading && myMonkeys.length === 0 && <SkeletonRows />}
            {!loading && myMonkeys.length === 0 && <EmptyState />}
            <div className="space-y-0 divide-y divide-[var(--bg-card-border)]">
              {myMonkeys.map((task) => (
                <div key={task.id} className={cn("flex items-start gap-3 py-3 border-l-4 pl-3", urgencyBorder(task))}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <a
                        className="text-sm font-medium text-text-heading hover:text-accent-amber transition-colors truncate"
                        href={task.permalink_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {task.name}
                      </a>
                      {task.project_name && (
                        <span className="text-[10px] bg-white/5 text-text-muted px-1.5 py-0.5 rounded shrink-0">
                          {task.project_name}
                        </span>
                      )}
                    </div>
                    {task.notes && (
                      <p className="text-xs text-text-muted/80 mt-0.5 line-clamp-1">{task.notes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", dueBadgeColor(task))}>
                      {fmtDue(task.due_on, task.days_overdue)}
                    </span>
                    <ActionChip label="Done" color="green" onClick={() => dismiss(task.id)} />
                    <ActionChip label="Snooze" color="amber" onClick={() => snooze(task.id)} />
                    <ActionChip label="Open" href={task.permalink_url} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Delegated Monkeys */}
          <section className="glass-card anim-card p-5" style={{ animationDelay: "560ms" }}>
            <SectionHeader icon={DelegatedIcon} title="Delegated Monkeys" count={delegatedMonkeys.length} countColor="bg-accent-teal/15 text-accent-teal" />
            {loading && delegatedMonkeys.length === 0 && <SkeletonRows />}
            {!loading && delegatedMonkeys.length === 0 && <EmptyState />}
            <div className="space-y-0 divide-y divide-[var(--bg-card-border)]">
              {delegatedMonkeys.map((task) => {
                const staleD = daysSince(task.modified_at);
                const taskStale = isStale(task.modified_at);
                const statusLabel = task.days_overdue > 0 ? "Overdue" : taskStale ? "Waiting" : "Active";
                const statusBadge =
                  task.days_overdue > 0
                    ? "bg-accent-red/15 text-accent-red"
                    : taskStale
                    ? "bg-accent-amber/15 text-accent-amber"
                    : "bg-accent-teal/15 text-accent-teal";

                return (
                  <div key={task.id} className="flex items-center gap-3 py-3">
                    <div
                      className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-text-muted shrink-0"
                      title={task.assignee_name ?? task.assignee}
                    >
                      {initials(task.assignee_name ?? task.assignee)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <a
                        className="text-sm font-medium text-text-heading hover:text-accent-amber transition-colors truncate block"
                        href={task.permalink_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {task.name}
                      </a>
                      <div className="text-xs text-text-muted mt-0.5">
                        {task.assignee_name ?? task.assignee}
                        {staleD !== null && <span className="ml-2 opacity-70">{relativeTime(task.modified_at)}</span>}
                      </div>
                    </div>
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0", statusBadge)}>
                      {statusLabel}
                    </span>
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0", dueBadgeColor(task))}>
                      {fmtDue(task.due_on, task.days_overdue)}
                    </span>
                    <ActionChip label="Nudge" color="amber" href={task.permalink_url} />
                    <ActionChip label="Open" href={task.permalink_url} />
                  </div>
                );
              })}
            </div>
          </section>

          {/* Gorillas in Flight */}
          <section className="glass-card anim-card p-5" style={{ animationDelay: "640ms" }}>
            <SectionHeader icon={GorillaIcon} title="Gorillas in Flight" count={gorillas.length} countColor="bg-[rgba(91,181,245,0.15)] text-[#5BB5F5]" />
            {loading && gorillas.length === 0 && <SkeletonRows />}
            {!loading && gorillas.length === 0 && <EmptyState />}
            <div className="space-y-0 divide-y divide-[var(--bg-card-border)]">
              {gorillas.map((g) => (
                <div key={g.id} className="flex items-center gap-3 py-3">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide shrink-0",
                      g.source === "salesforce" ? "tag-salesforce" : "bg-[rgba(255,0,110,0.12)] text-[#ff006e]"
                    )}
                  >
                    {g.source === "salesforce" ? "SF" : "MON"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <a
                      className="text-sm font-medium text-text-heading hover:text-accent-amber transition-colors truncate block"
                      href={g.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {g.name}
                    </a>
                    <div className="text-xs text-text-muted mt-0.5">
                      {g.owner}
                      {g.lastActivity && <span className="ml-2 opacity-70">{relativeTime(g.lastActivity)}</span>}
                    </div>
                  </div>
                  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0", gorillaStatusColor(g.status, g.source))}>
                    {g.status}
                  </span>
                  <span className="text-sm font-semibold text-text-heading tabular-nums shrink-0">
                    {fmtAmount(g.amount)}
                  </span>
                  <ActionChip label="Open" href={g.url} />
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ── Right Column (Sidebar) ────────────────────────────────────────── */}
        <div className="space-y-5">
          {/* Needs My Input */}
          <section className="glass-card anim-card p-5" style={{ animationDelay: "480ms" }}>
            <SectionHeader icon={InputIcon} title="Needs My Input" count={needsInput.length} countColor="bg-accent-red/15 text-accent-red" />
            {loading && needsInput.length === 0 && <SkeletonRows count={3} />}
            {!loading && needsInput.length === 0 && <EmptyState />}
            <div className="space-y-0 divide-y divide-[var(--bg-card-border)]">
              {needsInput.slice(0, 10).map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "py-3 border-l-4 pl-3",
                    item.daysWaiting >= 3 ? "border-l-accent-red" : "border-l-accent-amber"
                  )}
                >
                  <div className="flex items-center gap-2 justify-between">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide shrink-0",
                          item.source === "asana" ? "tag-asana" : "tag-email"
                        )}
                      >
                        {item.source}
                      </span>
                      <a
                        className="text-sm font-medium text-text-heading hover:text-accent-amber transition-colors truncate"
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {item.title}
                      </a>
                    </div>
                    <span className="text-[10px] text-text-muted shrink-0">{item.timeAgo}</span>
                  </div>
                  {item.preview && (
                    <p className="text-xs text-text-muted/70 mt-1 line-clamp-1 ml-[calc(0.375rem+1px)]">
                      {item.preview}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Waiting / Blocked */}
          <section className="glass-card anim-card p-5" style={{ animationDelay: "560ms" }}>
            <SectionHeader icon={WaitingIcon} title="Waiting / Blocked" count={waitingBlocked.length} countColor="bg-accent-amber/15 text-accent-amber" />
            {loading && waitingBlocked.length === 0 && <SkeletonRows count={3} />}
            {!loading && waitingBlocked.length === 0 && <EmptyState />}
            <div className="space-y-0 divide-y divide-[var(--bg-card-border)]">
              {waitingBlocked.slice(0, 10).map((task) => (
                <div key={task.id} className="flex items-center gap-3 py-2.5">
                  <div
                    className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-[9px] font-bold text-text-muted shrink-0"
                    title={task.assignee_name ?? task.assignee}
                  >
                    {initials(task.assignee_name ?? task.assignee)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <a
                      className="text-xs font-medium text-text-heading hover:text-accent-amber transition-colors truncate block"
                      href={task.permalink_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {task.name}
                    </a>
                    <div className="text-[10px] text-text-muted mt-0.5">
                      {task.assignee_name ?? task.assignee} &middot; {relativeTime(task.modified_at)}
                    </div>
                  </div>
                  <ActionChip label="Open" href={task.permalink_url} />
                </div>
              ))}
            </div>
          </section>

          {/* At Risk / Aging */}
          <section className="glass-card anim-card p-5" style={{ animationDelay: "640ms" }}>
            <SectionHeader icon={AlertIcon} title="At Risk / Aging" count={atRisk.length} countColor="bg-accent-red/15 text-accent-red" />
            {!loading && atRisk.length === 0 && <EmptyState />}
            <div className="space-y-0 divide-y divide-[var(--bg-card-border)]">
              {atRisk.slice(0, 12).map((item) => (
                <div key={item.id} className="flex items-center gap-3 py-2.5">
                  <div className="w-2 h-2 rounded-full bg-accent-red shrink-0" />
                  <a
                    className="text-xs font-medium text-text-heading hover:text-accent-amber transition-colors truncate flex-1 min-w-0"
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {item.name}
                  </a>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide shrink-0",
                      item.source === "salesforce" ? "tag-salesforce" : item.source === "monday" ? "bg-[rgba(255,0,110,0.12)] text-[#ff006e]" : "tag-asana"
                    )}
                  >
                    {item.source === "salesforce" ? "SF" : item.source === "monday" ? "MON" : "Asana"}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-accent-red/15 text-accent-red px-2 py-0.5 text-[10px] font-medium shrink-0">
                    {item.ageBadge}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* King Kong Placeholder */}
          <section className="glass-card anim-card p-5 border-l-4 border-l-accent-amber/40" style={{ animationDelay: "720ms" }}>
            <h2 className="text-sm font-semibold text-text-heading mb-2 flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l3 7h7l-5.5 4.5 2 7L12 16l-6.5 4.5 2-7L2 9h7z" />
              </svg>
              King Kong &mdash; Company OKRs
            </h2>
            <p className="text-xs text-text-muted mb-3">
              Company-level objectives will appear here once connected.
            </p>
            <div className="space-y-2">
              {[
                { label: "Revenue Growth", pct: 30 },
                { label: "Product Launch", pct: 45 },
                { label: "Market Expansion", pct: 60 },
                { label: "Team Scale", pct: 75 },
              ].map((okr) => (
                <div key={okr.label} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                  <div className="w-2 h-2 rounded-full bg-accent-amber/30 shrink-0" />
                  <span className="text-xs text-text-muted flex-1">{okr.label}</span>
                  <div className="w-16 h-1.5 rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-accent-amber/20"
                      style={{ width: `${okr.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 animate-pulse">
          <div className="h-4 w-4 rounded-full bg-white/5" />
          <div className="h-3 flex-1 rounded bg-white/5" />
          <div className="h-3 w-16 rounded bg-white/5" />
        </div>
      ))}
    </div>
  );
}
