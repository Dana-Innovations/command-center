"use client";

import { Fragment, type ReactNode, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { ExternalLinkIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/EmptyState";
import { AttentionFeedbackControl } from "@/components/ui/AttentionFeedbackControl";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/useAuth";
import { useEmails } from "@/hooks/useEmails";
import { useChats } from "@/hooks/useChats";
import { useSlackFeed } from "@/hooks/useSlackFeed";
import { useAsanaComments } from "@/hooks/useAsanaComments";
import { useAttention } from "@/lib/attention/client";
import { useLiveData } from "@/lib/live-data-context";
import type { EmailDetail } from "@/lib/email-reply";
import type { AsanaCommentEntry, AsanaThreadDetail, Task } from "@/lib/types";
import {
  buildOutlookComposeUrl,
  buildReplyQueue,
  createDefaultReplyPriorityPreferences,
  formatPriorityWeight,
  formatRelativeTime,
  groupByThread,
  hasCustomizedReplyPriorityPreferences,
  mergeReplyPriorityPreferences,
  REPLY_PRIORITY_FACTOR_CONTROLS,
  REPLY_PRIORITY_SOURCE_CONTROLS,
  type ReplyPriorityFactorKey,
  type ReplyPriorityPreferences,
  type ReplyQueueItem,
  type ReplySource,
  type ThreadedItem,
} from "@/lib/reply-center";

type FilterId = "all" | ReplySource;
type ComposerMode = "draft" | "ai";

interface StoredReplyState {
  dismissedIds: string[];
  snoozedUntil: Record<string, number>;
  preferences: ReplyPriorityPreferences;
}

const FILTER_LABELS: Record<FilterId, string> = {
  all: "All",
  email: "Email",
  teams: "Teams",
  slack_context: "Slack",
  asana_comment: "Comments",
};

const SOURCE_BADGES: Record<ReplySource, string> = {
  email: "Outlook",
  teams: "Teams",
  slack_context: "Slack",
  asana_comment: "Asana",
};

const SOURCE_STYLES: Record<ReplySource, string> = {
  email: "tag-email",
  teams: "tag-teams",
  slack_context: "tag-slack",
  asana_comment: "tag-asana",
};

type CommsTier = "act-now" | "follow-up" | "aware";

function assignCommsTier(score: number, timestamp: string): CommsTier {
  if (score >= 70) return "act-now";
  if (score >= 45) return "follow-up";
  const ageMs = Date.now() - new Date(timestamp).getTime();
  if (ageMs > 24 * 60 * 60 * 1000) return "follow-up";
  return "aware";
}

function tierAgingLabel(timestamp: string): string | null {
  const ageDays = Math.floor((Date.now() - new Date(timestamp).getTime()) / 86400000);
  if (ageDays <= 0) return null;
  return ageDays === 1 ? "aging 1 day" : `aging ${ageDays} days`;
}

const TIER_CONFIG = {
  "act-now": { label: "Act Now", colorClass: "text-accent-amber", borderRgb: "212, 164, 76" },
  "follow-up": { label: "Follow Up", colorClass: "text-accent-teal", borderRgb: "0, 178, 169" },
  "aware": { label: "Stay Aware", colorClass: "text-text-muted", borderRgb: "255, 255, 255" },
} as const;

const QUICK_PROMPTS: Record<
  Exclude<ReplySource, "slack_context">,
  Array<{ id: string; label: string; prompt: string }>
> = {
  email: [
    {
      id: "ack",
      label: "Acknowledge",
      prompt:
        "Acknowledge the message, confirm I saw it, and keep the reply concise.",
    },
    {
      id: "next",
      label: "Next steps",
      prompt:
        "Reply with crisp next steps, ownership, and timing. Keep it direct.",
    },
    {
      id: "context",
      label: "Need context",
      prompt:
        "Reply with the minimum clarifying questions needed to move this forward.",
    },
    {
      id: "decline",
      label: "Decline",
      prompt:
        "Reply graciously, decline clearly, and avoid over-explaining.",
    },
  ],
  teams: [
    {
      id: "ack",
      label: "Acknowledge",
      prompt:
        "Write a concise Teams reply acknowledging the message and confirming I saw it.",
    },
    {
      id: "next",
      label: "Move it forward",
      prompt:
        "Write a short Teams reply that proposes the next step and a clear owner.",
    },
    {
      id: "context",
      label: "Clarify",
      prompt:
        "Write a short Teams reply asking for only the context needed to move this forward.",
    },
  ],
  asana_comment: [
    {
      id: "ack",
      label: "Acknowledge",
      prompt:
        "Draft a short Asana comment acknowledging the update and confirming I saw it.",
    },
    {
      id: "status",
      label: "Status check",
      prompt:
        "Draft a concise Asana comment asking for the current status and any blocker.",
    },
    {
      id: "next",
      label: "Next step",
      prompt:
        "Draft a concise Asana comment that aligns on the next step and who owns it.",
    },
  ],
};

const EMPTY_REPLY_STATE: StoredReplyState = {
  dismissedIds: [],
  snoozedUntil: {},
  preferences: createDefaultReplyPriorityPreferences(),
};

const SNOOZE_MS = 12 * 60 * 60 * 1000;

function parseStoredState(raw: string | null): StoredReplyState {
  if (!raw) return EMPTY_REPLY_STATE;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredReplyState>;
    return {
      dismissedIds: Array.isArray(parsed.dismissedIds)
        ? parsed.dismissedIds
        : [],
      snoozedUntil:
        parsed.snoozedUntil && typeof parsed.snoozedUntil === "object"
          ? parsed.snoozedUntil
          : {},
      preferences: mergeReplyPriorityPreferences(parsed.preferences),
    };
  } catch {
    return EMPTY_REPLY_STATE;
  }
}

function pruneSnoozes(snoozedUntil: Record<string, number>) {
  const now = Date.now();
  return Object.fromEntries(
    Object.entries(snoozedUntil).filter(([, until]) => until > now)
  );
}

function titleCaseTag(tag: string) {
  return tag
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildSlackSummary(item: ReplyQueueItem) {
  const tagSummary =
    item.tags.length > 0 ? item.tags.join(" · ") : "No engagement metadata";
  return `Slack context from ${item.sender}. ${
    item.summary || "Open in Slack to review the thread."
  } ${tagSummary}.`;
}

function handoffLabel(item: ReplyQueueItem, hasDraft: boolean) {
  if (item.source === "email") {
    return hasDraft ? "Open draft in Outlook" : "Reply in Outlook";
  }
  if (item.source === "teams") return "Open in Teams";
  if (item.source === "slack_context") return "Open in Slack";
  return "Open in Asana";
}

function formatRecipientList(values: string[]) {
  return values.join(", ");
}

function buildPriorityReasonLine(item: ReplyQueueItem) {
  return item.priorityReasons.join(" · ");
}

function buildScoreBreakdownLine(item: ReplyQueueItem) {
  return item.scoreBreakdown
    .slice(0, 4)
    .map((entry) => `${entry.label} +${entry.points}`)
    .join(" · ");
}

function formatAbsoluteDateTime(value: string) {
  if (!value) return "";

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });
}

function formatDueLabel(value: string | null | undefined) {
  if (!value) return "No due date";

  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const dueDate = new Date(dateOnly ? `${value}T00:00:00` : value);
  if (Number.isNaN(dueDate.getTime())) {
    return "No due date";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dueDate);
  target.setHours(0, 0, 0, 0);

  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays < 0) {
    return diffDays === -1 ? "Overdue by 1 day" : `Overdue by ${Math.abs(diffDays)} days`;
  }
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Due tomorrow";

  return `Due ${dueDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  })}`;
}

function splitUrlFromTrail(value: string) {
  let url = value;
  let trail = "";

  while (url && /[).,!?;:]$/.test(url)) {
    trail = `${url.slice(-1)}${trail}`;
    url = url.slice(0, -1);
  }

  return { url, trail };
}

function renderLinkedLine(value: string, keyPrefix: string) {
  const pattern = /(https?:\/\/[^\s<]+)/g;
  const matches = Array.from(value.matchAll(pattern));

  if (matches.length === 0) {
    return value;
  }

  let cursor = 0;
  const nodes: ReactNode[] = [];

  matches.forEach((match, index) => {
    const raw = match[0];
    const start = match.index ?? 0;

    if (start > cursor) {
      nodes.push(value.slice(cursor, start));
    }

    const { url, trail } = splitUrlFromTrail(raw);
    nodes.push(
      <Fragment key={`${keyPrefix}-url-${index}`}>
        <a
          className="hot-link break-all text-accent-amber"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {url}
        </a>
        {trail}
      </Fragment>
    );

    cursor = start + raw.length;
  });

  if (cursor < value.length) {
    nodes.push(value.slice(cursor));
  }

  return nodes;
}

