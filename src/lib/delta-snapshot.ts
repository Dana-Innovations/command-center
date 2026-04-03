/**
 * Delta Feed snapshot utilities.
 *
 * Creates lightweight fingerprint maps from live data, diffs them to
 * detect changes, and persists snapshots + watermarks in localStorage.
 */

import type {
  Email,
  CalendarEvent,
  Task,
  Chat,
  SlackFeedMessage,
  SalesforceOpportunity,
} from "./types";

/* ── Types ── */

export interface DeltaItem {
  id: string;
  title: string;
  changeType: "new" | "updated" | "completed" | "stage_change";
  detail?: string;
  timestamp?: string;
}

export interface DeltaGroup {
  service: "emails" | "calendar" | "tasks" | "chats" | "slack" | "salesforce";
  label: string;
  count: number;
  items: DeltaItem[];
}

interface EmailFingerprint {
  is_read: boolean;
  needs_reply: boolean;
  from_name: string;
}

interface TaskFingerprint {
  completed: boolean;
  name: string;
}

interface CalendarFingerprint {
  subject: string;
  start_time: string;
}

interface SlackFingerprint {
  channel_name: string;
  author_name: string;
}

interface ChatFingerprint {
  last_activity: string;
}

interface OpportunityFingerprint {
  stage: string;
  amount: number;
}

export interface Snapshot {
  emails: Record<string, EmailFingerprint>;
  tasks: Record<string, TaskFingerprint>;
  calendar: Record<string, CalendarFingerprint>;
  slack: Record<string, SlackFingerprint>;
  chats: Record<string, ChatFingerprint>;
  opportunities: Record<string, OpportunityFingerprint>;
  savedAt: string;
}

/* ── Constants ── */

const SNAPSHOT_KEY = "command-center:delta-snapshot";
const WATERMARK_KEY = "command-center:delta-last-seen";
const MAX_ITEMS_PER_TYPE = 200;

/* ── Helpers ── */

/** Keep only the most recent `max` entries by sorting keys (stable enough). */
function prune<T>(map: Record<string, T>, max: number): Record<string, T> {
  const keys = Object.keys(map);
  if (keys.length <= max) return map;
  const pruned: Record<string, T> = {};
  for (const key of keys.slice(-max)) {
    pruned[key] = map[key];
  }
  return pruned;
}

/* ── Snapshot creation ── */

export interface SnapshotInput {
  emails: Email[];
  calendar: CalendarEvent[];
  tasks: Task[];
  chats: Chat[];
  slack: SlackFeedMessage[];
  opportunities: SalesforceOpportunity[];
}

export function createSnapshot(data: SnapshotInput): Snapshot {
  const emails: Record<string, EmailFingerprint> = {};
  for (const e of data.emails) {
    emails[e.message_id] = {
      is_read: e.is_read,
      needs_reply: e.needs_reply,
      from_name: e.from_name,
    };
  }

  const tasks: Record<string, TaskFingerprint> = {};
  for (const t of data.tasks) {
    tasks[t.task_gid] = { completed: t.completed, name: t.name };
  }

  const calendar: Record<string, CalendarFingerprint> = {};
  for (const c of data.calendar) {
    calendar[c.event_id] = { subject: c.subject, start_time: c.start_time };
  }

  const slack: Record<string, SlackFingerprint> = {};
  for (const s of data.slack) {
    slack[s.message_ts] = {
      channel_name: s.channel_name,
      author_name: s.author_name,
    };
  }

  const chats: Record<string, ChatFingerprint> = {};
  for (const ch of data.chats) {
    chats[ch.chat_id] = { last_activity: ch.last_activity };
  }

  const opportunities: Record<string, OpportunityFingerprint> = {};
  for (const o of data.opportunities) {
    opportunities[o.sf_opportunity_id] = { stage: o.stage, amount: o.amount };
  }

  return {
    emails: prune(emails, MAX_ITEMS_PER_TYPE),
    tasks: prune(tasks, MAX_ITEMS_PER_TYPE),
    calendar: prune(calendar, MAX_ITEMS_PER_TYPE),
    slack: prune(slack, MAX_ITEMS_PER_TYPE),
    chats: prune(chats, MAX_ITEMS_PER_TYPE),
    opportunities: prune(opportunities, MAX_ITEMS_PER_TYPE),
    savedAt: new Date().toISOString(),
  };
}

/* ── Snapshot diffing ── */

