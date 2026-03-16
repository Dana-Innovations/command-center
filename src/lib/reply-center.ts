import {
  buildAsanaCommentAttentionTarget,
  buildEmailAttentionTarget,
  buildSlackAttentionTarget,
  buildTeamsChatAttentionTarget,
} from "@/lib/attention/targets";
import type { AttentionTarget } from "@/lib/attention/types";
import type {
  AsanaCommentThread,
  Chat,
  Email,
  SlackFeedMessage,
} from "@/lib/types";

export type ReplySource =
  | "email"
  | "teams"
  | "slack_context"
  | "asana_comment";

export interface ReplyPrioritySignals {
  urgent: boolean;
  financial: boolean;
  legal: boolean;
  multiplePeopleWaiting: boolean;
  aging: boolean;
  recent: boolean;
}

export interface ReplyQueueItem {
  id: string;
  source: ReplySource;
  attentionTarget: AttentionTarget;
  taskGid?: string;
  taskDueOn?: string | null;
  projectGid?: string | null;
  title: string;
  sender: string;
  senderEmail?: string | null;
  messageId?: string | null;
  summary: string;
  message: string;
  timestamp: string;
  url: string;
  unread: boolean;
  tags: string[];
  meta: string;
  projectName?: string;
  sortTime: number;
  score: number;
  displayScore: number;
  scoreBreakdown: ReplyScoreBreakdownItem[];
  prioritySignals: ReplyPrioritySignals;
  priorityReasons: string[];
}

export interface ReplyScoreBreakdownItem {
  key: string;
  label: string;
  raw: number;
  weight: number;
  points: number;
}

export interface ReplyPriorityPreferences {
  sourceWeights: Record<ReplySource, number>;
  factorWeights: {
    unread: number;
    recency: number;
    urgency: number;
    aging: number;
    peopleWaiting: number;
    financial: number;
    legal: number;
    responsibility: number;
    engagement: number;
  };
}

export type ReplyPriorityFactorKey =
  keyof ReplyPriorityPreferences["factorWeights"];

export const REPLY_PRIORITY_SOURCE_CONTROLS = [
  {
    key: "email" as const,
    label: "Email",
    description: "How strongly inbox messages should rise in the queue.",
  },
  {
    key: "teams" as const,
    label: "Teams",
    description: "How much active chat threads should outrank other work.",
  },
  {
    key: "slack_context" as const,
    label: "Slack",
    description: "How much high-context Slack threads should matter.",
  },
  {
    key: "asana_comment" as const,
    label: "Asana",
    description: "How much task comments and follow-ups should surface.",
  },
] satisfies Array<{
  key: ReplySource;
  label: string;
  description: string;
}>;

export const REPLY_PRIORITY_FACTOR_CONTROLS = [
  {
    key: "recency" as const,
    label: "Recency",
    description: "Favor fresh messages and comments over older context.",
  },
  {
    key: "urgency" as const,
    label: "Urgency",
    description: "Boost items with explicit urgent language.",
  },
  {
    key: "unread" as const,
    label: "Unread",
    description: "Push unopened email toward the top.",
  },
  {
    key: "aging" as const,
    label: "Aging",
    description: "Escalate items that have been waiting on you.",
  },
  {
    key: "peopleWaiting" as const,
    label: "People Waiting",
    description: "Raise threads where multiple people are involved.",
  },
  {
    key: "responsibility" as const,
    label: "Ownership",
    description: "Boost items where you are clearly responsible.",
  },
  {
    key: "financial" as const,
    label: "Financial",
    description: "Raise budget, payment, contract, and pricing topics.",
  },
  {
    key: "legal" as const,
    label: "Legal",
    description: "Raise legal, compliance, and counsel-related topics.",
  },
  {
    key: "engagement" as const,
    label: "Engagement",
    description: "Favor attachments, files, reactions, and thread activity.",
  },
] satisfies Array<{
  key: ReplyPriorityFactorKey;
  label: string;
  description: string;
}>;

