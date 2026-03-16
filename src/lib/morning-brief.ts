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

type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function ok<T>(value: T): ParseResult<T> {
  return { ok: true, value };
}

function fail(error: string): ParseResult<never> {
  return { ok: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseObject(
  value: unknown,
  path: string
): ParseResult<Record<string, unknown>> {
  if (!isRecord(value)) {
    return fail(`${path} must be an object`);
  }

  return ok(value);
}

function parseString(
  value: unknown,
  path: string,
  options: { optional: true; nonEmpty?: boolean }
): ParseResult<string | undefined>;
function parseString(
  value: unknown,
  path: string,
  options?: { optional?: false; nonEmpty?: boolean }
): ParseResult<string>;
function parseString(
  value: unknown,
  path: string,
  options?: { optional?: boolean; nonEmpty?: boolean }
): ParseResult<string | undefined> {
  if (value === undefined) {
    return options?.optional ? ok(undefined) : fail(`${path} is required`);
  }

  if (typeof value !== "string") {
    return fail(`${path} must be a string`);
  }

  if (options?.nonEmpty && value.trim().length === 0) {
    return fail(`${path} must not be empty`);
  }

  return ok(value);
}

function parseDateString(value: unknown, path: string): ParseResult<string> {
  const result = parseString(value, path, { nonEmpty: true });
  if (!result.ok) return result;

  if (Number.isNaN(Date.parse(result.value))) {
    return fail(`${path} must be a valid date string`);
  }

  return ok(result.value);
}

function parseNumber(value: unknown, path: string): ParseResult<number> {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fail(`${path} must be a finite number`);
  }

  return ok(value);
}

function parseBoolean(
  value: unknown,
  path: string,
  options: { optional: true }
): ParseResult<boolean | undefined>;
function parseBoolean(
  value: unknown,
  path: string,
  options?: { optional?: false }
): ParseResult<boolean>;
function parseBoolean(
  value: unknown,
  path: string,
  options?: { optional?: boolean }
): ParseResult<boolean | undefined> {
  if (value === undefined) {
    return options?.optional ? ok(undefined) : fail(`${path} is required`);
  }

  if (typeof value !== "boolean") {
    return fail(`${path} must be a boolean`);
  }

  return ok(value);
}

function parseStringArray(value: unknown, path: string): ParseResult<string[]> {
  if (!Array.isArray(value)) {
    return fail(`${path} must be an array`);
  }

  const parsed: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const entry = parseString(value[index], `${path}[${index}]`);
    if (!entry.ok) return entry;
    parsed.push(entry.value);
  }

  return ok(parsed);
}

function parseArray<T>(
  value: unknown,
  path: string,
  parser: (entry: unknown, path: string) => ParseResult<T>
): ParseResult<T[]> {
  if (!Array.isArray(value)) {
    return fail(`${path} must be an array`);
  }

  const parsed: T[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const entry = parser(value[index], `${path}[${index}]`);
    if (!entry.ok) return entry;
    parsed.push(entry.value);
  }

  return ok(parsed);
}

function parseLiteral<T extends string>(
  value: unknown,
  path: string,
  options: readonly T[]
): ParseResult<T> {
  const parsed = parseString(value, path, { nonEmpty: true });
  if (!parsed.ok) return parsed as ParseResult<T>;

  if (!options.includes(parsed.value as T)) {
    return fail(`${path} must be one of: ${options.join(", ")}`);
  }

  return ok(parsed.value as T);
}

function rejectAttentionTarget(
  record: Record<string, unknown>,
  path: string
): ParseResult<true> {
  if ("attentionTarget" in record) {
    return fail(`${path}.attentionTarget is not allowed`);
  }

  return ok(true);
}

// ---------------------------------------------------------------------------
// Brief output types (returned by the AI)
// ---------------------------------------------------------------------------

export interface BriefActionSource {
  itemType: string;
  itemId: string;
  provider: string;
  title: string;
  url?: string;
}

export interface BriefCorrelationSource {
  itemType: string;
  itemId: string;
  provider: string;
}

export interface BriefChangeSource {
  itemType: string;
  itemId: string;
  provider: string;
}

export interface BriefAction {
  id: string;
  text: string;
  urgency: "now" | "today" | "this-week";
  source: BriefActionSource;
  attentionScore: number;
}

