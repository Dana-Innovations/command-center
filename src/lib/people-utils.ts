import type { Person, TouchpointItem } from "@/hooks/usePeople";
import type { AttentionPersonPreference } from "@/lib/attention/people";
import type { SalesforceOpportunity } from "@/lib/types";
import type { PersonDetailResponse } from "@/hooks/usePersonDetail";

// ── Types ─────────────────────────────────────────────────────────────────

export type Heat = "hot" | "warm" | "cold";
export type SourceFilter = "all" | "email" | "meeting" | "asana" | "salesforce";

export interface UnifiedContact extends Person {
  heat: Heat;
  heatDays: number;
  openItemCount: number;
  lastChannel: TouchpointItem["ch"] | null;
  lastInteractionDate: string | null;
  relatedOpps: SalesforceOpportunity[];
  attentionPreference: AttentionPersonPreference | null;
}

// ── Styling Constants ─────────────────────────────────────────────────────

export const HEAT_CONFIG: Record<
  Heat,
  { label: string; color: string; bg: string; dot: string; border: string }
> = {
  hot: {
    label: "Hot",
    color: "text-accent-green",
    bg: "bg-accent-green/15",
    dot: "bg-accent-green",
    border: "border-l-accent-green",
  },
  warm: {
    label: "Warm",
    color: "text-accent-amber",
    bg: "bg-accent-amber/15",
    dot: "bg-accent-amber",
    border: "border-l-accent-amber",
  },
  cold: {
    label: "Cold",
    color: "text-accent-red",
    bg: "bg-accent-red/15",
    dot: "bg-accent-red",
    border: "border-l-accent-red",
  },
};

export const URGENCY_BORDERS: Record<string, string> = {
  red: "border-l-4 border-l-accent-red",
  amber: "border-l-4 border-l-accent-amber",
  teal: "border-l-4 border-l-accent-teal",
  gray: "border-l-4 border-l-[#555]",
};

export const URGENCY_AVATAR_BG: Record<string, string> = {
  red: "bg-accent-red/20 text-accent-red ring-accent-red/30",
  amber: "bg-accent-amber/20 text-accent-amber ring-accent-amber/30",
  teal: "bg-accent-teal/20 text-accent-teal ring-accent-teal/30",
  gray: "bg-white/10 text-text-muted ring-white/10",
};

export const URGENCY_BAR_COLOR: Record<string, string> = {
  red: "bg-accent-red",
  amber: "bg-accent-amber",
  teal: "bg-accent-teal",
  gray: "bg-white/20",
};

export const TIER_CONFIG = [
  { key: "red" as const, label: "Needs Action Now", color: "text-accent-red" },
  { key: "amber" as const, label: "Follow Up", color: "text-accent-amber" },
  { key: "teal" as const, label: "Monitor", color: "text-accent-teal" },
  { key: "gray" as const, label: "Low Priority", color: "text-text-muted" },
];

export const CH_COLORS: Record<string, string> = {
  email: "tag-email",
  teams: "tag-teams",
  asana: "tag-asana",
  slack: "tag-slack",
  meeting: "bg-purple-500/15 text-purple-400",
};

export const CH_ICONS: Record<string, string> = {
  email: "\u2709",
  teams: "\uD83D\uDCAC",
  asana: "\u2713",
  slack: "#",
  meeting: "\uD83D\uDCC5",
};

export const CH_LABELS: Record<string, string> = {
  email: "Email",
  teams: "Teams",
  asana: "Asana",
  slack: "Slack",
  meeting: "Meeting",
};

// ── Helper Functions ──────────────────────────────────────────────────────

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2)
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) {
    const mins = Math.floor(-diff / 60000);
    if (mins < 60) return `in ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `in ${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `in ${days}d`;
  }
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function formatDaysAgo(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function computeHeat(
  lastContactMs: number,
  now: number
): { heat: Heat; days: number } {
  if (lastContactMs === 0) return { heat: "cold", days: 999 };
  const days = Math.floor((now - lastContactMs) / 86400000);
  if (days <= 7) return { heat: "hot", days };
  if (days <= 30) return { heat: "warm", days };
  return { heat: "cold", days };
}

export function matchesOpp(
  person: Person,
  opp: SalesforceOpportunity
): boolean {
  const pName = person.name.toLowerCase();
  const accName = (opp.account_name || "").toLowerCase();
  const ownerName = (opp.owner_name || "").toLowerCase();
  const pFirst = pName.split(" ")[0];
  if (
    pFirst.length > 2 &&
    (accName.includes(pFirst) || ownerName.includes(pFirst))
  )
    return true;
  if (accName && pName.includes(accName.split(" ")[0])) return true;
  return false;
}

export function computeRelationshipStrength(detail: PersonDetailResponse): {
  score: number;
  label: string;
  color: string;
} {
  const raw =
    detail.stats.totalEmails * 2 +
    detail.stats.totalMeetings * 3 +
    detail.chats.length +
    detail.slackMessages.length +
    detail.tasks.length;
  const score = Math.min(100, raw);
  if (score >= 70) return { score, label: "Strong", color: "bg-accent-green" };
  if (score >= 40) return { score, label: "Active", color: "bg-accent-amber" };
  if (score >= 10) return { score, label: "Light", color: "bg-accent-teal" };
  return { score, label: "New", color: "bg-white/20" };
}
