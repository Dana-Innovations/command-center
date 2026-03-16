import type {
  Email,
  CalendarEvent,
  Task,
  AsanaCommentThread,
  Chat,
  SlackFeedMessage,
  SalesforceOpportunity,
} from "@/lib/types";
import type { AttentionItem, AttentionTarget } from "@/lib/attention/types";
import {
  buildEmailAttentionTarget,
  buildCalendarAttentionTarget,
  buildTaskAttentionTarget,
  buildAsanaCommentAttentionTarget,
  buildTeamsChatAttentionTarget,
  buildSlackAttentionTarget,
} from "@/lib/attention/targets";
import { extractTopicKeys } from "@/lib/attention/utils";

// ---------------------------------------------------------------------------
// Brief output types (returned by the AI)
// ---------------------------------------------------------------------------

export interface MorningBrief {
  generatedAt: string;
  headline: string;
  priorityActions: BriefAction[];
  crossCorrelations: BriefCorrelation[];
  calendarHighlights: BriefCalendarItem[];
  overnightChanges: BriefChange[];
  keyNumbers: BriefMetric[];
}

export interface BriefAction {
  id: string;
  text: string;
  urgency: "now" | "today" | "this-week";
  source: {
    itemType: string;
    itemId: string;
    provider: string;
    title: string;
    url?: string;
  };
  attentionScore: number;
}

export interface BriefCorrelation {
  id: string;
  text: string;
  entities: string[];
  sources: Array<{ itemType: string; itemId: string; provider: string }>;
}

export interface BriefChange {
  id: string;
  text: string;
  severity: "info" | "warning" | "critical";
  source?: { itemType: string; itemId: string; provider: string };
}

export interface BriefCalendarItem {
  id: string;
  text: string;
  eventId: string;
  startTime: string;
}

export interface BriefMetric {
  id: string;
  label: string;
  value: string;
  trend: "up" | "down" | "flat";
  context: string;
}

// ---------------------------------------------------------------------------
// Snapshot types (sent to the API for AI synthesis)
// ---------------------------------------------------------------------------

export interface BriefSnapshotItem {
  itemType: string;
  itemId: string;
  provider: string;
  title: string;
  preview: string;
  sender?: string;
  url?: string;
  score: number;
  timestamp: string;
  /** The full attention target for rich feedback if the user interacts with this item in the brief */
  attentionTarget: AttentionTarget;
}

export interface BriefSnapshotCalendar {
  eventId: string;
  subject: string;
  organizer: string;
  location: string;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  score: number;
  attentionTarget: AttentionTarget;
}

export interface BriefSnapshotPipeline {
  oppId: string;
  name: string;
  accountName: string;
  amount: number;
  stage: string;
  daysToClose: number;
  probability: number;
}

export interface BriefSnapshotOps {
  id: string;
  name: string;
  status: string;
  location: string;
}

export interface BriefSnapshot {
  communications: BriefSnapshotItem[];
  calendar: BriefSnapshotCalendar[];
  tasks: BriefSnapshotItem[];
  pipeline: BriefSnapshotPipeline[];
  operations: BriefSnapshotOps[];
  counts: {
    emailsNeedingReply: number;
    overdueTasks: number;
    meetingsToday: number;
    dealsClosingThisWeek: number;
  };
}

// ---------------------------------------------------------------------------
// Monday order type (local definition to avoid coupling to useMonday hook)
// ---------------------------------------------------------------------------

interface MondayOrder {
  id: string;
  name: string;
  status: string;
  location: string;
  monday_url: string;
}

// ---------------------------------------------------------------------------
// Snapshot builder
// ---------------------------------------------------------------------------

type ApplyTargetFn = (target: AttentionTarget) => AttentionItem;

function truncate(value: string | null | undefined, max: number) {
  const s = (value || "").trim();
  return s.length > max ? s.slice(0, max) + "..." : s;
}

function isToday(dateStr: string) {
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Los_Angeles",
  });
  const target = new Date(dateStr).toLocaleDateString("en-CA", {
    timeZone: "America/Los_Angeles",
  });
  return today === target;
}

function isThisWeek(dateStr: string) {
  const now = new Date();
  const target = new Date(dateStr);
  const diff = (target.getTime() - now.getTime()) / 86400000;
  return diff >= 0 && diff <= 7;
}

function orderNeedsAttention(status: string) {
  const upper = status.toUpperCase();
  return (
    upper.includes("DWG NEEDED") ||
    upper.includes("BONITA PO NEEDED") ||
    upper.includes("SALES ORDER NEEDED")
  );
}