function renderFormattedText(
  value: string | null | undefined,
  keyPrefix: string,
  paragraphClassName = "text-sm leading-6 text-text-body"
) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return (
      <p className="text-sm text-text-muted">No additional context yet.</p>
    );
  }

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return paragraphs.map((paragraph, paragraphIndex) => {
    const lines = paragraph.split("\n").filter(Boolean);

    return (
      <p
        key={`${keyPrefix}-paragraph-${paragraphIndex}`}
        className={paragraphClassName}
      >
        {lines.map((line, lineIndex) => (
          <Fragment key={`${keyPrefix}-line-${paragraphIndex}-${lineIndex}`}>
            {renderLinkedLine(line, `${keyPrefix}-${paragraphIndex}-${lineIndex}`)}
            {lineIndex < lines.length - 1 ? <br /> : null}
          </Fragment>
        ))}
      </p>
    );
  });
}

function mergeRecentComments(
  current: AsanaCommentEntry[],
  next: AsanaCommentEntry
) {
  const merged = new Map<string, AsanaCommentEntry>();

  for (const comment of current) {
    merged.set(comment.id, comment);
  }
  merged.set(next.id, next);

  return Array.from(merged.values())
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    .slice(-5);
}

function buildAsanaHydratedDetail(item: ReplyQueueItem, task: Task | null) {
  const notes = task?.notes?.trim() || "";
  const fallbackComment = item.message?.trim() || item.summary.trim();

  return {
    task_gid: item.taskGid || item.id,
    task_name: task?.name || item.title,
    task_due_on: task?.due_on || item.taskDueOn || null,
    project_gid: task?.project_gid || item.projectGid || null,
    project_name: task?.project_name || item.projectName || "Tasks",
    permalink_url: task?.permalink_url || item.url,
    completed: Boolean(task?.completed),
    notes,
    assignee_name: task?.assignee_name || null,
    assignee_email: task?.assignee_email || null,
    recent_comments: fallbackComment
      ? [
          {
            id: `${item.id}:latest`,
            text: fallbackComment,
            created_at: item.timestamp,
            author_name: item.sender || "Asana",
            author_email: item.senderEmail || null,
          },
        ]
      : [],
    synced_at: task?.synced_at || item.timestamp,
  } satisfies AsanaThreadDetail;
}

function buildAsanaDraftContext(
  item: ReplyQueueItem,
  detail: AsanaThreadDetail | null
) {
  const source = detail;
  const parts = [
    `Task: ${source?.task_name || item.title}`,
    source?.project_name ? `Project: ${source.project_name}` : "",
    source?.assignee_name ? `Assignee: ${source.assignee_name}` : "",
    source?.task_due_on ? formatDueLabel(source.task_due_on) : "",
    source?.notes ? `Task notes:\n${source.notes}` : "",
    source?.recent_comments?.length
      ? [
          "Recent comments:",
          ...source.recent_comments.map(
            (comment) =>
              `${comment.author_name} (${formatAbsoluteDateTime(comment.created_at)}): ${comment.text}`
          ),
        ].join("\n\n")
      : "",
  ].filter(Boolean);

  return parts.join("\n\n");
}

function ScoreBadge({ score }: { score: number }) {
  const styles =
    score >= 80
      ? "border-red-400/25 bg-red-400/10 text-red-200"
      : score >= 65
        ? "border-accent-amber/25 bg-accent-amber/10 text-accent-amber"
        : "border-teal-400/25 bg-teal-400/10 text-teal-200";

  return (
    <div
      className={cn(
        "flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-2xl border text-center",
        styles
      )}
    >
      <span className="text-[9px] uppercase tracking-[0.24em] opacity-70">Pri</span>
      <span className="text-sm font-semibold tabular-nums">{score}</span>
    </div>
  );
}

function buildPriorityPills(item: ReplyQueueItem) {
  const pills: Array<{ label: string; className: string }> = [];

  if (item.unread) {
    pills.push({
      label: "Unread",
      className: "border-accent-amber/20 bg-accent-amber/10 text-accent-amber",
    });
  }
  if (item.prioritySignals.urgent) {
    pills.push({
      label: "Urgent",
      className: "border-red-400/20 bg-red-400/10 text-red-200",
    });
  }
  if (item.prioritySignals.legal) {
    pills.push({
      label: "Legal",
      className: "border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-200",
    });
  }
  if (item.prioritySignals.financial) {
    pills.push({
      label: "Financial",
      className: "border-accent-amber/20 bg-accent-amber/10 text-accent-amber",
    });
  }
  if (item.prioritySignals.multiplePeopleWaiting) {
    pills.push({
      label: "Team thread",
      className: "border-sky-400/20 bg-sky-400/10 text-sky-200",
    });
  }
  if (item.prioritySignals.aging) {
    pills.push({
      label: "Aging",
      className: "border-red-400/20 bg-red-400/10 text-red-200",
    });
  }

  return pills.slice(0, 4);
}

function WeightSlider({
  id,
  label,
  description,
  value,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="grid gap-2 rounded-2xl border border-[var(--bg-card-border)] bg-black/10 p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-heading">
            {label}
          </div>
          <div className="mt-1 text-[11px] leading-relaxed text-text-muted">
            {description}
          </div>
        </div>
        <div className="rounded-full border border-accent-amber/20 bg-accent-amber/10 px-2.5 py-1 text-[11px] font-medium text-accent-amber">
          {formatPriorityWeight(value)}
        </div>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={2}
        step={0.05}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[var(--accent-amber)]"
      />
    </label>
  );
}