export interface BriefCorrelation {
  id: string;
  text: string;
  entities: string[];
  sources: BriefCorrelationSource[];
}

export interface BriefChange {
  id: string;
  text: string;
  severity: "info" | "warning" | "critical";
  source?: BriefChangeSource;
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

export interface MorningBriefDraft {
  headline: string;
  priorityActions: BriefAction[];
  crossCorrelations: BriefCorrelation[];
  calendarHighlights: BriefCalendarItem[];
  overnightChanges: BriefChange[];
  keyNumbers: BriefMetric[];
}

export interface MorningBrief extends MorningBriefDraft {
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Snapshot types (client-side, include attention targets for feedback)
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

export interface BriefSnapshotCounts {
  emailsNeedingReply: number;
  overdueTasks: number;
  meetingsToday: number;
  dealsClosingThisWeek: number;
}

export interface BriefSnapshot {
  communications: BriefSnapshotItem[];
  calendar: BriefSnapshotCalendar[];
  tasks: BriefSnapshotItem[];
  pipeline: BriefSnapshotPipeline[];
  operations: BriefSnapshotOps[];
  counts: BriefSnapshotCounts;
}

// ---------------------------------------------------------------------------
// Server contract types (request/response payloads)
// ---------------------------------------------------------------------------

export type BriefApiSnapshotItem = Omit<BriefSnapshotItem, "attentionTarget">;

export type BriefApiSnapshotCalendar = Omit<
  BriefSnapshotCalendar,
  "attentionTarget"
>;

export interface BriefApiSnapshot {
  communications: BriefApiSnapshotItem[];
  calendar: BriefApiSnapshotCalendar[];
  tasks: BriefApiSnapshotItem[];
  pipeline: BriefSnapshotPipeline[];
  operations: BriefSnapshotOps[];
  counts: BriefSnapshotCounts;
}

export interface MorningBriefRequestBody {
  force?: boolean;
  snapshot: BriefApiSnapshot;
}

export interface MorningBriefResponseBody {
  brief: MorningBrief;
  cached: boolean;
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
  const normalized = (value || "").trim();
  return normalized.length > max
    ? `${normalized.slice(0, max)}...`
    : normalized;
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
  const scoredComms: Array<{ item: BriefSnapshotItem; score: number }> = [];
  const emailsNeedingReply = data.emails.filter((email) => email.needs_reply);