export function diffSnapshot(
  prev: Snapshot,
  current: Snapshot,
  currentData: SnapshotInput
): DeltaGroup[] {
  const groups: DeltaGroup[] = [];

  // Emails
  const emailItems: DeltaItem[] = [];
  for (const e of currentData.emails) {
    const old = prev.emails[e.message_id];
    if (!old) {
      emailItems.push({
        id: e.message_id,
        title: e.subject,
        changeType: "new",
        detail: e.from_name,
        timestamp: e.received_at,
      });
    } else if (old.is_read !== e.is_read || old.needs_reply !== e.needs_reply) {
      emailItems.push({
        id: e.message_id,
        title: e.subject,
        changeType: "updated",
        detail: e.from_name,
        timestamp: e.received_at,
      });
    }
  }
  if (emailItems.length > 0) {
    groups.push({
      service: "emails",
      label: "Email",
      count: emailItems.length,
      items: emailItems,
    });
  }

  // Tasks
  const taskItems: DeltaItem[] = [];
  for (const t of currentData.tasks) {
    const old = prev.tasks[t.task_gid];
    if (!old) {
      taskItems.push({
        id: t.task_gid,
        title: t.name,
        changeType: "new",
        detail: t.project_name,
        timestamp: t.modified_at ?? t.due_on,
      });
    } else if (!old.completed && t.completed) {
      taskItems.push({
        id: t.task_gid,
        title: t.name,
        changeType: "completed",
        detail: t.project_name,
      });
    } else if (old.name !== t.name) {
      taskItems.push({
        id: t.task_gid,
        title: t.name,
        changeType: "updated",
        detail: t.project_name,
      });
    }
  }
  if (taskItems.length > 0) {
    groups.push({
      service: "tasks",
      label: "Tasks",
      count: taskItems.length,
      items: taskItems,
    });
  }

  // Calendar
  const calendarItems: DeltaItem[] = [];
  for (const c of currentData.calendar) {
    const old = prev.calendar[c.event_id];
    if (!old) {
      calendarItems.push({
        id: c.event_id,
        title: c.subject,
        changeType: "new",
        detail: c.organizer,
        timestamp: c.start_time,
      });
    } else if (old.start_time !== c.start_time) {
      calendarItems.push({
        id: c.event_id,
        title: c.subject,
        changeType: "updated",
        detail: `Moved to ${new Date(c.start_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`,
        timestamp: c.start_time,
      });
    }
  }
  if (calendarItems.length > 0) {
    groups.push({
      service: "calendar",
      label: "Calendar",
      count: calendarItems.length,
      items: calendarItems,
    });
  }

  // Slack
  const slackItems: DeltaItem[] = [];
  for (const s of currentData.slack) {
    const old = prev.slack[s.message_ts];
    if (!old) {
      slackItems.push({
        id: s.message_ts,
        title: s.text?.slice(0, 80) ?? "New message",
        changeType: "new",
        detail: `#${s.channel_name} — ${s.author_name}`,
        timestamp: s.timestamp,
      });
    }
  }
  if (slackItems.length > 0) {
    groups.push({
      service: "slack",
      label: "Slack",
      count: slackItems.length,
      items: slackItems,
    });
  }

  // Chats (Teams)
  const chatItems: DeltaItem[] = [];
  for (const ch of currentData.chats) {
    const old = prev.chats[ch.chat_id];
    if (!old) {
      chatItems.push({
        id: ch.chat_id,
        title: ch.topic || ch.last_message_from,
        changeType: "new",
        detail: ch.last_message_preview?.slice(0, 80),
        timestamp: ch.last_activity,
      });
    } else if (old.last_activity !== ch.last_activity) {
      chatItems.push({
        id: ch.chat_id,
        title: ch.topic || ch.last_message_from,
        changeType: "updated",
        detail: ch.last_message_preview?.slice(0, 80),
        timestamp: ch.last_activity,
      });
    }
  }
  if (chatItems.length > 0) {
    groups.push({
      service: "chats",
      label: "Teams",
      count: chatItems.length,
      items: chatItems,
    });
  }

  // Salesforce Opportunities
  const oppItems: DeltaItem[] = [];
  for (const o of currentData.opportunities) {
    const old = prev.opportunities[o.sf_opportunity_id];
    if (!old) {
      oppItems.push({
        id: o.sf_opportunity_id,
        title: o.name,
        changeType: "new",
        detail: `${o.account_name} — $${(o.amount / 1000).toFixed(0)}K`,
      });
    } else if (old.stage !== o.stage) {
      oppItems.push({
        id: o.sf_opportunity_id,
        title: o.name,
        changeType: "stage_change",
        detail: `${o.account_name} → ${o.stage} ($${(o.amount / 1000).toFixed(0)}K)`,
      });
    } else if (old.amount !== o.amount) {
      oppItems.push({
        id: o.sf_opportunity_id,
        title: o.name,
        changeType: "updated",
        detail: `${o.account_name} — amount changed to $${(o.amount / 1000).toFixed(0)}K`,
      });
    }
  }
  if (oppItems.length > 0) {
    groups.push({
      service: "salesforce",
      label: "Pipeline",
      count: oppItems.length,
      items: oppItems,
    });
  }

  return groups;
}

/* ── localStorage persistence ── */

export function loadSnapshot(): Snapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Snapshot;
  } catch {
    return null;
  }
}

export function saveSnapshot(snapshot: Snapshot): void {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage full or unavailable — silently skip.
  }
}

export function loadWatermark(): Date | null {
  try {
    const raw = localStorage.getItem(WATERMARK_KEY);
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

export function saveWatermark(date: Date = new Date()): void {
  try {
    localStorage.setItem(WATERMARK_KEY, date.toISOString());
  } catch {
    // Storage full or unavailable — silently skip.
  }
}