export function buildBriefSnapshot(
  data: {
    emails: Email[];
    events: CalendarEvent[];
    tasks: Task[];
    comments: AsanaCommentThread[];
    chats: Chat[];
    slackMessages: SlackFeedMessage[];
    openOpps: SalesforceOpportunity[];
    orders: MondayOrder[];
  },
  applyTarget: ApplyTargetFn
): BriefSnapshot {
  // --- Score and rank communications ---
  const scoredComms: Array<{ item: BriefSnapshotItem; score: number }> = [];

  for (const email of data.emails.filter((e) => e.needs_reply).slice(0, 20)) {
    const target = buildEmailAttentionTarget(email, "morning_brief", 70);
    const attention = applyTarget(target);
    if (attention.hidden) continue;
    scoredComms.push({
      score: attention.finalScore,
      item: {
        itemType: "email",
        itemId: email.message_id || email.id,
        provider: "outlook_mail",
        title: truncate(email.subject, 200),
        preview: truncate(email.preview, 200),
        sender: email.from_name || email.from_email,
        url: email.outlook_url,
        score: attention.finalScore,
        timestamp: email.received_at,
        attentionTarget: target,
      },
    });
  }

  for (const chat of data.chats.slice(0, 10)) {
    const target = buildTeamsChatAttentionTarget(chat, "morning_brief", 56);
    const attention = applyTarget(target);
    if (attention.hidden) continue;
    scoredComms.push({
      score: attention.finalScore,
      item: {
        itemType: "teams_chat",
        itemId: chat.chat_id || chat.id,
        provider: "teams",
        title: truncate(chat.topic || "Teams Chat", 200),
        preview: truncate(chat.last_message_preview, 200),
        sender: chat.last_message_from || undefined,
        url: chat.web_url || undefined,
        score: attention.finalScore,
        timestamp: chat.last_activity,
        attentionTarget: target,
      },
    });
  }

  for (const msg of data.slackMessages.slice(0, 10)) {
    const target = buildSlackAttentionTarget(msg, "morning_brief", 54);
    const attention = applyTarget(target);
    if (attention.hidden) continue;
    scoredComms.push({
      score: attention.finalScore,
      item: {
        itemType: "slack_message",
        itemId: msg.message_ts || msg.id,
        provider: "slack",
        title: `#${msg.channel_name}`,
        preview: truncate(msg.text, 200),
        sender: msg.author_name || undefined,
        url: msg.permalink || undefined,
        score: attention.finalScore,
        timestamp: msg.timestamp,
        attentionTarget: target,
      },
    });
  }

  for (const comment of data.comments.slice(0, 10)) {
    const target = buildAsanaCommentAttentionTarget(comment, "morning_brief", 58);
    const attention = applyTarget(target);
    if (attention.hidden) continue;
    scoredComms.push({
      score: attention.finalScore,
      item: {
        itemType: "asana_comment",
        itemId: comment.id,
        provider: "asana",
        title: truncate(comment.task_name, 200),
        preview: truncate(comment.latest_comment_text, 200),
        sender: comment.latest_commenter_name || undefined,
        url: comment.permalink_url,
        score: attention.finalScore,
        timestamp: comment.latest_comment_at,
        attentionTarget: target,
      },
    });
  }

  const communications = scoredComms
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)
    .map((s) => s.item);

  // --- Score and rank calendar ---
  const todayEvents = data.events.filter((e) => isToday(e.start_time));
  const scoredCalendar = todayEvents
    .map((event) => {
      const target = buildCalendarAttentionTarget(
        event,
        "morning_brief",
        event.is_all_day ? 52 : 62
      );
      const attention = applyTarget(target);
      return { event, attention, target };
    })
    .filter((e) => !e.attention.hidden)
    .sort(
      (a, b) =>
        b.attention.finalScore - a.attention.finalScore ||
        new Date(a.event.start_time).getTime() - new Date(b.event.start_time).getTime()
    )
    .slice(0, 8);

  const calendar: BriefSnapshotCalendar[] = scoredCalendar.map(({ event, attention, target }) => ({
    eventId: event.event_id || event.id,
    subject: truncate(event.subject, 200),
    organizer: event.organizer || "",
    location: event.location || "",
    startTime: event.start_time,
    endTime: event.end_time,
    isAllDay: event.is_all_day,
    score: attention.finalScore,
    attentionTarget: target,
  }));

  // --- Score and rank tasks ---
  const scoredTasks = data.tasks
    .filter((t) => !t.completed)
    .map((task) => {
      const baseScore =
        task.days_overdue > 0 ? 72 : daysUntilDate(task.due_on) !== null && daysUntilDate(task.due_on)! <= 2 ? 62 : 50;
      const target = buildTaskAttentionTarget(task, "morning_brief", baseScore);
      const attention = applyTarget(target);
      return { task, attention, target };
    })
    .filter((t) => !t.attention.hidden)
    .sort((a, b) => {
      if (a.task.days_overdue !== b.task.days_overdue) return b.task.days_overdue - a.task.days_overdue;
      return b.attention.finalScore - a.attention.finalScore;
    })
    .slice(0, 10);

  const taskItems: BriefSnapshotItem[] = scoredTasks.map(({ task, attention, target }) => ({
    itemType: "asana_task",
    itemId: task.task_gid || task.id,
    provider: "asana",
    title: truncate(task.name, 200),
    preview: truncate(
      task.days_overdue > 0
        ? `${task.days_overdue}d overdue · ${task.project_name || "Task"}`
        : task.due_on
          ? `Due ${task.due_on} · ${task.project_name || "Task"}`
          : task.project_name || "No due date",
      200
    ),
    sender: task.assignee_name || undefined,
    url: task.permalink_url,
    score: attention.finalScore,
    timestamp: task.modified_at || task.synced_at,
    attentionTarget: target,
  }));

  // --- Pipeline at risk ---
  const pipeline: BriefSnapshotPipeline[] = data.openOpps
    .filter((opp) => opp.days_to_close <= 14 || (opp.days_in_stage != null && opp.days_in_stage > 30) || opp.has_overdue_task)
    .sort((a, b) => a.days_to_close - b.days_to_close)
    .slice(0, 5)
    .map((opp) => ({
      oppId: opp.sf_opportunity_id || opp.id,
      name: opp.name,
      accountName: opp.account_name,
      amount: opp.amount,
      stage: opp.stage,
      daysToClose: opp.days_to_close,
      probability: opp.probability,
    }));

  // --- Operations alerts ---
  const operations: BriefSnapshotOps[] = data.orders
    .filter((order) => orderNeedsAttention(order.status))
    .slice(0, 3)
    .map((order) => ({
      id: order.id,
      name: order.name,
      status: order.status,
      location: order.location,
    }));

  // --- Key counts ---
  const counts = {
    emailsNeedingReply: data.emails.filter((e) => e.needs_reply).length,
    overdueTasks: data.tasks.filter((t) => !t.completed && t.days_overdue > 0).length,
    meetingsToday: todayEvents.length,
    dealsClosingThisWeek: data.openOpps.filter((o) => isThisWeek(o.close_date)).length,
  };

  return { communications, calendar, tasks: taskItems, pipeline, operations, counts };
}