  for (const email of emailsNeedingReply.slice(0, 20)) {
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

  for (const message of data.slackMessages.slice(0, 10)) {
    const target = buildSlackAttentionTarget(message, "morning_brief", 54);
    const attention = applyTarget(target);
    if (attention.hidden) continue;

    scoredComms.push({
      score: attention.finalScore,
      item: {
        itemType: "slack_message",
        itemId: message.message_ts || message.id,
        provider: "slack",
        title: `#${message.channel_name}`,
        preview: truncate(message.text, 200),
        sender: message.author_name || undefined,
        url: message.permalink || undefined,
        score: attention.finalScore,
        timestamp: message.timestamp,
        attentionTarget: target,
      },
    });
  }

  for (const comment of data.comments.slice(0, 10)) {
    const target = buildAsanaCommentAttentionTarget(
      comment,
      "morning_brief",
      58
    );
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
    .sort((left, right) => right.score - left.score)
    .slice(0, 15)
    .map((entry) => entry.item);

  const todayEvents = data.events.filter((event) => isToday(event.start_time));
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
    .filter((entry) => !entry.attention.hidden)
    .sort(
      (left, right) =>
        right.attention.finalScore - left.attention.finalScore ||
        new Date(left.event.start_time).getTime() -
          new Date(right.event.start_time).getTime()
    )
    .slice(0, 8);

  const calendar: BriefSnapshotCalendar[] = scoredCalendar.map(
    ({ event, attention, target }) => ({
      eventId: event.event_id || event.id,
      subject: truncate(event.subject, 200),
      organizer: event.organizer || "",
      location: event.location || "",
      startTime: event.start_time,
      endTime: event.end_time,
      isAllDay: event.is_all_day,
      score: attention.finalScore,
      attentionTarget: target,
    })
  );

  const scoredTasks = data.tasks
    .filter((task) => !task.completed)
    .map((task) => {
      const daysLeft = daysUntilDate(task.due_on);
      const baseScore =
        task.days_overdue > 0
          ? 72
          : daysLeft !== null && daysLeft <= 2
            ? 62
            : 50;
      const target = buildTaskAttentionTarget(task, "morning_brief", baseScore);
      const attention = applyTarget(target);
      return { task, attention, target };
    })
    .filter((entry) => !entry.attention.hidden)
    .sort((left, right) => {
      if (left.task.days_overdue !== right.task.days_overdue) {
        return right.task.days_overdue - left.task.days_overdue;
      }

      return right.attention.finalScore - left.attention.finalScore;
    })
    .slice(0, 10);

  const tasks: BriefSnapshotItem[] = scoredTasks.map(
    ({ task, attention, target }) => ({
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
    })
  );

  const pipeline: BriefSnapshotPipeline[] = data.openOpps
    .filter(
      (opp) =>
        opp.days_to_close <= 14 ||
        (opp.days_in_stage != null && opp.days_in_stage > 30) ||
        opp.has_overdue_task
    )
    .sort((left, right) => left.days_to_close - right.days_to_close)
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

  const operations: BriefSnapshotOps[] = data.orders
    .filter((order) => orderNeedsAttention(order.status))
    .slice(0, 3)
    .map((order) => ({
      id: order.id,
      name: order.name,
      status: order.status,
      location: order.location,
    }));

  const counts: BriefSnapshotCounts = {
    emailsNeedingReply: emailsNeedingReply.length,
    overdueTasks: data.tasks.filter(
      (task) => !task.completed && task.days_overdue > 0
    ).length,
    meetingsToday: todayEvents.length,
    dealsClosingThisWeek: data.openOpps.filter((opp) =>
      isThisWeek(opp.close_date)
    ).length,
  };

  return { communications, calendar, tasks, pipeline, operations, counts };
}

function daysUntilDate(value: string | null | undefined) {
  if (!value) return null;

  const today = new Date();
  const target = new Date(value);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

export function stripAttentionTargetsFromBriefSnapshot(
  snapshot: BriefSnapshot
): BriefApiSnapshot {
  const stripItem = (item: BriefSnapshotItem): BriefApiSnapshotItem => {
    const { attentionTarget, ...rest } = item;
    void attentionTarget;
    return rest;
  };
  const stripCalendar = (
    item: BriefSnapshotCalendar
  ): BriefApiSnapshotCalendar => {
    const { attentionTarget, ...rest } = item;
    void attentionTarget;
    return rest;
  };

  return {
    ...snapshot,
    communications: snapshot.communications.map(stripItem),
    calendar: snapshot.calendar.map(stripCalendar),
    tasks: snapshot.tasks.map(stripItem),
  };
}

// ---------------------------------------------------------------------------
// Snapshot hash — deterministic string for cache invalidation
// ---------------------------------------------------------------------------

export function computeSnapshotHash(snapshot: {
  communications: Array<Pick<BriefSnapshotItem, "itemId">>;
  calendar: Array<Pick<BriefSnapshotCalendar, "eventId" | "startTime">>;
  tasks: Array<Pick<BriefSnapshotItem, "itemId">>;
  pipeline: Array<
    Pick<
      BriefSnapshotPipeline,
      "oppId" | "stage" | "daysToClose" | "amount"
    >
  >;
  operations: Array<Pick<BriefSnapshotOps, "id" | "status" | "location">>;
  counts: BriefSnapshotCounts;
}) {
  const parts = [
    `e:${snapshot.counts.emailsNeedingReply}`,
    `t:${snapshot.counts.overdueTasks}`,
    `c:${snapshot.counts.meetingsToday}`,
    `d:${snapshot.counts.dealsClosingThisWeek}`,
    `comm:${snapshot.communications
      .slice(0, 5)
      .map((item) => item.itemId)
      .join(",")}`,
    `cal:${snapshot.calendar
      .slice(0, 5)
      .map((item) => `${item.eventId}@${item.startTime}`)
      .join(",")}`,
    `tasks:${snapshot.tasks
      .slice(0, 5)
      .map((item) => item.itemId)
      .join(",")}`,
    `pipe:${snapshot.pipeline
      .slice(0, 5)
      .map(
        (item) =>
          `${item.oppId}:${item.stage}:${item.daysToClose}:${item.amount}`
      )
      .join(",")}`,
    `ops:${snapshot.operations
      .slice(0, 3)
      .map((item) => `${item.id}:${item.status}:${item.location}`)
      .join(",")}`,
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
  const key = `${action.source.itemType}:${action.source.itemId}`;
  const original = originalTargets.get(key);
  if (original) {
    return { ...original, surface: "morning_brief" };
  }

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
// Request/response validation
// ---------------------------------------------------------------------------

function parseBriefActionSource(
  value: unknown,
  path: string
): ParseResult<BriefActionSource> {
  const record = parseObject(value, path);
  if (!record.ok) return record;

  const itemType = parseString(record.value.itemType, `${path}.itemType`, {
    nonEmpty: true,
  });
  if (!itemType.ok) return itemType;

  const itemId = parseString(record.value.itemId, `${path}.itemId`, {
    nonEmpty: true,
  });
  if (!itemId.ok) return itemId;

  const provider = parseString(record.value.provider, `${path}.provider`, {
    nonEmpty: true,
  });
  if (!provider.ok) return provider;

  const title = parseString(record.value.title, `${path}.title`);
  if (!title.ok) return title;

  const url = parseString(record.value.url, `${path}.url`, { optional: true });
  if (!url.ok) return url;

  return ok({
    itemType: itemType.value,
    itemId: itemId.value,
    provider: provider.value,
    title: title.value,
    ...(url.value !== undefined ? { url: url.value } : {}),
  });
}

function parseBriefCorrelationSource(
  value: unknown,
  path: string
): ParseResult<BriefCorrelationSource> {
  const record = parseObject(value, path);
  if (!record.ok) return record;

  const itemType = parseString(record.value.itemType, `${path}.itemType`, {
    nonEmpty: true,
  });
  if (!itemType.ok) return itemType;

  const itemId = parseString(record.value.itemId, `${path}.itemId`, {
    nonEmpty: true,
  });
  if (!itemId.ok) return itemId;

  const provider = parseString(record.value.provider, `${path}.provider`, {
    nonEmpty: true,
  });
  if (!provider.ok) return provider;

  return ok({
    itemType: itemType.value,
    itemId: itemId.value,
    provider: provider.value,
  });
}

function parseBriefChangeSource(
  value: unknown,
  path: string
): ParseResult<BriefChangeSource> {
  return parseBriefCorrelationSource(value, path);
}

function parseBriefAction(value: unknown, path: string): ParseResult<BriefAction> {
  const record = parseObject(value, path);
  if (!record.ok) return record;

  const id = parseString(record.value.id, `${path}.id`, { nonEmpty: true });
  if (!id.ok) return id;

  const text = parseString(record.value.text, `${path}.text`);
  if (!text.ok) return text;

  const urgency = parseLiteral(record.value.urgency, `${path}.urgency`, [
    "now",
    "today",
    "this-week",
  ] as const);
  if (!urgency.ok) return urgency;

  const source = parseBriefActionSource(record.value.source, `${path}.source`);
  if (!source.ok) return source;

  const attentionScore = parseNumber(
    record.value.attentionScore,
    `${path}.attentionScore`
  );
  if (!attentionScore.ok) return attentionScore;

  return ok({
    id: id.value,
    text: text.value,
    urgency: urgency.value,
    source: source.value,
    attentionScore: attentionScore.value,
  });
}

function parseBriefCorrelation(
  value: unknown,
  path: string
): ParseResult<BriefCorrelation> {
  const record = parseObject(value, path);
  if (!record.ok) return record;

  const id = parseString(record.value.id, `${path}.id`, { nonEmpty: true });
  if (!id.ok) return id;

  const text = parseString(record.value.text, `${path}.text`);
  if (!text.ok) return text;

  const entities = parseStringArray(record.value.entities, `${path}.entities`);
  if (!entities.ok) return entities;

  const sources = parseArray(
    record.value.sources,
    `${path}.sources`,
    parseBriefCorrelationSource
  );
  if (!sources.ok) return sources;

  return ok({
    id: id.value,
    text: text.value,
    entities: entities.value,
    sources: sources.value,
  });
}

function parseBriefCalendarItem(
  value: unknown,
  path: string
): ParseResult<BriefCalendarItem> {
  const record = parseObject(value, path);
  if (!record.ok) return record;

  const id = parseString(record.value.id, `${path}.id`, { nonEmpty: true });
  if (!id.ok) return id;

  const text = parseString(record.value.text, `${path}.text`);
  if (!text.ok) return text;

  const eventId = parseString(record.value.eventId, `${path}.eventId`, {
    nonEmpty: true,
  });
  if (!eventId.ok) return eventId;

  const startTime = parseDateString(
    record.value.startTime,
    `${path}.startTime`
  );
  if (!startTime.ok) return startTime;

  return ok({
    id: id.value,
    text: text.value,
    eventId: eventId.value,
    startTime: startTime.value,
  });
}

function parseBriefChange(value: unknown, path: string): ParseResult<BriefChange> {
  const record = parseObject(value, path);
  if (!record.ok) return record;

  const id = parseString(record.value.id, `${path}.id`, { nonEmpty: true });
  if (!id.ok) return id;

  const text = parseString(record.value.text, `${path}.text`);
  if (!text.ok) return text;

  const severity = parseLiteral(record.value.severity, `${path}.severity`, [
    "info",
    "warning",
    "critical",
  ] as const);
  if (!severity.ok) return severity;

  let source: BriefChangeSource | undefined;
  if (record.value.source !== undefined) {
    const parsedSource = parseBriefChangeSource(
      record.value.source,
      `${path}.source`
    );
    if (!parsedSource.ok) return parsedSource;
    source = parsedSource.value;
  }

  return ok({
    id: id.value,
    text: text.value,
    severity: severity.value,
    ...(source ? { source } : {}),
  });
}

function parseBriefMetric(value: unknown, path: string): ParseResult<BriefMetric> {
  const record = parseObject(value, path);
  if (!record.ok) return record;

  const id = parseString(record.value.id, `${path}.id`, { nonEmpty: true });
  if (!id.ok) return id;

  const label = parseString(record.value.label, `${path}.label`);
  if (!label.ok) return label;

  const metricValue = parseString(record.value.value, `${path}.value`);
  if (!metricValue.ok) return metricValue;

  const trend = parseLiteral(record.value.trend, `${path}.trend`, [
    "up",
    "down",
    "flat",
  ] as const);
  if (!trend.ok) return trend;

  const context = parseString(record.value.context, `${path}.context`);
  if (!context.ok) return context;

  return ok({
    id: id.value,
    label: label.value,
    value: metricValue.value,
    trend: trend.value,
    context: context.value,
  });
}

function parseBriefApiSnapshotItem(
  value: unknown,
  path: string
): ParseResult<BriefApiSnapshotItem> {
  const record = parseObject(value, path);
  if (!record.ok) return record;

  const noAttentionTarget = rejectAttentionTarget(record.value, path);
  if (!noAttentionTarget.ok) return noAttentionTarget;

  const itemType = parseString(record.value.itemType, `${path}.itemType`, {
    nonEmpty: true,
  });
  if (!itemType.ok) return itemType;

  const itemId = parseString(record.value.itemId, `${path}.itemId`, {
    nonEmpty: true,
  });
  if (!itemId.ok) return itemId;

  const provider = parseString(record.value.provider, `${path}.provider`, {
    nonEmpty: true,
  });
  if (!provider.ok) return provider;

  const title = parseString(record.value.title, `${path}.title`);
  if (!title.ok) return title;

  const preview = parseString(record.value.preview, `${path}.preview`);
  if (!preview.ok) return preview;

  const sender = parseString(record.value.sender, `${path}.sender`, {
    optional: true,
  });
  if (!sender.ok) return sender;

  const url = parseString(record.value.url, `${path}.url`, { optional: true });
  if (!url.ok) return url;

  const score = parseNumber(record.value.score, `${path}.score`);
  if (!score.ok) return score;

  const timestamp = parseDateString(record.value.timestamp, `${path}.timestamp`);
  if (!timestamp.ok) return timestamp;

  return ok({
    itemType: itemType.value,
    itemId: itemId.value,
    provider: provider.value,
    title: title.value,
    preview: preview.value,
    ...(sender.value !== undefined ? { sender: sender.value } : {}),
    ...(url.value !== undefined ? { url: url.value } : {}),
    score: score.value,
    timestamp: timestamp.value,
  });
}

function parseBriefApiSnapshotCalendar(
  value: unknown,
  path: string
): ParseResult<BriefApiSnapshotCalendar> {
  const record = parseObject(value, path);
  if (!record.ok) return record;

  const noAttentionTarget = rejectAttentionTarget(record.value, path);
  if (!noAttentionTarget.ok) return noAttentionTarget;

  const eventId = parseString(record.value.eventId, `${path}.eventId`, {
    nonEmpty: true,
  });
  if (!eventId.ok) return eventId;

  const subject = parseString(record.value.subject, `${path}.subject`);
  if (!subject.ok) return subject;

  const organizer = parseString(record.value.organizer, `${path}.organizer`);
  if (!organizer.ok) return organizer;

  const location = parseString(record.value.location, `${path}.location`);
  if (!location.ok) return location;

  const startTime = parseDateString(record.value.startTime, `${path}.startTime`);
  if (!startTime.ok) return startTime;

  const endTime = parseDateString(record.value.endTime, `${path}.endTime`);
  if (!endTime.ok) return endTime;

  const isAllDay = parseBoolean(record.value.isAllDay, `${path}.isAllDay`);
  if (!isAllDay.ok) return isAllDay;

  const score = parseNumber(record.value.score, `${path}.score`);
  if (!score.ok) return score;

  return ok({
    eventId: eventId.value,
    subject: subject.value,
    organizer: organizer.value,
    location: location.value,
    startTime: startTime.value,
    endTime: endTime.value,
    isAllDay: isAllDay.value,
    score: score.value,
  });
}

function parseBriefSnapshotPipeline(
  value: unknown,
  path: string
): ParseResult<BriefSnapshotPipeline> {
  const record = parseObject(value, path);
  if (!record.ok) return record;

  const oppId = parseString(record.value.oppId, `${path}.oppId`, {
    nonEmpty: true,
  });
  if (!oppId.ok) return oppId;

  const name = parseString(record.value.name, `${path}.name`);
  if (!name.ok) return name;

  const accountName = parseString(record.value.accountName, `${path}.accountName`);
  if (!accountName.ok) return accountName;

  const amount = parseNumber(record.value.amount, `${path}.amount`);
  if (!amount.ok) return amount;

  const stage = parseString(record.value.stage, `${path}.stage`);
  if (!stage.ok) return stage;

  const daysToClose = parseNumber(record.value.daysToClose, `${path}.daysToClose`);
  if (!daysToClose.ok) return daysToClose;

  const probability = parseNumber(
    record.value.probability,
    `${path}.probability`
  );
  if (!probability.ok) return probability;

  return ok({
    oppId: oppId.value,
    name: name.value,
    accountName: accountName.value,
    amount: amount.value,
    stage: stage.value,
    daysToClose: daysToClose.value,
    probability: probability.value,
  });
}

function parseBriefSnapshotOps(
  value: unknown,
  path: string
): ParseResult<BriefSnapshotOps> {
  const record = parseObject(value, path);
  if (!record.ok) return record;

  const id = parseString(record.value.id, `${path}.id`, { nonEmpty: true });
  if (!id.ok) return id;

  const name = parseString(record.value.name, `${path}.name`);
  if (!name.ok) return name;

  const status = parseString(record.value.status, `${path}.status`);
  if (!status.ok) return status;

  const location = parseString(record.value.location, `${path}.location`);
  if (!location.ok) return location;

  return ok({
    id: id.value,
    name: name.value,
    status: status.value,
    location: location.value,
  });
}

function parseBriefSnapshotCounts(
  value: unknown,
  path: string
): ParseResult<BriefSnapshotCounts> {
  const record = parseObject(value, path);
  if (!record.ok) return record;

  const emailsNeedingReply = parseNumber(
    record.value.emailsNeedingReply,
    `${path}.emailsNeedingReply`
  );
  if (!emailsNeedingReply.ok) return emailsNeedingReply;

  const overdueTasks = parseNumber(
    record.value.overdueTasks,
    `${path}.overdueTasks`
  );
  if (!overdueTasks.ok) return overdueTasks;

  const meetingsToday = parseNumber(
    record.value.meetingsToday,
    `${path}.meetingsToday`
  );
  if (!meetingsToday.ok) return meetingsToday;

  const dealsClosingThisWeek = parseNumber(
    record.value.dealsClosingThisWeek,
    `${path}.dealsClosingThisWeek`
  );
  if (!dealsClosingThisWeek.ok) return dealsClosingThisWeek;

  return ok({
    emailsNeedingReply: emailsNeedingReply.value,
    overdueTasks: overdueTasks.value,
    meetingsToday: meetingsToday.value,
    dealsClosingThisWeek: dealsClosingThisWeek.value,
  });
}

export function parseMorningBriefRequestBody(
  value: unknown
): ParseResult<MorningBriefRequestBody> {
  const record = parseObject(value, "body");
  if (!record.ok) return record;

  const force = parseBoolean(record.value.force, "body.force", {
    optional: true,
  });
  if (!force.ok) return force;

  const snapshot = parseBriefApiSnapshot(record.value.snapshot, "body.snapshot");
  if (!snapshot.ok) return snapshot;

  return ok({
    ...(force.value !== undefined ? { force: force.value } : {}),
    snapshot: snapshot.value,
  });
}

export function parseMorningBriefDraft(
  value: unknown
): ParseResult<MorningBriefDraft> {
  const record = parseObject(value, "brief");
  if (!record.ok) return record;

  const headline = parseString(record.value.headline, "brief.headline");
  if (!headline.ok) return headline;

  const priorityActions = parseArray(
    record.value.priorityActions,
    "brief.priorityActions",
    parseBriefAction
  );
  if (!priorityActions.ok) return priorityActions;

  const crossCorrelations = parseArray(
    record.value.crossCorrelations,
    "brief.crossCorrelations",
    parseBriefCorrelation
  );
  if (!crossCorrelations.ok) return crossCorrelations;

  const calendarHighlights = parseArray(
    record.value.calendarHighlights,
    "brief.calendarHighlights",
    parseBriefCalendarItem
  );
  if (!calendarHighlights.ok) return calendarHighlights;

  const overnightChanges = parseArray(
    record.value.overnightChanges,
    "brief.overnightChanges",
    parseBriefChange
  );
  if (!overnightChanges.ok) return overnightChanges;

  const keyNumbers = parseArray(
    record.value.keyNumbers,
    "brief.keyNumbers",
    parseBriefMetric
  );
  if (!keyNumbers.ok) return keyNumbers;

  return ok({
    headline: headline.value,
    priorityActions: priorityActions.value,
    crossCorrelations: crossCorrelations.value,
    calendarHighlights: calendarHighlights.value,
    overnightChanges: overnightChanges.value,
    keyNumbers: keyNumbers.value,
  });
}

export function parseStoredMorningBrief(
  value: unknown
): ParseResult<MorningBrief> {
  const record = parseObject(value, "cachedBrief");
  if (!record.ok) return record;

  const generatedAt = parseDateString(
    record.value.generatedAt,
    "cachedBrief.generatedAt"
  );
  if (!generatedAt.ok) return generatedAt;

  const draft = parseMorningBriefDraft({
    headline: record.value.headline,
    priorityActions: record.value.priorityActions,
    crossCorrelations: record.value.crossCorrelations,
    calendarHighlights: record.value.calendarHighlights,
    overnightChanges: record.value.overnightChanges,
    keyNumbers: record.value.keyNumbers,
  });
  if (!draft.ok) return draft;

  return ok({
    generatedAt: generatedAt.value,
    ...draft.value,
  });
}

function parseBriefApiSnapshot(
  value: unknown,
  path: string
): ParseResult<BriefApiSnapshot> {
  const record = parseObject(value, path);
  if (!record.ok) return record;

  const communications = parseArray(
    record.value.communications,
    `${path}.communications`,
    parseBriefApiSnapshotItem
  );
  if (!communications.ok) return communications;

  const calendar = parseArray(
    record.value.calendar,
    `${path}.calendar`,
    parseBriefApiSnapshotCalendar
  );
  if (!calendar.ok) return calendar;

  const tasks = parseArray(
    record.value.tasks,
    `${path}.tasks`,
    parseBriefApiSnapshotItem
  );
  if (!tasks.ok) return tasks;

  const pipeline = parseArray(
    record.value.pipeline,
    `${path}.pipeline`,
    parseBriefSnapshotPipeline
  );
  if (!pipeline.ok) return pipeline;

  const operations = parseArray(
    record.value.operations,
    `${path}.operations`,
    parseBriefSnapshotOps
  );
  if (!operations.ok) return operations;

  const counts = parseBriefSnapshotCounts(record.value.counts, `${path}.counts`);
  if (!counts.ok) return counts;

  return ok({
    communications: communications.value,
    calendar: calendar.value,
    tasks: tasks.value,
    pipeline: pipeline.value,
    operations: operations.value,
    counts: counts.value,
  });
}

// ---------------------------------------------------------------------------
// Format the snapshot into an escape-safe prompt
// ---------------------------------------------------------------------------

const MORNING_BRIEF_RESPONSE_SCHEMA_EXAMPLE: MorningBriefDraft = {
  headline: "1-2 sentence executive summary",
  priorityActions: [
    {
      id: "action-0",
      text: "Clear directive for the user",
      urgency: "now",
      source: {
        itemType: "email",
        itemId: "source-id",
        provider: "outlook_mail",
        title: "Original source title",
        url: "https://example.com",
      },
      attentionScore: 72,
    },
  ],
  crossCorrelations: [
    {
      id: "correlation-0",
      text: "Cross-service insight connecting 2+ items",
      entities: ["Person or deal name"],
      sources: [
        {
          itemType: "email",
          itemId: "source-id",
          provider: "outlook_mail",
        },
      ],
    },
  ],
  calendarHighlights: [
    {
      id: "calendar-0",
      text: "Why this meeting matters today",
      eventId: "event-id",
      startTime: new Date("2026-01-01T09:00:00.000Z").toISOString(),
    },
  ],
  overnightChanges: [
    {
      id: "change-0",
      text: "What happened or shifted",
      severity: "warning",
      source: {
        itemType: "asana_task",
        itemId: "task-id",
        provider: "asana",
      },
    },
  ],
  keyNumbers: [
    {
      id: "metric-0",
      label: "Metric name",
      value: "12",
      trend: "flat",
      context: "Brief context for the number",
    },
  ],
};

function buildPromptSource(item: BriefApiSnapshotItem): BriefActionSource {
  return {
    itemType: item.itemType,
    itemId: item.itemId,
    provider: item.provider,
    title: item.title,
    ...(item.url ? { url: item.url } : {}),
  };
}

function serializePromptSnapshot(snapshot: BriefApiSnapshot) {
  return {
    communications: snapshot.communications.map((item) => ({
      score: item.score,
      timestamp: item.timestamp,
      sender: item.sender ?? null,
      title: item.title,
      preview: item.preview,
      source: buildPromptSource(item),
    })),
    calendar: snapshot.calendar.map((event) => ({
      eventId: event.eventId,
      subject: event.subject,
      organizer: event.organizer,
      location: event.location,
      startTime: event.startTime,
      endTime: event.endTime,
      isAllDay: event.isAllDay,
      score: event.score,
    })),
    tasks: snapshot.tasks.map((item) => ({
      score: item.score,
      timestamp: item.timestamp,
      sender: item.sender ?? null,
      title: item.title,
      preview: item.preview,
      source: buildPromptSource(item),
    })),
    pipeline: snapshot.pipeline,
    operations: snapshot.operations,
    counts: snapshot.counts,
  };
}

export function buildBriefPrompt(snapshot: BriefApiSnapshot) {
  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  });

  const promptPayload = {
    today: dateStr,
    instructions: {
      headline: "1-2 sentences maximum",
      priorities: [
        "Name specific people, deals, and projects when supported by the data",
        "Prioritize actions due today or already overdue",
        "Highlight cross-service correlations across communication, calendar, pipeline, and operations",
        "Use severity levels where critical means hours, warning means today, info means awareness only",
      ],
      preservePriorityActionSourceExactly: true,
      returnJsonOnly: true,
    },
    snapshot: serializePromptSnapshot(snapshot),
    responseSchema: MORNING_BRIEF_RESPONSE_SCHEMA_EXAMPLE,
  };

  return [
    "Generate an executive morning brief from the structured JSON payload below.",
    "For each priority action, copy the `source` object exactly from the input item you are referencing.",
    JSON.stringify(promptPayload, null, 2),
  ].join("\n\n");
}