export function ReplyCenter() {
  const { emails, loading: emailsLoading } = useEmails();
  const { chats, loading: chatsLoading } = useChats();
  const { messages: slackMessages, loading: slackLoading } = useSlackFeed();
  const { comments: asanaComments, loading: asanaLoading } = useAsanaComments();
  const { tasks, refetch: refetchLiveData } = useLiveData();
  const { user } = useAuth();
  const { applyTarget, replyPreferences, updateReplyPreferences } = useAttention();
  const { addToast } = useToast();

  const loading = emailsLoading || chatsLoading || slackLoading || asanaLoading;

  const currentUserName = user?.user_metadata?.full_name ?? "";
  const currentUserEmail = user?.email ?? "";
  const storageKey = useMemo(() => {
    const identity = (currentUserEmail || currentUserName).trim().toLowerCase();
    return identity ? `reply-center:${identity}` : null;
  }, [currentUserEmail, currentUserName]);

  const [threaded, setThreaded] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterId>("all");
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [snoozedUntil, setSnoozedUntil] = useState<Record<string, number>>({});
  const [preferences, setPreferences] = useState<ReplyPriorityPreferences>(
    createDefaultReplyPriorityPreferences
  );
  const [preferencesDirty, setPreferencesDirty] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedThreadKey, setExpandedThreadKey] = useState<string | null>(null);
  const [selectedAsanaId, setSelectedAsanaId] = useState<string | null>(null);
  const [composerState, setComposerState] = useState<{
    itemId: string;
    mode: ComposerMode;
  } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [promptTexts, setPromptTexts] = useState<Record<string, string>>({});
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [emailDetails, setEmailDetails] = useState<Record<string, EmailDetail>>(
    {}
  );
  const [emailDetailLoading, setEmailDetailLoading] = useState<
    Record<string, boolean>
  >({});
  const [emailDetailErrors, setEmailDetailErrors] = useState<
    Record<string, string>
  >({});
  const [asanaDetails, setAsanaDetails] = useState<
    Record<string, AsanaThreadDetail>
  >({});
  const [asanaDetailLoading, setAsanaDetailLoading] = useState<
    Record<string, boolean>
  >({});
  const [asanaDetailErrors, setAsanaDetailErrors] = useState<
    Record<string, string>
  >({});
  const [postingAsanaId, setPostingAsanaId] = useState<string | null>(null);

  useEffect(() => {
    const savedThreaded = window.localStorage.getItem("reply-center:threaded");
    if (savedThreaded !== null) setThreaded(savedThreaded !== "false");
  }, []);

  useEffect(() => {
    window.localStorage.setItem("reply-center:threaded", String(threaded));
  }, [threaded]);

  useEffect(() => {
    if (!storageKey) {
      setDismissedIds(new Set());
      setSnoozedUntil({});
      setPreferences(replyPreferences);
      setStorageReady(true);
      return;
    }

    const stored = parseStoredState(window.localStorage.getItem(storageKey));
    setDismissedIds(new Set(stored.dismissedIds));
    setSnoozedUntil(pruneSnoozes(stored.snoozedUntil));
    setPreferences(replyPreferences);
    setStorageReady(true);
  }, [replyPreferences, storageKey]);

  useEffect(() => {
    setPreferences(replyPreferences);
    setPreferencesDirty(false);
  }, [replyPreferences]);

  useEffect(() => {
    if (!storageKey || !storageReady) return;

    const payload: StoredReplyState = {
      dismissedIds: Array.from(dismissedIds),
      snoozedUntil: pruneSnoozes(snoozedUntil),
      preferences,
    };

    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  }, [dismissedIds, preferences, snoozedUntil, storageKey, storageReady]);

  useEffect(() => {
    if (!preferencesDirty) return;

    const timeout = window.setTimeout(() => {
      void updateReplyPreferences(preferences);
      setPreferencesDirty(false);
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [preferences, preferencesDirty, updateReplyPreferences]);

  const queueItems = useMemo(
    () =>
      buildReplyQueue({
        emails,
        chats,
        slackMessages,
        asanaComments,
        currentUserName,
        preferences,
      }),
    [asanaComments, chats, currentUserName, emails, preferences, slackMessages]
  );

  const attentionQueueItems = useMemo(
    () =>
      queueItems
        .map((item) => {
          const attention = applyTarget({
            ...item.attentionTarget,
            baseScore: item.displayScore,
          });

          return {
            ...item,
            displayScore: attention.finalScore,
            score: attention.finalScore,
            attention,
          };
        })
        .filter((item) => !item.attention.hidden)
        .sort((a, b) => {
          if (b.displayScore !== a.displayScore) {
            return b.displayScore - a.displayScore;
          }
          return b.sortTime - a.sortTime;
        }),
    [applyTarget, queueItems]
  );

  const isCustomized = hasCustomizedReplyPriorityPreferences(preferences);
  const taskMap = useMemo(
    () => new Map(tasks.map((task) => [task.task_gid, task])),
    [tasks]
  );

  const visibleItems = useMemo(() => {
    const now = Date.now();
    return attentionQueueItems.filter((item) => {
      if (dismissedIds.has(item.id)) return false;
      if (snoozedUntil[item.id] && snoozedUntil[item.id] > now) return false;
      if (activeFilter !== "all" && item.source !== activeFilter) return false;
      return true;
    });
  }, [activeFilter, attentionQueueItems, dismissedIds, snoozedUntil]);

  const threadedItems = useMemo(
    () => groupByThread(visibleItems, threaded),
    [visibleItems, threaded]
  );

  const tierGroups = useMemo(() => {
    const groups: Record<CommsTier, typeof threadedItems> = { "act-now": [], "follow-up": [], "aware": [] };
    for (const thread of threadedItems) {
      const tier = assignCommsTier(thread.highestDisplayScore, thread.mostRecentTimestamp);
      groups[tier].push(thread);
    }
    return (["act-now", "follow-up", "aware"] as CommsTier[])
      .filter((t) => groups[t].length > 0)
      .map((t) => ({ tier: t, config: TIER_CONFIG[t], items: groups[t] }));
  }, [threadedItems]);

  const counts = useMemo(() => {
    const now = Date.now();
    const activeItems = attentionQueueItems.filter((item) => {
      if (dismissedIds.has(item.id)) return false;
      if (snoozedUntil[item.id] && snoozedUntil[item.id] > now) return false;
      return true;
    });

    return {
      all: activeItems.length,
      email: activeItems.filter((item) => item.source === "email").length,
      teams: activeItems.filter((item) => item.source === "teams").length,
      slack_context: activeItems.filter((item) => item.source === "slack_context")
        .length,
      asana_comment: activeItems.filter((item) => item.source === "asana_comment")
        .length,
    };
  }, [attentionQueueItems, dismissedIds, snoozedUntil]);

  const selectedAsanaItem = useMemo(
    () =>
      visibleItems.find(
        (item) =>
          item.id === selectedAsanaId && item.source === "asana_comment"
      ) || null,
    [selectedAsanaId, visibleItems]
  );

  useEffect(() => {
    if (selectedAsanaId && !selectedAsanaItem) {
      setSelectedAsanaId(null);
    }
  }, [selectedAsanaId, selectedAsanaItem]);

  async function ensureEmailDetail(item: ReplyQueueItem) {
    if (item.source !== "email" || !item.messageId) return null;

    if (emailDetails[item.messageId]) {
      return emailDetails[item.messageId];
    }

    if (emailDetailLoading[item.messageId]) {
      return null;
    }

    setEmailDetailLoading((current) => ({
      ...current,
      [item.messageId!]: true,
    }));
    setEmailDetailErrors((current) => {
      const next = { ...current };
      delete next[item.messageId!];
      return next;
    });

    try {
      const res = await fetch(
        `/api/data/email-detail?messageId=${encodeURIComponent(item.messageId)}`
      );
      const data = (await res.json()) as EmailDetail | { error?: string };

      if (!res.ok) {
        throw new Error(
          "error" in data && data.error
            ? data.error
            : `HTTP ${res.status}`
        );
      }

      const detail = data as EmailDetail;
      setEmailDetails((current) => ({
        ...current,
        [item.messageId!]: detail,
      }));
      return detail;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to load the original email.";
      setEmailDetailErrors((current) => ({
        ...current,
        [item.messageId!]: message,
      }));
      return null;
    } finally {
      setEmailDetailLoading((current) => ({
        ...current,
        [item.messageId!]: false,
      }));
    }
  }

  function getTaskForItem(item: ReplyQueueItem) {
    if (!item.taskGid) return null;
    return taskMap.get(item.taskGid) || null;
  }

  function getAsanaDetail(item: ReplyQueueItem) {
    if (item.source !== "asana_comment" || !item.taskGid) return null;

    return (
      asanaDetails[item.taskGid] ||
      buildAsanaHydratedDetail(item, getTaskForItem(item))
    );
  }

  async function ensureAsanaDetail(item: ReplyQueueItem) {
    if (item.source !== "asana_comment" || !item.taskGid) return null;

    if (asanaDetails[item.taskGid]) {
      return asanaDetails[item.taskGid];
    }

    if (asanaDetailLoading[item.taskGid]) {
      return null;
    }

    setAsanaDetailLoading((current) => ({
      ...current,
      [item.taskGid!]: true,
    }));
    setAsanaDetailErrors((current) => {
      const next = { ...current };
      delete next[item.taskGid!];
      return next;
    });

    try {
      const res = await fetch(
        `/api/data/asana-thread?taskGid=${encodeURIComponent(item.taskGid)}`
      );
      const data = (await res.json()) as AsanaThreadDetail | { error?: string };

      if (!res.ok) {
        throw new Error(
          "error" in data && data.error ? data.error : `HTTP ${res.status}`
        );
      }

      const detail = data as AsanaThreadDetail;
      setAsanaDetails((current) => ({
        ...current,
        [item.taskGid!]: detail,
      }));
      return detail;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to load the Asana task.";
      setAsanaDetailErrors((current) => ({
        ...current,
        [item.taskGid!]: message,
      }));
      return null;
    } finally {
      setAsanaDetailLoading((current) => ({
        ...current,
        [item.taskGid!]: false,
      }));
    }
  }

  function openAsanaInspector(
    item: ReplyQueueItem,
    mode: ComposerMode = "draft"
  ) {
    if (item.source !== "asana_comment") return;

    setExpandedId(null);
    setSelectedAsanaId(item.id);
    setComposerState({ itemId: item.id, mode });
    setDraftErrors((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });

    if (mode === "ai" && !promptTexts[item.id]) {
      setPromptTexts((current) => ({
        ...current,
        [item.id]: QUICK_PROMPTS.asana_comment[0].prompt,
      }));
    }

    void ensureAsanaDetail(item);
  }

  function toggleExpanded(item: ReplyQueueItem) {
    if (item.source === "asana_comment") {
      openAsanaInspector(item, "draft");
      return;
    }

    setExpandedId((current) => (current === item.id ? null : item.id));
    if (item.source === "email") {
      void ensureEmailDetail(item);
    }
  }

  function openComposer(item: ReplyQueueItem, mode: ComposerMode) {
    if (item.source === "asana_comment") {
      openAsanaInspector(item, mode);
      return;
    }

    setSelectedAsanaId(null);
    setExpandedId(item.id);
    setComposerState({ itemId: item.id, mode });
    setDraftErrors((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });

    if (item.source === "email") {
      void ensureEmailDetail(item);
    }
  }

  function dismissItem(itemId: string) {
    setDismissedIds((current) => new Set(current).add(itemId));
    if (expandedId === itemId) setExpandedId(null);
    if (selectedAsanaId === itemId) setSelectedAsanaId(null);
    if (composerState?.itemId === itemId) setComposerState(null);
  }

  function snoozeItem(itemId: string) {
    setSnoozedUntil((current) => ({
      ...current,
      [itemId]: Date.now() + SNOOZE_MS,
    }));
    if (expandedId === itemId) setExpandedId(null);
    if (selectedAsanaId === itemId) setSelectedAsanaId(null);
    if (composerState?.itemId === itemId) setComposerState(null);
    addToast("Snoozed for 12 hours.", "default");
  }

  function dismissThread(thread: ThreadedItem) {
    for (const item of thread.items) {
      dismissItem(item.id);
    }
  }

  function snoozeThread(thread: ThreadedItem) {
    const expiry = Date.now() + SNOOZE_MS;
    setSnoozedUntil((current) => {
      const next = { ...current };
      for (const item of thread.items) {
        next[item.id] = expiry;
      }
      return next;
    });
    for (const item of thread.items) {
      if (expandedId === item.id) setExpandedId(null);
      if (selectedAsanaId === item.id) setSelectedAsanaId(null);
      if (composerState?.itemId === item.id) setComposerState(null);
    }
    addToast("Snoozed for 12 hours.", "default");
  }

  function resetPreferences() {
    setPreferences(createDefaultReplyPriorityPreferences());
    setPreferencesDirty(true);
    addToast("Priority settings reset to defaults.", "default");
  }

  function updateSourceWeight(source: ReplySource, next: number) {
    setPreferences((current) => ({
      ...current,
      sourceWeights: {
        ...current.sourceWeights,
        [source]: next,
      },
    }));
    setPreferencesDirty(true);
  }

  function updateFactorWeight(factor: ReplyPriorityFactorKey, next: number) {
    setPreferences((current) => ({
      ...current,
      factorWeights: {
        ...current.factorWeights,
        [factor]: next,
      },
    }));
    setPreferencesDirty(true);
  }

  async function copyText(text: string, message = "Copied to clipboard.") {
    if (!text.trim()) return;
    await navigator.clipboard.writeText(text);
    addToast(message, "success");
  }

  function applyQuickPrompt(item: ReplyQueueItem, prompt: string) {
    setPromptTexts((current) => ({ ...current, [item.id]: prompt }));
    openComposer(item, "ai");
  }

  async function handleAIDraft(item: ReplyQueueItem) {
    const prompt = promptTexts[item.id]?.trim();
    if (!prompt || streamingId) return;

    if (item.source === "email") {
      const detail = await ensureEmailDetail(item);
      if (!detail) {
        setDraftErrors((current) => ({
          ...current,
          [item.id]: "Load the original email before drafting a reply.",
        }));
        return;
      }
    }

    setStreamingId(item.id);
    setDraftErrors((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });

    try {
      const res = await fetch("/api/ai/draft-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: item.messageId,
          message:
            item.source === "slack_context"
              ? buildSlackSummary(item)
              : item.source === "asana_comment"
                ? buildAsanaDraftContext(item, getAsanaDetail(item))
                : item.message,
          prompt,
          channel:
            item.source === "asana_comment"
              ? "asana"
              : item.source === "slack_context"
                ? "slack context"
                : item.source,
          sender: item.sender,
          subject: item.title,
        }),
      });

      const text = await res.text();
      if (!res.ok) {
        throw new Error(text || `HTTP ${res.status}`);
      }

      setDrafts((current) => ({
        ...current,
        [item.id]: text.trim(),
      }));
      setComposerState({ itemId: item.id, mode: "draft" });
    } catch (error) {
      setDraftErrors((current) => ({
        ...current,
        [item.id]:
          error instanceof Error ? error.message : "Unable to draft right now.",
      }));
    } finally {
      setStreamingId(null);
    }
  }

  async function handlePostAsanaComment(item: ReplyQueueItem) {
    if (item.source !== "asana_comment" || !item.taskGid) return;

    const draft = drafts[item.id]?.trim();
    if (!draft) {
      setDraftErrors((current) => ({
        ...current,
        [item.id]: "Write the comment you want to post first.",
      }));
      return;
    }

    setPostingAsanaId(item.id);
    setDraftErrors((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });

    try {
      const res = await fetch("/api/actions/asana-comment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          taskGid: item.taskGid,
          text: draft,
        }),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        comment?: AsanaCommentEntry;
      };

      if (!res.ok || !data.comment) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const postedComment = data.comment;

      const hydrated = getAsanaDetail(item);
      setAsanaDetails((current) => ({
        ...current,
        [item.taskGid!]: {
          ...(current[item.taskGid!] || hydrated || buildAsanaHydratedDetail(item, getTaskForItem(item))),
          recent_comments: mergeRecentComments(
            current[item.taskGid!]?.recent_comments ||
              hydrated?.recent_comments ||
              [],
            postedComment
          ),
          synced_at: new Date().toISOString(),
        },
      }));
      setDrafts((current) => ({
        ...current,
        [item.id]: "",
      }));
      addToast("Comment posted to Asana.", "success");
      await refetchLiveData();
    } catch (error) {
      setDraftErrors((current) => ({
        ...current,
        [item.id]:
          error instanceof Error
            ? error.message
            : "Unable to post the Asana comment.",
      }));
    } finally {
      setPostingAsanaId(null);
    }
  }

  function getHandoffUrl(item: ReplyQueueItem) {
    if (item.source === "email") {
      return buildOutlookComposeUrl({
        to: item.senderEmail,
        subject: item.title,
        body: drafts[item.id] || "",
      });
    }

    return item.url;
  }

  function getEmailDetail(item: ReplyQueueItem) {
    if (item.source !== "email" || !item.messageId) return null;
    return emailDetails[item.messageId] || null;
  }

  function renderContext(item: ReplyQueueItem) {
    if (item.source !== "email") {
      return (
        <p className="whitespace-pre-wrap text-xs leading-relaxed text-text-body">
          {item.source === "slack_context"
            ? buildSlackSummary(item)
            : item.message || item.summary}
        </p>
      );
    }

    const detail = getEmailDetail(item);
    const isLoading = item.messageId ? emailDetailLoading[item.messageId] : false;
    const error = item.messageId ? emailDetailErrors[item.messageId] : "";

    if (detail) {
      return (
        <div className="space-y-3">
          <div className="grid gap-2 rounded-xl border border-[var(--bg-card-border)] bg-black/10 p-3 text-[11px] text-text-muted lg:grid-cols-2">
            <div>
              <span className="text-text-body">From</span>
              <div className="mt-1 break-words">
                {detail.fromName || detail.fromEmail || item.sender}
                {detail.fromEmail &&
                  detail.fromName &&
                  detail.fromEmail !== detail.fromName && (
                    <span className="ml-1 opacity-70">{`<${detail.fromEmail}>`}</span>
                  )}
              </div>
            </div>
            <div>
              <span className="text-text-body">Received</span>
              <div className="mt-1">
                {detail.receivedAt
                  ? `${new Date(detail.receivedAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      timeZone: "America/Los_Angeles",
                    })} · ${formatRelativeTime(detail.receivedAt)}`
                  : item.meta}
              </div>
            </div>
            {detail.to.length > 0 && (
              <div className="lg:col-span-2">
                <span className="text-text-body">To</span>
                <div className="mt-1 break-words">{formatRecipientList(detail.to)}</div>
              </div>
            )}
            {detail.cc.length > 0 && (
              <div className="lg:col-span-2">
                <span className="text-text-body">Cc</span>
                <div className="mt-1 break-words">{formatRecipientList(detail.cc)}</div>
              </div>
            )}
          </div>
          <div className="max-h-[360px] overflow-y-auto rounded-xl border border-[var(--bg-card-border)] bg-black/10 p-4">
            <p className="whitespace-pre-wrap text-xs leading-6 text-text-body">
              {detail.latestMessageText || detail.bodyText || item.message || item.summary}
            </p>
          </div>
          {detail.earlierThreadText && (
            <details className="rounded-xl border border-[var(--bg-card-border)] bg-black/10 p-3">
              <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-[0.18em] text-text-muted">
                Earlier thread context
              </summary>
              <p className="mt-3 whitespace-pre-wrap text-xs leading-6 text-text-body">
                {detail.earlierThreadText}
              </p>
            </details>
          )}
        </div>
      );
    }

    if (isLoading) {
      return (
        <div className="rounded-xl border border-[var(--bg-card-border)] bg-black/10 p-4 text-xs text-text-muted animate-pulse">
          Loading the full email…
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {error && (
          <div className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-xs text-red-200">
            {error}
          </div>
        )}
        <p className="whitespace-pre-wrap text-xs leading-relaxed text-text-body">
          {item.message || item.summary}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-md border border-[var(--bg-card-border)] px-2.5 py-1.5 text-[11px] text-text-muted transition-colors hover:text-text-body"
            onClick={() => void ensureEmailDetail(item)}
          >
            Retry load
          </button>
          {item.url && (
            <a
              className="inline-flex items-center gap-1 rounded-md border border-[var(--bg-card-border)] px-2.5 py-1.5 text-[11px] text-text-muted transition-colors hover:text-text-body"
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open original
              <ExternalLinkIcon size={11} />
            </a>
          )}
        </div>
      </div>
    );
  }

  function renderComposer(item: ReplyQueueItem) {
    if (composerState?.itemId !== item.id) return null;

    const isAiMode = composerState.mode === "ai";
    const draft = drafts[item.id] || "";
    const promptText = promptTexts[item.id] || "";
    const quickPrompts =
      item.source === "slack_context" ? [] : QUICK_PROMPTS[item.source];
    const emailLoading =
      item.source === "email" && item.messageId
        ? emailDetailLoading[item.messageId]
        : false;
    const emailError =
      item.source === "email" && item.messageId
        ? emailDetailErrors[item.messageId]
        : "";
    const emailReady =
      item.source !== "email" || Boolean(item.messageId && emailDetails[item.messageId]);

    return (
      <div className="mt-4 rounded-2xl border border-[rgba(212,164,76,0.14)] bg-[var(--draft-bg)] p-4">
        {item.source === "slack_context" ? (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-text-body">
              {buildSlackSummary(item)}
            </p>
            <div className="flex flex-wrap gap-2">
              {item.url && (
                <a
                  className="rounded-md bg-accent-amber px-3 py-1.5 text-[11px] font-semibold text-[#0d0d0d] transition-colors hover:bg-accent-amber/90"
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open in Slack
                </a>
              )}
              <button
                className="rounded-md border border-[var(--bg-card-border)] px-2.5 py-1.5 text-[11px] text-text-muted transition-colors hover:text-text-body"
                onClick={() => copyText(buildSlackSummary(item))}
              >
                Copy summary
              </button>
            </div>
          </div>
        ) : isAiMode ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {quickPrompts.map((entry) => (
                <button
                  key={entry.id}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[10px] transition-colors",
                    promptText === entry.prompt
                      ? "border-accent-amber bg-accent-amber/15 text-accent-amber"
                      : "border-[var(--bg-card-border)] text-text-muted hover:text-text-body"
                  )}
                  onClick={() =>
                    setPromptTexts((current) => ({
                      ...current,
                      [item.id]: entry.prompt,
                    }))
                  }
                >
                  {entry.label}
                </button>
              ))}
            </div>
            <textarea
              className="h-24 w-full rounded-xl border border-[var(--bg-card-border)] bg-transparent p-3 text-xs leading-relaxed text-text-body outline-none transition-colors focus:border-accent-amber/40"
              placeholder="Add guidance for the reply..."
              value={promptText}
              onChange={(event) =>
                setPromptTexts((current) => ({
                  ...current,
                  [item.id]: event.target.value,
                }))
              }
            />
            {item.source === "email" && !emailReady && (
              <div className="rounded-xl border border-[var(--bg-card-border)] bg-black/10 p-3 text-[11px] text-text-muted">
                {emailLoading
                  ? "Loading the original email so the draft is grounded in the full message."
                  : emailError ||
                    "Load the original email before generating a reply."}
              </div>
            )}
            {draftErrors[item.id] && (
              <p className="text-[11px] text-accent-red">{draftErrors[item.id]}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-md bg-accent-amber px-3 py-1.5 text-[11px] font-semibold text-[#0d0d0d] transition-colors hover:bg-accent-amber/90 disabled:opacity-50"
                disabled={
                  !promptText.trim() ||
                  streamingId === item.id ||
                  (item.source === "email" && !emailReady)
                }
                onClick={() => void handleAIDraft(item)}
              >
                {streamingId === item.id
                  ? "Drafting…"
                  : item.source === "asana_comment"
                    ? "Create comment draft"
                    : "Create draft"}
              </button>
              <button
                className="rounded-md border border-[var(--bg-card-border)] px-2.5 py-1.5 text-[11px] text-text-muted transition-colors hover:text-text-body"
                onClick={() => setComposerState({ itemId: item.id, mode: "draft" })}
              >
                Write manually
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <textarea
              className="min-h-[120px] w-full rounded-xl border border-[var(--bg-card-border)] bg-transparent p-3 text-xs leading-relaxed text-text-body outline-none transition-colors focus:border-accent-amber/40"
              placeholder={
                item.source === "asana_comment"
                  ? "Draft the comment you want to leave on this Asana task..."
                  : item.source === "teams"
                    ? "Draft the reply you want to send in Teams..."
                    : "Draft your reply..."
              }
              value={draft}
              onChange={(event) =>
                setDrafts((current) => ({
                  ...current,
                  [item.id]: event.target.value,
                }))
              }
            />
            {draftErrors[item.id] && (
              <p className="text-[11px] text-accent-red">{draftErrors[item.id]}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-md border border-[var(--bg-card-border)] px-2.5 py-1.5 text-[11px] text-text-muted transition-colors hover:text-text-body"
                onClick={() => setComposerState({ itemId: item.id, mode: "ai" })}
              >
                AI assist
              </button>
              {item.source === "asana_comment" && (
                <button
                  className="rounded-md bg-accent-amber px-3 py-1.5 text-[11px] font-semibold text-[#0d0d0d] transition-colors hover:bg-accent-amber/90 disabled:opacity-50"
                  disabled={!draft.trim() || postingAsanaId === item.id}
                  onClick={() => void handlePostAsanaComment(item)}
                >
                  {postingAsanaId === item.id ? "Posting…" : "Post comment"}
                </button>
              )}
              {draft && (
                <button
                  className="rounded-md border border-[var(--bg-card-border)] px-2.5 py-1.5 text-[11px] text-text-muted transition-colors hover:text-text-body"
                  onClick={() =>
                    void copyText(
                      draft,
                      item.source === "asana_comment"
                        ? "Comment copied."
                        : "Draft copied."
                    )
                  }
                >
                  Copy
                </button>
              )}
              {getHandoffUrl(item) && (
                <a
                  className={cn(
                    "rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors",
                    item.source === "asana_comment"
                      ? "border border-[var(--bg-card-border)] text-text-muted hover:text-text-body"
                      : "bg-accent-amber text-[#0d0d0d] hover:bg-accent-amber/90"
                  )}
                  href={getHandoffUrl(item)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {handoffLabel(item, Boolean(draft.trim()))}
                </a>
              )}
              {item.source === "email" && item.url && (
                <a
                  className="rounded-md border border-[var(--bg-card-border)] px-2.5 py-1.5 text-[11px] text-text-muted transition-colors hover:text-text-body"
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open original
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderAsanaInspector(item: ReplyQueueItem, mobile = false) {
    const detail = getAsanaDetail(item);
    const loading = item.taskGid ? asanaDetailLoading[item.taskGid] : false;
    const error = item.taskGid ? asanaDetailErrors[item.taskGid] : "";
    const promptText = promptTexts[item.id] || "";

    return (
      <div
        className={cn(
          "overflow-hidden rounded-[28px] border border-[rgba(212,164,76,0.16)] bg-[linear-gradient(180deg,rgba(19,29,42,0.96),rgba(11,16,24,0.96))] shadow-[0_32px_80px_rgba(0,0,0,0.34)]",
          mobile ? "max-h-[85vh] overflow-y-auto" : "xl:sticky xl:top-6"
        )}
      >
        <div className="border-b border-[var(--bg-card-border)] bg-[radial-gradient(circle_at_top_right,rgba(212,164,76,0.16),transparent_42%)] p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-accent-amber/20 bg-accent-amber/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-accent-amber">
                  Asana task
                </span>
                {detail?.completed ? (
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
                    Complete
                  </span>
                ) : (
                  <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-200">
                    Open
                  </span>
                )}
                {loading && (
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-text-muted">
                    Syncing
                  </span>
                )}
              </div>

              <div>
                <h3 className="text-xl font-semibold leading-tight text-text-heading">
                  {detail?.task_name || item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">
                  {detail?.project_name || item.projectName || "Tasks"} · Last activity{" "}
                  {formatRelativeTime(
                    detail?.recent_comments.at(-1)?.created_at || item.timestamp
                  )}
                </p>
              </div>
            </div>

            {mobile && (
              <button
                className="rounded-full border border-[var(--bg-card-border)] px-3 py-1.5 text-[11px] text-text-muted transition-colors hover:text-text-body"
                onClick={() => setSelectedAsanaId(null)}
              >
                Close
              </button>
            )}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-[var(--bg-card-border)] bg-black/10 p-3">
              <div className="text-[10px] uppercase tracking-[0.22em] text-text-muted">
                Assignee
              </div>
              <div className="mt-2 text-sm text-text-body">
                {detail?.assignee_name || "Unassigned"}
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--bg-card-border)] bg-black/10 p-3">
              <div className="text-[10px] uppercase tracking-[0.22em] text-text-muted">
                Due
              </div>
              <div className="mt-2 text-sm text-text-body">
                {formatDueLabel(detail?.task_due_on || item.taskDueOn)}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <AttentionFeedbackControl
              target={item.attentionTarget}
              surface="reply-center"
              compact
            />
            <div className="h-5 w-px bg-[var(--bg-card-border)]" />
            <div className="flex flex-wrap gap-2">
              {item.url && (
                <a
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--bg-card-border)] px-3 py-1.5 text-[11px] text-text-muted transition-colors hover:text-text-body"
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open in Asana
                  <ExternalLinkIcon size={11} />
                </a>
              )}
              <button
                className="relative group rounded-md border border-[var(--bg-card-border)] px-3 py-1.5 text-[11px] text-text-muted transition-colors hover:text-text-body"
                onClick={() => setComposerState({ itemId: item.id, mode: "draft" })}
              >
                Comment
                <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 text-[10px] rounded bg-gray-900 text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">Draft reply</span>
              </button>
              <button
                className="relative group rounded-md border border-[var(--bg-card-border)] px-3 py-1.5 text-[11px] text-text-muted transition-colors hover:text-text-body"
                onClick={() => setComposerState({ itemId: item.id, mode: "ai" })}
              >
                AI assist
                <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 text-[10px] rounded bg-gray-900 text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">AI assist</span>
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-5">
          {error && (
            <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-100">
              <div className="font-medium text-red-50">Task details could not be refreshed</div>
              <div className="mt-1">{error}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="rounded-md border border-red-300/20 px-3 py-1.5 text-[11px] text-red-100 transition-colors hover:text-white"
                  onClick={() => void ensureAsanaDetail(item)}
                >
                  Retry
                </button>
                {item.url && (
                  <a
                    className="rounded-md border border-red-300/20 px-3 py-1.5 text-[11px] text-red-100 transition-colors hover:text-white"
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open in Asana
                  </a>
                )}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-[var(--bg-card-border)] bg-black/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] uppercase tracking-[0.24em] text-text-muted">
                Task context
              </div>
              <div className="text-[11px] text-text-muted">
                {detail?.notes ? "Live task notes" : "No task notes yet"}
              </div>
            </div>
            <div className="mt-3 space-y-3">
              {renderFormattedText(
                detail?.notes,
                `asana-notes-${item.id}`,
                "text-sm leading-6 text-text-body"
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--bg-card-border)] bg-black/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] uppercase tracking-[0.24em] text-text-muted">
                Recent comments
              </div>
              <div className="text-[11px] text-text-muted">
                {(detail?.recent_comments.length || 0) > 0
                  ? `${detail?.recent_comments.length || 0} recent updates`
                  : "No recent comments"}
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {(detail?.recent_comments || []).length > 0 ? (
                (detail?.recent_comments || []).map((comment) => (
                  <div
                    key={comment.id}
                    className="rounded-2xl border border-[var(--bg-card-border)] bg-[rgba(255,255,255,0.02)] p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium text-text-heading">
                        {comment.author_name}
                      </div>
                      <div className="text-[11px] text-text-muted">
                        {formatAbsoluteDateTime(comment.created_at)} ·{" "}
                        {formatRelativeTime(comment.created_at)}
                      </div>
                    </div>
                    <div className="mt-3 space-y-3">
                      {renderFormattedText(
                        comment.text,
                        `asana-comment-${comment.id}`,
                        "text-sm leading-6 text-text-body"
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-[var(--bg-card-border)] bg-black/10 p-4 text-sm text-text-muted">
                  No human comments were found for this task yet.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[rgba(212,164,76,0.16)] bg-[rgba(212,164,76,0.06)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-accent-amber">
                  Comment assistant
                </div>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">
                  Keep the thread moving without leaving the queue.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_PROMPTS.asana_comment.map((entry) => (
                  <button
                    key={`${item.id}-${entry.id}`}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[10px] transition-colors",
                      promptText === entry.prompt
                        ? "border-accent-amber bg-accent-amber/15 text-accent-amber"
                        : "border-[var(--bg-card-border)] text-text-muted hover:text-text-body"
                    )}
                    onClick={() => {
                      setPromptTexts((current) => ({
                        ...current,
                        [item.id]: entry.prompt,
                      }));
                      setComposerState({ itemId: item.id, mode: "ai" });
                    }}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
            </div>

            {renderComposer(item)}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-[var(--bg-card-border)] pt-1">
            <button
              className="relative group rounded-md border border-[var(--bg-card-border)] px-3 py-1.5 text-[11px] text-text-muted transition-colors hover:text-text-body"
              onClick={() => snoozeItem(item.id)}
            >
              Snooze
              <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 text-[10px] rounded bg-gray-900 text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">Snooze</span>
            </button>
            <button
              className="relative group rounded-md border border-[var(--bg-card-border)] px-3 py-1.5 text-[11px] text-text-muted transition-colors hover:text-accent-red"
              onClick={() => dismissItem(item.id)}
            >
              Dismiss
              <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 text-[10px] rounded bg-gray-900 text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">Dismiss</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="glass-card anim-card relative overflow-hidden" style={{ animationDelay: "80ms" }}>
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-70"
        style={{
          background:
            "radial-gradient(circle at top left, rgba(212, 164, 76, 0.18), transparent 48%)",
        }}
      />

      <div className="relative space-y-5">
        <div className="flex flex-col gap-4 border-b border-[var(--bg-card-border)] pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(212,164,76,0.16)] bg-[rgba(212,164,76,0.08)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-accent-amber">
              Priority Workspace
            </div>
            <div>
              <h2 className="flex items-center gap-3 text-lg font-semibold text-text-heading">
                Priority Replies
                <span className="inline-flex items-center rounded-full bg-accent-amber/15 px-2.5 py-1 text-xs font-medium text-accent-amber">
                  {counts.all}
                </span>
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-muted">
                One ranked queue of emails, chats, and comments that need your response. The score reflects urgency, freshness, and how many people are waiting on you.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:items-end">
            <div className="flex flex-wrap gap-2">
              <button
                className={cn(
                  "rounded-xl border px-3 py-1.5 text-xs transition-colors",
                  showSettings
                    ? "border-accent-amber/30 bg-accent-amber/12 text-accent-amber"
                    : "border-[var(--bg-card-border)] text-text-muted hover:text-text-body"
                )}
                onClick={() => setShowSettings((current) => !current)}
              >
                {showSettings ? "Hide tuning" : "Tune priorities"}
              </button>
              {isCustomized && (
                <>
                  <span className="inline-flex items-center rounded-full border border-teal-400/20 bg-teal-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-200">
                    Custom
                  </span>
                  <button
                    className="rounded-xl border border-[var(--bg-card-border)] px-3 py-1.5 text-xs text-text-muted transition-colors hover:text-text-body"
                    onClick={resetPreferences}
                  >
                    Reset defaults
                  </button>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-xl border border-[var(--bg-card-border)] overflow-hidden">
                <button
                  className={cn(
                    "px-3 py-1.5 text-xs transition-colors",
                    threaded
                      ? "bg-[var(--tab-active-bg)] text-accent-amber"
                      : "text-text-muted hover:text-text-body"
                  )}
                  onClick={() => setThreaded(true)}
                >
                  Threaded
                </button>
                <button
                  className={cn(
                    "px-3 py-1.5 text-xs transition-colors border-l border-[var(--bg-card-border)]",
                    !threaded
                      ? "bg-[var(--tab-active-bg)] text-accent-amber"
                      : "text-text-muted hover:text-text-body"
                  )}
                  onClick={() => setThreaded(false)}
                >
                  All Messages
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
              {(Object.keys(FILTER_LABELS) as FilterId[]).map((filter) => (
                <button
                  key={filter}
                  className={cn(
                    "rounded-xl px-3 py-1.5 text-xs transition-colors",
                    activeFilter === filter
                      ? "bg-[var(--tab-active-bg)] text-accent-amber"
                      : "bg-transparent text-text-muted hover:bg-[var(--tab-bg)] hover:text-text-body"
                  )}
                  onClick={() => setActiveFilter(filter)}
                >
                  {FILTER_LABELS[filter]}
                  <span className="ml-1 opacity-70">{counts[filter]}</span>
                </button>
              ))}
              </div>
            </div>
          </div>
        </div>

        {showSettings && (
          <div className="rounded-[28px] border border-[rgba(212,164,76,0.14)] bg-[var(--tab-bg)] p-4">
            <div className="flex flex-col gap-3 border-b border-[var(--bg-card-border)] pb-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-accent-amber">
                  Priority Tuning
                </div>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-muted">
                  Adjust how strongly each source and factor influences the queue. Changes save to your workspace profile and travel with you across sessions.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-text-muted">
                  Live reordering
                </div>
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-text-muted">
                  Server-backed
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_1.6fr]">
              <div className="space-y-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                  Sources
                </div>
                <div className="grid gap-3">
                  {REPLY_PRIORITY_SOURCE_CONTROLS.map((control) => (
                    <WeightSlider
                      key={control.key}
                      id={`source-weight-${control.key}`}
                      label={control.label}
                      description={control.description}
                      value={preferences.sourceWeights[control.key]}
                      onChange={(next) => updateSourceWeight(control.key, next)}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                    Scoring factors
                  </div>
                  {!isCustomized && (
                    <div className="text-[11px] text-text-muted">
                      Defaults loaded
                    </div>
                  )}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {REPLY_PRIORITY_FACTOR_CONTROLS.map((control) => (
                    <WeightSlider
                      key={control.key}
                      id={`factor-weight-${control.key}`}
                      label={control.label}
                      description={control.description}
                      value={preferences.factorWeights[control.key]}
                      onChange={(next) => updateFactorWeight(control.key, next)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {loading && visibleItems.length === 0 ? (
          <div className="py-8 text-center text-sm text-text-muted animate-pulse">
            Building your ranked reply queue…
          </div>
        ) : visibleItems.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div
              className={cn(
                "grid gap-4",
                selectedAsanaItem
                  ? "xl:grid-cols-[minmax(0,1.28fr)_minmax(360px,0.92fr)]"
                  : ""
              )}
            >
              <div className="min-w-0">
                {tierGroups.length > 0 && !tierGroups.some((g) => g.tier === "act-now") && (
                  <div className="mb-4 rounded-xl border border-dashed border-accent-green/20 bg-accent-green/[0.03] px-4 py-3 text-center">
                    <span className="text-xs text-accent-green">Nothing urgent right now</span>
                  </div>
                )}
                {tierGroups.map((group) => (
                  <div key={group.tier} className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${group.config.colorClass}`}>
                        {group.config.label}
                      </span>
                      <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] tabular-nums text-text-muted">
                        {group.items.length}
                      </span>
                    </div>
                    <div className="divide-y divide-[var(--bg-card-border)] overflow-hidden rounded-[28px] border border-[var(--bg-card-border)] bg-black/10">
                  {group.items.map((thread, index) => {
                    const item = thread.representative;
                    const isThreaded = thread.threadCount > 1;
                    const isThreadExpanded = expandedThreadKey === thread.threadKey;
                    const isExpanded =
                      item.source !== "asana_comment" && expandedId === item.id;
                    const isComposerOpen =
                      item.source !== "asana_comment" &&
                      composerState?.itemId === item.id;
                    const isAsanaSelected =
                      item.source === "asana_comment" &&
                      selectedAsanaId === item.id;
                    const priorityPills = buildPriorityPills(item);

                    return (
                      <div
                        key={thread.threadKey}
                        className={cn(
                          "px-4 py-4 transition-colors",
                          isExpanded || isComposerOpen || isAsanaSelected || isThreadExpanded
                            ? "bg-white/[0.03]"
                            : "hover:bg-white/[0.02]"
                        )}
                        style={{
                          borderLeftWidth: 3,
                          borderLeftColor: `rgba(${group.config.borderRgb}, ${0.3 + Math.min(1, (thread.highestDisplayScore - 30) / 70) * 0.7})`,
                        }}
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                          <div className="flex items-start gap-3 lg:min-w-0 lg:flex-1">
                            <div className="pt-0.5">
                              <ScoreBadge score={thread.highestDisplayScore} />
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={cn(
                                    "rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                                    SOURCE_STYLES[item.source]
                                  )}
                                >
                                  {SOURCE_BADGES[item.source]}
                                </span>
                                {index < 3 && (
                                  <span className="rounded-md border border-accent-amber/20 bg-accent-amber/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-amber">
                                    Top queue
                                  </span>
                                )}
                                {isThreaded && (
                                  <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2 py-0.5 text-[10px] font-medium text-sky-200">
                                    {thread.threadCount} messages
                                  </span>
                                )}
                                <span className="text-[11px] text-text-muted">
                                  {item.source === "asana_comment"
                                    ? `${item.projectName || "Tasks"} · ${formatRelativeTime(thread.mostRecentTimestamp)}`
                                    : isThreaded
                                      ? formatRelativeTime(thread.mostRecentTimestamp)
                                      : item.meta}
                                </span>
                              </div>

                              <div className="mt-2 flex flex-wrap items-start gap-3">
                                <button
                                  className="hot-link text-left text-base font-medium leading-tight text-text-heading"
                                  onClick={() => {
                                    if (isThreaded) {
                                      setExpandedThreadKey((current) =>
                                        current === thread.threadKey ? null : thread.threadKey
                                      );
                                    } else if (item.source === "asana_comment") {
                                      openAsanaInspector(item, "draft");
                                    } else {
                                      toggleExpanded(item);
                                    }
                                  }}
                                >
                                  {item.title}
                                </button>
                                <span className="mt-0.5 text-xs text-text-muted">
                                  {item.source === "asana_comment"
                                    ? `${thread.senderSummary} commented`
                                    : `${thread.senderSummary}${item.projectName ? ` · ${item.projectName}` : ""}`}
                                </span>
                              </div>

                              {item.source === "asana_comment" ? (
                                <>
                                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
                                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 uppercase tracking-[0.14em]">
                                      Latest comment
                                    </span>
                                    <span>{formatRelativeTime(thread.mostRecentTimestamp)}</span>
                                    {item.taskDueOn ? (
                                      <>
                                        <span>·</span>
                                        <span>{formatDueLabel(item.taskDueOn)}</span>
                                      </>
                                    ) : null}
                                  </div>
                                  <p className="mt-3 max-w-4xl line-clamp-2 text-sm leading-7 text-text-body">
                                    {item.summary}
                                  </p>
                                </>
                              ) : (
                                <p className="mt-2 max-w-4xl text-sm leading-relaxed text-text-body">
                                  {item.summary}
                                </p>
                              )}

                              {group.tier === "follow-up" && (() => {
                                const age = tierAgingLabel(thread.mostRecentTimestamp);
                                return age ? <span className="mt-1 inline-block text-[10px] font-medium text-accent-teal">{age}</span> : null;
                              })()}

                              {item.priorityReasons.length > 0 && (
                                <p className="mt-2 text-[11px] leading-relaxed text-text-muted">
                                  <span className="mr-1 uppercase tracking-[0.18em] text-[10px] text-accent-amber">
                                    Why
                                  </span>
                                  {buildPriorityReasonLine(item)}
                                </p>
                              )}
                              {item.scoreBreakdown.length > 0 && (
                                <p className="mt-1 text-[11px] leading-relaxed text-text-muted">
                                  <span className="mr-1 uppercase tracking-[0.18em] text-[10px] text-teal-200">
                                    Score
                                  </span>
                                  {buildScoreBreakdownLine(item)}
                                </p>
                              )}
                              {"attention" in item &&
                                (item as unknown as { attention: { explanation: string[] } }).attention.explanation.length > 0 && (
                                  <p className="mt-1 text-[11px] leading-relaxed text-text-muted">
                                    <span className="mr-1 uppercase tracking-[0.18em] text-[10px] text-accent-green">
                                      Focus
                                    </span>
                                    {(item as unknown as { attention: { explanation: string[] } }).attention.explanation.join(" · ")}
                                  </p>
                                )}

                              <div className="mt-3 flex flex-wrap gap-1.5">
                                {priorityPills.map((pill) => (
                                  <span
                                    key={`${item.id}-${pill.label}`}
                                    className={cn(
                                      "rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em]",
                                      pill.className
                                    )}
                                  >
                                    {pill.label}
                                  </span>
                                ))}
                                {item.tags.slice(0, 3).map((tag) => (
                                  <span
                                    key={`${item.id}-${tag}`}
                                    className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-text-muted"
                                  >
                                    {titleCaseTag(tag)}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center lg:w-auto lg:justify-end">
                            <AttentionFeedbackControl
                              target={item.attentionTarget}
                              surface="reply-center"
                              compact
                            />
                          </div>
                        </div>

                        {isThreaded && isThreadExpanded && (
                          <div className="mt-4 space-y-2">
                            {thread.items.map((threadItem) => (
                              <div
                                key={threadItem.id}
                                className="flex items-start gap-3 rounded-2xl border border-[var(--bg-card-border)] bg-[var(--tab-bg)] px-4 py-3"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-medium text-text-heading">
                                      {threadItem.sender}
                                    </span>
                                    <span className="text-[11px] text-text-muted">
                                      {formatRelativeTime(threadItem.timestamp)}
                                    </span>
                                    <ScoreBadge score={threadItem.displayScore} />
                                  </div>
                                  <p className="mt-1.5 max-w-4xl text-sm leading-relaxed text-text-body line-clamp-2">
                                    {threadItem.summary}
                                  </p>
                                </div>
                                {threadItem.url && (
                                  <a
                                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--bg-card-border)] px-2.5 py-1.5 text-[11px] text-text-muted transition-colors hover:text-text-body"
                                    href={threadItem.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    View
                                    <ExternalLinkIcon size={11} />
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {!isThreaded && (isExpanded || isComposerOpen) && (
                          <div className="mt-4 rounded-[24px] border border-[var(--bg-card-border)] bg-[var(--tab-bg)] p-4">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                              <div className="text-[10px] uppercase tracking-[0.24em] text-text-muted">
                                {item.source === "email"
                                  ? "Full message"
                                  : item.source === "slack_context"
                                    ? "Thread context"
                                    : "Conversation context"}
                              </div>

                              {item.source !== "slack_context" && !isComposerOpen && (
                                <div className="flex flex-wrap gap-1.5">
                                  {QUICK_PROMPTS[item.source].map((entry) => (
                                    <button
                                      key={entry.id}
                                      className="rounded-full border border-[var(--bg-card-border)] px-2.5 py-1 text-[10px] text-text-muted transition-colors hover:text-text-body"
                                      onClick={() => applyQuickPrompt(item, entry.prompt)}
                                    >
                                      {entry.label}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            {item.priorityReasons.length > 0 && (
                              <div className="mb-4 rounded-xl border border-[var(--bg-card-border)] bg-black/10 px-3 py-2 text-[11px] text-text-muted">
                                <span className="mr-2 uppercase tracking-[0.18em] text-[10px] text-accent-amber">
                                  Why this is high
                                </span>
                                {buildPriorityReasonLine(item)}
                              </div>
                            )}
                            {item.scoreBreakdown.length > 0 && (
                              <div className="mb-4 rounded-xl border border-[var(--bg-card-border)] bg-black/10 px-3 py-2 text-[11px] text-text-muted">
                                <span className="mr-2 uppercase tracking-[0.18em] text-[10px] text-teal-200">
                                  Score recipe
                                </span>
                                {item.scoreBreakdown.map((entry) => (
                                  <span
                                    key={`${item.id}-${entry.key}`}
                                    className="mr-3 inline-flex"
                                  >
                                    {entry.label} +{entry.points}
                                  </span>
                                ))}
                              </div>
                            )}

                            {renderContext(item)}

                            {/* Action bar — after reading, before composing */}
                            {!isComposerOpen && (
                              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--bg-card-border)] pt-4">
                                {item.source === "asana_comment" ? (
                                  <>
                                    <button
                                      className="rounded-md bg-accent-amber px-3 py-1.5 text-[11px] font-semibold text-[#0d0d0d] transition-colors hover:bg-accent-amber/90"
                                      onClick={() => openAsanaInspector(item, "draft")}
                                    >
                                      Comment
                                    </button>
                                    <button
                                      className="rounded-md border border-[var(--bg-card-border)] px-2.5 py-1.5 text-[11px] text-text-muted transition-colors hover:text-text-body"
                                      onClick={() => openAsanaInspector(item, "ai")}
                                    >
                                      AI assist
                                    </button>
                                    {item.url && (
                                      <a
                                        className="inline-flex items-center gap-1 rounded-md border border-[var(--bg-card-border)] px-2.5 py-1.5 text-[11px] text-text-muted transition-colors hover:text-text-body"
                                        href={item.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        Open in Asana
                                        <ExternalLinkIcon size={11} />
                                      </a>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    {item.source !== "slack_context" && (
                                      <button
                                        className="rounded-md bg-accent-amber px-3 py-1.5 text-[11px] font-semibold text-[#0d0d0d] transition-colors hover:bg-accent-amber/90"
                                        onClick={() => openComposer(item, "draft")}
                                      >
                                        Draft reply
                                      </button>
                                    )}
                                    {item.source === "slack_context" ? (
                                      <button
                                        className="rounded-md border border-[var(--bg-card-border)] px-2.5 py-1.5 text-[11px] text-text-muted transition-colors hover:text-text-body"
                                        onClick={() => toggleExpanded(item)}
                                      >
                                        Summarize
                                      </button>
                                    ) : (
                                      <button
                                        className="rounded-md border border-[var(--bg-card-border)] px-2.5 py-1.5 text-[11px] text-text-muted transition-colors hover:text-text-body"
                                        onClick={() => openComposer(item, "ai")}
                                      >
                                        AI assist
                                      </button>
                                    )}
                                    {item.url && item.source !== "email" && (
                                      <a
                                        className="inline-flex items-center gap-1 rounded-md border border-[var(--bg-card-border)] px-2.5 py-1.5 text-[11px] text-text-muted transition-colors hover:text-text-body"
                                        href={item.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        {handoffLabel(item, Boolean(drafts[item.id]?.trim()))}
                                        <ExternalLinkIcon size={11} />
                                      </a>
                                    )}
                                  </>
                                )}
                                <div className="ml-auto flex gap-2">
                                  <button
                                    className="rounded-md border border-[var(--bg-card-border)] px-2.5 py-1.5 text-[11px] text-text-muted transition-colors hover:text-text-body"
                                    onClick={() => isThreaded ? snoozeThread(thread) : snoozeItem(item.id)}
                                  >
                                    Snooze
                                  </button>
                                  <button
                                    className="rounded-md px-2.5 py-1.5 text-[11px] text-text-muted transition-colors hover:text-accent-red"
                                    onClick={() => isThreaded ? dismissThread(thread) : dismissItem(item.id)}
                                  >
                                    Dismiss
                                  </button>
                                </div>
                              </div>
                            )}

                            {renderComposer(item)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                    </div>
                  </div>
                ))}
              </div>

              {selectedAsanaItem && (
                <div className="hidden xl:block">
                  {renderAsanaInspector(selectedAsanaItem)}
                </div>
              )}
            </div>

            {selectedAsanaItem && (
              <div
                className="fixed inset-0 z-50 bg-black/70 p-4 backdrop-blur-sm xl:hidden"
                onClick={() => setSelectedAsanaId(null)}
              >
                <div
                  className="mx-auto flex h-full max-w-2xl items-center"
                  onClick={(event) => event.stopPropagation()}
                >
                  {renderAsanaInspector(selectedAsanaItem, true)}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