const DEFAULT_SOURCE_WEIGHTS: ReplyPriorityPreferences["sourceWeights"] = {
  email: 1,
  teams: 1,
  slack_context: 1,
  asana_comment: 1,
};

const DEFAULT_FACTOR_WEIGHTS: ReplyPriorityPreferences["factorWeights"] = {
  unread: 1,
  recency: 1,
  urgency: 1,
  aging: 1,
  peopleWaiting: 1,
  financial: 1,
  legal: 1,
  responsibility: 1,
  engagement: 1,
};

export const DEFAULT_REPLY_PRIORITY_PREFERENCES: ReplyPriorityPreferences = {
  sourceWeights: DEFAULT_SOURCE_WEIGHTS,
  factorWeights: DEFAULT_FACTOR_WEIGHTS,
};

const SOURCE_BASE_POINTS: Record<ReplySource, number> = {
  email: 28,
  teams: 42,
  slack_context: 20,
  asana_comment: 26,
};

const FACTOR_LABELS: Record<ReplyPriorityFactorKey, string> = {
  unread: "Unread",
  recency: "Recency",
  urgency: "Urgency",
  aging: "Aging",
  peopleWaiting: "People waiting",
  financial: "Financial",
  legal: "Legal",
  responsibility: "Ownership",
  engagement: "Engagement",
};

const MIN_WEIGHT = 0;
const MAX_WEIGHT = 2;

const EMAIL_NOISE =
  /noreply|no-reply|newsletter|marketing|notification|donotreply|mailer|linkedin|twitter|digest|promo|offer|deal|vercel\.com|github\.com/i;

const URGENT_RE = /\burgent\b|asap|critical|emergency|action required|time.sensitive/i;
const FINANCIAL_RE =
  /invoice|payment|billing|budget|revenue|cost|expense|contract|pricing|tax/i;
const LEGAL_RE = /legal|lawsuit|litigation|compliance|attorney|counsel|depo/i;
const GROUP_THREAD_RE = /team|group|committee|project|weekly|sync|leadership|slt/i;