function daysUntilDate(value: string | null | undefined) {
  if (!value) return null;
  const today = new Date();
  const target = new Date(value);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

// ---------------------------------------------------------------------------
// Snapshot hash — deterministic string for cache invalidation
// ---------------------------------------------------------------------------

export function computeSnapshotHash(snapshot: BriefSnapshot): string {
  const parts = [
    `e:${snapshot.counts.emailsNeedingReply}`,
    `t:${snapshot.counts.overdueTasks}`,
    `c:${snapshot.counts.meetingsToday}`,
    `d:${snapshot.counts.dealsClosingThisWeek}`,
    `top:${snapshot.communications.slice(0, 5).map((c) => c.itemId).join(",")}`,
    `tasks:${snapshot.tasks.slice(0, 5).map((t) => t.itemId).join(",")}`,
  ];
  return parts.join("|");
}

// ---------------------------------------------------------------------------
// Build an AttentionTarget from a brief action for feedback
// ---------------------------------------------------------------------------

export function buildBriefActionTarget(
  action: BriefAction,
  originalTargets: Map<string, AttentionTarget>
): AttentionTarget {
  // Prefer the original full target (has resourceKeys, actorKeys for richer learning)
  const key = `${action.source.itemType}:${action.source.itemId}`;
  const original = originalTargets.get(key);
  if (original) {
    return { ...original, surface: "morning_brief" };
  }

  // Fallback: construct a minimal target from the action's source metadata
  return {
    provider: action.source.provider as AttentionTarget["provider"],
    itemType: action.source.itemType,
    itemId: action.source.itemId,
    title: action.source.title,
    timestamp: new Date().toISOString(),
    baseScore: action.attentionScore,
    surface: "morning_brief",
    resourceKeys: [],
    actorKeys: [],
    topicKeys: extractTopicKeys(action.source.title, action.text),
  };
}

// ---------------------------------------------------------------------------
// Build the original-targets lookup from the snapshot
// ---------------------------------------------------------------------------

export function buildOriginalTargetsMap(
  snapshot: BriefSnapshot
): Map<string, AttentionTarget> {
  const map = new Map<string, AttentionTarget>();

  for (const item of snapshot.communications) {
    map.set(`${item.itemType}:${item.itemId}`, item.attentionTarget);
  }
  for (const item of snapshot.tasks) {
    map.set(`${item.itemType}:${item.itemId}`, item.attentionTarget);
  }
  for (const item of snapshot.calendar) {
    map.set(`calendar_event:${item.eventId}`, item.attentionTarget);
  }

  return map;
}

// ---------------------------------------------------------------------------
// Format the snapshot into a prompt for Claude
// ---------------------------------------------------------------------------

export function buildBriefPrompt(snapshot: BriefSnapshot): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  });

  const lines: string[] = [
    `Today is ${dateStr}. Generate a morning brief.\n`,
  ];

  // Communications
  if (snapshot.communications.length > 0) {
    lines.push("## Top Communications (by attention score)");
    for (const item of snapshot.communications) {
      lines.push(
        `- [score:${item.score}] [${item.provider}] ${item.sender ? `From: ${item.sender} · ` : ""}${item.title} — ${item.preview} {source: {itemType:"${item.itemType}", itemId:"${item.itemId}", provider:"${item.provider}", title:"${item.title}"${item.url ? `, url:"${item.url}"` : ""}}}`
      );
    }
    lines.push("");
  }

  // Calendar
  if (snapshot.calendar.length > 0) {
    lines.push("## Today's Calendar");
    for (const event of snapshot.calendar) {
      const time = event.isAllDay
        ? "All day"
        : new Date(event.startTime).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
            timeZone: "America/Los_Angeles",
          });
      lines.push(
        `- ${time} · ${event.subject} · Organizer: ${event.organizer || "N/A"} · Location: ${event.location || "N/A"} {eventId:"${event.eventId}"}`
      );
    }
    lines.push("");
  }

  // Tasks
  if (snapshot.tasks.length > 0) {
    lines.push("## Priority Tasks");
    for (const task of snapshot.tasks) {
      lines.push(
        `- [score:${task.score}] ${task.title} — ${task.preview} {source: {itemType:"${task.itemType}", itemId:"${task.itemId}", provider:"${task.provider}", title:"${task.title}"${task.url ? `, url:"${task.url}"` : ""}}}`
      );
    }
    lines.push("");
  }

  // Pipeline
  if (snapshot.pipeline.length > 0) {
    lines.push("## Pipeline at Risk");
    for (const opp of snapshot.pipeline) {
      lines.push(
        `- ${opp.name} · ${opp.accountName} · $${opp.amount.toLocaleString()} · ${opp.stage} · closes in ${opp.daysToClose}d (${opp.probability}% prob)`
      );
    }
    lines.push("");
  }

  // Operations
  if (snapshot.operations.length > 0) {
    lines.push("## Operations Alerts");
    for (const order of snapshot.operations) {
      lines.push(`- ${order.name} · ${order.status} · ${order.location || "Location pending"}`);
    }
    lines.push("");
  }

  // Counts
  lines.push("## Key Counts");
  lines.push(`- Emails needing reply: ${snapshot.counts.emailsNeedingReply}`);
  lines.push(`- Overdue tasks: ${snapshot.counts.overdueTasks}`);
  lines.push(`- Meetings today: ${snapshot.counts.meetingsToday}`);
  lines.push(`- Deals closing this week: ${snapshot.counts.dealsClosingThisWeek}`);
  lines.push("");

  // Schema
  lines.push(`Return JSON matching this exact schema (no markdown fences, just JSON):
{
  "headline": "1-2 sentence executive summary",
  "priorityActions": [
    {
      "id": "action-0",
      "text": "Clear directive for the user",
      "urgency": "now" | "today" | "this-week",
      "source": { "itemType": "...", "itemId": "...", "provider": "...", "title": "...", "url": "..." },
      "attentionScore": number
    }
  ],
  "crossCorrelations": [
    {
      "id": "correlation-0",
      "text": "Cross-service insight connecting 2+ items",
      "entities": ["Person or deal name", ...],
      "sources": [{ "itemType": "...", "itemId": "...", "provider": "..." }]
    }
  ],
  "calendarHighlights": [
    {
      "id": "calendar-0",
      "text": "Why this meeting matters today",
      "eventId": "...",
      "startTime": "ISO string"
    }
  ],
  "overnightChanges": [
    {
      "id": "change-0",
      "text": "What happened or shifted",
      "severity": "info" | "warning" | "critical",
      "source": { "itemType": "...", "itemId": "...", "provider": "..." }
    }
  ],
  "keyNumbers": [
    {
      "id": "metric-0",
      "label": "Metric name",
      "value": "Display value",
      "trend": "up" | "down" | "flat",
      "context": "Brief context for the number"
    }
  ]
}

CRITICAL: For priorityActions, preserve the source object exactly as provided in the input data above. The source fields (itemType, itemId, provider, title) must match the original data.`);

  return lines.join("\n");
}