function normalize(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

function stripHtml(value: string | null | undefined): string {
  return (value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string | null | undefined, max = 140): string {
  const text = stripHtml(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampWeight(value: number): number {
  return Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, value));
}

function safeWeight(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? clampWeight(value)
    : fallback;
}

export function createDefaultReplyPriorityPreferences(): ReplyPriorityPreferences {
  return {
    sourceWeights: { ...DEFAULT_SOURCE_WEIGHTS },
    factorWeights: { ...DEFAULT_FACTOR_WEIGHTS },
  };
}

export function mergeReplyPriorityPreferences(
  value: unknown
): ReplyPriorityPreferences {
  const defaults = createDefaultReplyPriorityPreferences();
  if (!value || typeof value !== "object") {
    return defaults;
  }

  const record = value as {
    sourceWeights?: Partial<Record<ReplySource, number>>;
    factorWeights?: Partial<Record<ReplyPriorityFactorKey, number>>;
  };

  return {
    sourceWeights: {
      email: safeWeight(record.sourceWeights?.email, defaults.sourceWeights.email),
      teams: safeWeight(record.sourceWeights?.teams, defaults.sourceWeights.teams),
      slack_context: safeWeight(
        record.sourceWeights?.slack_context,
        defaults.sourceWeights.slack_context
      ),
      asana_comment: safeWeight(
        record.sourceWeights?.asana_comment,
        defaults.sourceWeights.asana_comment
      ),
    },
    factorWeights: {
      unread: safeWeight(
        record.factorWeights?.unread,
        defaults.factorWeights.unread
      ),
      recency: safeWeight(
        record.factorWeights?.recency,
        defaults.factorWeights.recency
      ),
      urgency: safeWeight(
        record.factorWeights?.urgency,
        defaults.factorWeights.urgency
      ),
      aging: safeWeight(
        record.factorWeights?.aging,
        defaults.factorWeights.aging
      ),
      peopleWaiting: safeWeight(
        record.factorWeights?.peopleWaiting,
        defaults.factorWeights.peopleWaiting
      ),
      financial: safeWeight(
        record.factorWeights?.financial,
        defaults.factorWeights.financial
      ),
      legal: safeWeight(
        record.factorWeights?.legal,
        defaults.factorWeights.legal
      ),
      responsibility: safeWeight(
        record.factorWeights?.responsibility,
        defaults.factorWeights.responsibility
      ),
      engagement: safeWeight(
        record.factorWeights?.engagement,
        defaults.factorWeights.engagement
      ),
    },
  };
}

export function hasCustomizedReplyPriorityPreferences(
  preferences: ReplyPriorityPreferences
): boolean {
  const defaults = DEFAULT_REPLY_PRIORITY_PREFERENCES;

  return (
    Object.entries(preferences.sourceWeights).some(
      ([key, value]) =>
        value !== defaults.sourceWeights[key as ReplySource]
    ) ||
    Object.entries(preferences.factorWeights).some(
      ([key, value]) =>
        value !== defaults.factorWeights[key as ReplyPriorityFactorKey]
    )
  );
}

export function formatPriorityWeight(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function detectContentFlags(value: string) {
  return {
    urgent: URGENT_RE.test(value),
    financial: FINANCIAL_RE.test(value),
    legal: LEGAL_RE.test(value),
  };
}

function ageInHours(iso: string): number {
  return Math.max(
    0,
    (Date.now() - new Date(iso || Date.now()).getTime()) / (1000 * 60 * 60)
  );
}

interface ReplyScoreMetrics {
  source: ReplySource;
  unread?: number;
  recency?: number;
  urgency?: number;
  aging?: number;
  peopleWaiting?: number;
  financial?: number;
  legal?: number;
  responsibility?: number;
  engagement?: number;
}

function buildContribution(
  key: string,
  label: string,
  raw: number,
  weight: number
): ReplyScoreBreakdownItem | null {
  if (raw <= 0 || weight <= 0) {
    return null;
  }

  const points = Math.round(raw * weight);
  if (points <= 0) {
    return null;
  }

  return {
    key,
    label,
    raw,
    weight,
    points,
  };
}

function scoreMetrics(
  metrics: ReplyScoreMetrics,
  preferences: ReplyPriorityPreferences
) {
  const breakdown: ReplyScoreBreakdownItem[] = [];

  const sourceContribution = buildContribution(
    `source:${metrics.source}`,
    REPLY_PRIORITY_SOURCE_CONTROLS.find(
      (control) => control.key === metrics.source
    )?.label || "Source",
    SOURCE_BASE_POINTS[metrics.source],
    preferences.sourceWeights[metrics.source]
  );
  if (sourceContribution) {
    breakdown.push(sourceContribution);
  }

  for (const key of Object.keys(
    preferences.factorWeights
  ) as ReplyPriorityFactorKey[]) {
    const raw = metrics[key] ?? 0;
    const contribution = buildContribution(
      `factor:${key}`,
      FACTOR_LABELS[key],
      raw,
      preferences.factorWeights[key]
    );
    if (contribution) {
      breakdown.push(contribution);
    }
  }

  const total = breakdown.reduce((sum, item) => sum + item.points, 0);

  return {
    score: clampScore(total),
    breakdown: breakdown.sort((a, b) => b.points - a.points),
  };
}

function isGroupConversation(chat: Chat): boolean {
  return (
    (chat.members?.length || 0) > 2 ||
    GROUP_THREAD_RE.test(`${chat.topic || ""} ${chat.last_message_preview || ""}`)
  );
}

function buildSignals(
  flags: ReturnType<typeof detectContentFlags>,
  extras: Partial<ReplyPrioritySignals> = {}
): ReplyPrioritySignals {
  return {
    urgent: flags.urgent,
    financial: flags.financial,
    legal: flags.legal,
    multiplePeopleWaiting: extras.multiplePeopleWaiting ?? false,
    aging: extras.aging ?? false,
    recent: extras.recent ?? false,
  };
}

export function formatRelativeTime(iso: string): string {
  if (!iso) return "";

  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  });
}

export function buildTeamsChatUrl(chatId: string): string {
  if (!chatId) return "";
  return `https://teams.microsoft.com/l/chat/${encodeURIComponent(chatId)}/conversations`;
}

export function buildOutlookComposeUrl({
  to,
  subject,
  body,
}: {
  to?: string | null;
  subject?: string | null;
  body?: string | null;
}): string {
  const params = new URLSearchParams();
  if (to) params.set("to", to);
  if (subject) {
    params.set("subject", /^re:/i.test(subject) ? subject : `Re: ${subject}`);
  }
  if (body) params.set("body", body);
  return `https://outlook.office365.com/mail/deeplink/compose?${params.toString()}`;
}

function scoreEmail(
  email: Email,
  flags: ReturnType<typeof detectContentFlags>,
  preferences: ReplyPriorityPreferences
) {
  const daysAgo = Math.max(
    0,
    Math.floor(
      (Date.now() - new Date(email.received_at).getTime()) /
        (1000 * 60 * 60 * 24)
    )
  );

  return scoreMetrics(
    {
      source: "email",
      unread: !email.is_read ? 22 : 0,
      recency:
        daysAgo === 0 ? 18 : daysAgo === 1 ? 12 : daysAgo <= 3 ? 6 : 2,
      aging: Math.min(email.days_overdue * 6, 18),
      engagement: email.has_attachments ? 4 : 0,
      urgency: flags.urgent ? 18 : 0,
      financial: flags.financial ? 10 : 0,
      legal: flags.legal ? 12 : 0,
    },
    preferences
  );
}

function scoreTeams(
  chat: Chat,
  flags: ReturnType<typeof detectContentFlags>,
  preferences: ReplyPriorityPreferences
) {
  const hours = ageInHours(chat.last_activity);
  const groupConversation = isGroupConversation(chat);

  return scoreMetrics(
    {
      source: "teams",
      recency: hours <= 4 ? 18 : hours <= 24 ? 12 : hours <= 72 ? 6 : 2,
      peopleWaiting: groupConversation ? 10 : 0,
      urgency: flags.urgent ? 14 : 0,
      financial: flags.financial ? 8 : 0,
      legal: flags.legal ? 10 : 0,
    },
    preferences
  );
}

function scoreSlack(
  message: SlackFeedMessage,
  flags: ReturnType<typeof detectContentFlags>,
  preferences: ReplyPriorityPreferences
) {
  const hours = ageInHours(message.timestamp);

  return scoreMetrics(
    {
      source: "slack_context",
      recency: hours <= 6 ? 10 : hours <= 24 ? 6 : hours <= 72 ? 3 : 0,
      peopleWaiting: Math.min(message.thread_reply_count * 2, 10),
      engagement:
        (message.has_files ? 6 : 0) +
        ((message.reactions ?? []).length > 0 ? 4 : 0),
      urgency: flags.urgent ? 12 : 0,
      financial: flags.financial ? 6 : 0,
      legal: flags.legal ? 8 : 0,
    },
    preferences
  );
}

function scoreAsana(
  thread: AsanaCommentThread,
  flags: ReturnType<typeof detectContentFlags>,
  preferences: ReplyPriorityPreferences
) {
  const hours = ageInHours(thread.latest_comment_at);
  const relevanceWeight = {
    assignee: 14,
    collaborator: 10,
    follower: 7,
    prior_commenter: 8,
    creator: 6,
  }[thread.relevance_reason];

  return scoreMetrics(
    {
      source: "asana_comment",
      recency: hours <= 8 ? 12 : hours <= 24 ? 8 : hours <= 72 ? 4 : 1,
      responsibility: relevanceWeight,
      peopleWaiting: thread.participant_names.length > 2 ? 6 : 0,
      urgency: flags.urgent ? 12 : 0,
      financial: flags.financial ? 6 : 0,
      legal: flags.legal ? 8 : 0,
    },
    preferences
  );
}

function buildEmailPriorityReasons(
  email: Email,
  flags: ReturnType<typeof detectContentFlags>,
  daysAgo: number
) {
  const reasons: string[] = [];

  if (!email.is_read) reasons.push("Unread");
  if (flags.urgent) reasons.push("Urgent language");
  if (flags.financial) reasons.push("Financial topic");
  if (flags.legal) reasons.push("Legal or compliance topic");
  if (email.has_attachments) reasons.push("Has attachment");
  if (email.days_overdue > 0) reasons.push(`Waiting ${email.days_overdue}d`);
  if (daysAgo === 0) reasons.push("Arrived today");
  else if (daysAgo === 1) reasons.push("Arrived yesterday");

  return reasons.slice(0, 4);
}

function buildTeamsPriorityReasons(
  chat: Chat,
  flags: ReturnType<typeof detectContentFlags>,
  groupConversation: boolean
) {
  const reasons: string[] = [];
  const hours = ageInHours(chat.last_activity);

  if (hours <= 4) reasons.push("Active this morning");
  else if (hours <= 24) reasons.push("Recent thread");
  if (groupConversation) reasons.push("Multiple people waiting");
  if (flags.urgent) reasons.push("Urgent language");
  if (flags.financial) reasons.push("Financial topic");
  if (flags.legal) reasons.push("Legal or compliance topic");

  return reasons.slice(0, 4);
}

function buildSlackPriorityReasons(
  message: SlackFeedMessage,
  flags: ReturnType<typeof detectContentFlags>
) {
  const reasons: string[] = [];
  const hours = ageInHours(message.timestamp);

  if (hours <= 6) reasons.push("Fresh thread");
  if (message.thread_reply_count > 0) {
    reasons.push(
      message.thread_reply_count === 1
        ? "1 reply waiting"
        : `${message.thread_reply_count} replies waiting`
    );
  }
  if (message.has_files) reasons.push("Shared files");
  if ((message.reactions ?? []).length > 0) reasons.push("Reaction activity");
  if (flags.urgent) reasons.push("Urgent language");

  return reasons.slice(0, 4);
}

function buildAsanaPriorityReasons(
  thread: AsanaCommentThread,
  flags: ReturnType<typeof detectContentFlags>
) {
  const reasons: string[] = [];
  const relevanceMap: Record<AsanaCommentThread["relevance_reason"], string> = {
    assignee: "Assigned to you",
    collaborator: "You are a collaborator",
    follower: "You are following",
    prior_commenter: "You were already in the thread",
    creator: "You created the task",
  };

  reasons.push(relevanceMap[thread.relevance_reason]);
  reasons.push("New comment");
  if (thread.participant_names.length > 2) {
    reasons.push(`${thread.participant_names.length} participants`);
  }
  if (flags.urgent) reasons.push("Urgent language");
  if (flags.financial) reasons.push("Financial topic");
  if (flags.legal) reasons.push("Legal or compliance topic");

  return reasons.slice(0, 4);
}

function getSlackTags(message: SlackFeedMessage): string[] {
  const tags: string[] = [];

  if (message.thread_reply_count > 0) {
    tags.push(
      message.thread_reply_count === 1
        ? "1 reply"
        : `${message.thread_reply_count} replies`
    );
  }

  if (message.has_files) tags.push("Files");
  if ((message.reactions ?? []).length > 0) tags.push("Reactions");

  return tags;
}

function isSlackContextWorthy(message: SlackFeedMessage): boolean {
  return Boolean(
    message.permalink &&
      (message.thread_reply_count > 0 ||
        message.has_files ||
        (message.reactions ?? []).length > 0)
  );
}

export function buildReplyQueue({
  emails,
  chats,
  slackMessages,
  asanaComments,
  currentUserName,
  preferences = DEFAULT_REPLY_PRIORITY_PREFERENCES,
}: {
  emails: Email[];
  chats: Chat[];
  slackMessages: SlackFeedMessage[];
  asanaComments: AsanaCommentThread[];
  currentUserName: string;
  preferences?: ReplyPriorityPreferences;
}): ReplyQueueItem[] {
  const currentUser = normalize(currentUserName);
  const items: ReplyQueueItem[] = [];
  const seenEmailThreads = new Set<string>();

  const emailItems = [...emails]
    .filter(
      (email) =>
        !EMAIL_NOISE.test(email.from_email || "") &&
        !EMAIL_NOISE.test(email.from_name || "")
    )
    .sort(
      (a, b) =>
        new Date(b.received_at).getTime() - new Date(a.received_at).getTime()
    )
    .slice(0, 40);

  for (const email of emailItems) {
    const daysAgo = Math.max(
      0,
      Math.floor(
        (Date.now() - new Date(email.received_at).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    );
    const dedupeKey = `${normalize(email.from_email)}::${normalize(
      email.subject?.replace(/^(re|fw|fwd):\s*/i, "")
    )}`;

    if (seenEmailThreads.has(dedupeKey)) continue;
    seenEmailThreads.add(dedupeKey);

    const preview = truncate(email.preview, 180);
    const flags = detectContentFlags(`${email.subject} ${preview}`);

    if (
      email.is_read &&
      email.days_overdue <= 0 &&
      daysAgo > 3 &&
      !flags.urgent &&
      !flags.financial &&
      !flags.legal
    ) {
      continue;
    }

    const tags: string[] = [];
    if (!email.is_read) tags.push("Unread");
    if (email.has_attachments) tags.push("Attachments");
    if (email.days_overdue > 0) tags.push("Aging");
    const scoreResult = scoreEmail(email, flags, preferences);

    items.push({
      id: `email:${email.message_id || email.id}`,
      source: "email",
      attentionTarget: buildEmailAttentionTarget(
        email,
        "reply-center",
        scoreResult.score
      ),
      title: email.subject || "(no subject)",
      sender: email.from_name || email.from_email || "Unknown sender",
      senderEmail: email.from_email || null,
      messageId: email.message_id || email.id,
      summary: preview,
      message: email.preview || "",
      timestamp: email.received_at,
      url: email.outlook_url || "",
      unread: !email.is_read,
      tags,
      meta: formatRelativeTime(email.received_at),
      sortTime: new Date(email.received_at).getTime(),
      score: scoreResult.score,
      displayScore: scoreResult.score,
      scoreBreakdown: scoreResult.breakdown,
      prioritySignals: buildSignals(flags, {
        aging: email.days_overdue > 0,
        recent: daysAgo <= 1,
      }),
      priorityReasons: buildEmailPriorityReasons(email, flags, daysAgo),
    });
  }

  const chatItems = chats
    .filter((chat) => {
      const topic = normalize(chat.topic);
      const sender = normalize(chat.last_message_from);
      if (!topic && !chat.last_message_preview) return false;
      if (currentUser && sender === currentUser) return false;
      if (currentUser && topic === currentUser && sender === currentUser) {
        return false;
      }
      return true;
    })
    .sort(
      (a, b) =>
        new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime()
    )
    .slice(0, 20);

  for (const chat of chatItems) {
    const preview = truncate(chat.last_message_preview, 180);
    const sender = chat.last_message_from || "Teams";
    const title = chat.topic || preview || "Teams message";
    const flags = detectContentFlags(`${title} ${preview}`);
    const url = chat.web_url || buildTeamsChatUrl(chat.chat_id || chat.id);
    const groupConversation = isGroupConversation(chat);
    const scoreResult = scoreTeams(chat, flags, preferences);

    items.push({
      id: `teams:${chat.id}`,
      source: "teams",
      attentionTarget: buildTeamsChatAttentionTarget(
        chat,
        "reply-center",
        scoreResult.score
      ),
      title,
      sender,
      summary: preview || "Open in Teams to continue the conversation.",
      message: chat.last_message_preview || preview,
      timestamp: chat.last_activity,
      url,
      unread: false,
      tags: groupConversation ? ["Group thread"] : ["Recent"],
      meta: `Teams · ${formatRelativeTime(chat.last_activity)}`,
      sortTime: new Date(chat.last_activity).getTime(),
      score: scoreResult.score,
      displayScore: scoreResult.score,
      scoreBreakdown: scoreResult.breakdown,
      prioritySignals: buildSignals(flags, {
        multiplePeopleWaiting: groupConversation,
        recent: ageInHours(chat.last_activity) <= 24,
      }),
      priorityReasons: buildTeamsPriorityReasons(
        chat,
        flags,
        groupConversation
      ),
    });
  }

  const slackItems = slackMessages
    .filter(isSlackContextWorthy)
    .sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
    .slice(0, 12);

  for (const message of slackItems) {
    const preview = truncate(message.text, 180);
    const flags = detectContentFlags(
      `${message.channel_name} ${message.author_name} ${preview}`
    );
    const scoreResult = scoreSlack(message, flags, preferences);

    items.push({
      id: `slack:${message.id}`,
      source: "slack_context",
      attentionTarget: buildSlackAttentionTarget(
        message,
        "reply-center",
        scoreResult.score
      ),
      title:
        preview && message.author_name
          ? `${message.author_name}: ${truncate(message.text, 72)}`
          : `Slack update in #${message.channel_name}`,
      sender: message.author_name || "Slack",
      summary: preview || `Open #${message.channel_name} in Slack.`,
      message: message.text || "",
      timestamp: message.timestamp,
      url: message.permalink || "",
      unread: false,
      tags: getSlackTags(message),
      meta: `#${message.channel_name} · ${formatRelativeTime(message.timestamp)}`,
      sortTime: new Date(message.timestamp).getTime(),
      score: scoreResult.score,
      displayScore: scoreResult.score,
      scoreBreakdown: scoreResult.breakdown,
      prioritySignals: buildSignals(flags, {
        multiplePeopleWaiting: message.thread_reply_count > 2,
        recent: ageInHours(message.timestamp) <= 24,
      }),
      priorityReasons: buildSlackPriorityReasons(message, flags),
    });
  }

  for (const thread of asanaComments) {
    const summary = truncate(thread.latest_comment_text, 180);
    const flags = detectContentFlags(`${thread.task_name} ${summary}`);
    const scoreResult = scoreAsana(thread, flags, preferences);

    items.push({
      id: `asana:${thread.id}`,
      source: "asana_comment",
      attentionTarget: buildAsanaCommentAttentionTarget(
        thread,
        "reply-center",
        scoreResult.score
      ),
      taskGid: thread.task_gid,
      taskDueOn: thread.task_due_on,
      projectGid: thread.project_gid || null,
      title: thread.task_name,
      sender: thread.latest_commenter_name || "Asana",
      senderEmail: thread.latest_commenter_email || null,
      summary,
      message: thread.latest_comment_text,
      timestamp: thread.latest_comment_at,
      url: thread.permalink_url,
      unread: false,
      tags: ["Comment", thread.relevance_reason.replace("_", " ")],
      meta: `${thread.project_name} · ${formatRelativeTime(thread.latest_comment_at)}`,
      projectName: thread.project_name,
      sortTime: new Date(thread.latest_comment_at).getTime(),
      score: scoreResult.score,
      displayScore: scoreResult.score,
      scoreBreakdown: scoreResult.breakdown,
      prioritySignals: buildSignals(flags, {
        multiplePeopleWaiting: thread.participant_names.length > 2,
        recent: ageInHours(thread.latest_comment_at) <= 24,
      }),
      priorityReasons: buildAsanaPriorityReasons(thread, flags),
    });
  }

  return items.sort((a, b) => {
    if (b.displayScore !== a.displayScore) {
      return b.displayScore - a.displayScore;
    }
    return b.sortTime - a.sortTime;
  });
}
