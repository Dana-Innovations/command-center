import type {
  CalendarEvent,
  Email,
  Task,
  AsanaCommentThread,
  Chat,
  SlackFeedMessage,
  SalesforceOpportunity,
} from "@/lib/types";
import type { AttentionItem, AttentionTarget } from "@/lib/attention/types";
import type { TabId } from "@/lib/tab-config";
import {
  buildCalendarAttentionTarget,
  buildEmailAttentionTarget,
  buildTaskAttentionTarget,
  buildAsanaCommentAttentionTarget,
  buildTeamsChatAttentionTarget,
  buildSlackAttentionTarget,
} from "@/lib/attention/targets";

// ── Types ────────────────────────────────────────────────────────────────────

export type AgendaSuggestionKind =
  | "email"
  | "task"
  | "chat"
  | "slack"
  | "asana"
  | "salesforce"
  | "meeting-prep";

export interface AgendaSuggestion {
  id: string;
  kind: AgendaSuggestionKind;
  title: string;
  subtitle: string;
  estimatedMinutes: number;
  attentionScore: number;
  url: string | null;
  navigateTab: TabId | null;
  /** eventId for meeting-prep items */
  prepEventId?: string;
}

export interface AgendaMeetingBlock {
  kind: "meeting";
  id: string;
  startTime: Date;
  endTime: Date;
  durationMin: number;
  event: CalendarEvent;
  attentionScore: number;
}

export interface AgendaFreeTimeBlock {
  kind: "free-time";
  id: string;
  startTime: Date;
  endTime: Date;
  durationMin: number;
  suggestions: AgendaSuggestion[];
  totalSuggestedMin: number;
}

export type AgendaBlock = AgendaMeetingBlock | AgendaFreeTimeBlock;

export interface SmartAgendaData {
  blocks: AgendaBlock[];
  windowStart: Date;
  windowEnd: Date;
  hasCalendar: boolean;
  hasActionableItems: boolean;
}

// ── Time Estimation ──────────────────────────────────────────────────────────

export function estimateEmailMinutes(email: Email): number {
  if (email.has_attachments) return 8;
  if ((email.preview?.length ?? 0) > 100) return 5;
  return 3;
}

export function estimateTaskMinutes(task: Task): number {
  if (task.days_overdue >= 3) return 20;
  if (task.num_subtasks && task.num_subtasks > 0) return 15;
  return 10;
}

export function estimateMeetingPrepMinutes(meetingDurationMin: number): number {
  return Math.min(20, Math.max(10, Math.round(meetingDurationMin * 0.3)));
}

// ── Candidate Pool Builder ───────────────────────────────────────────────────

interface CandidatePoolInput {
  emails: Email[];
  tasks: Task[];
  comments: AsanaCommentThread[];
  chats: Chat[];
  slackMessages: SlackFeedMessage[];
  openOpps: SalesforceOpportunity[];
}

export function buildCandidatePool(
  data: CandidatePoolInput,
  applyTarget: (t: AttentionTarget) => AttentionItem
): AgendaSuggestion[] {
  const candidates: AgendaSuggestion[] = [];

  // Emails needing reply
  data.emails
    .filter((e) => e.needs_reply)
    .forEach((email) => {
      const target = buildEmailAttentionTarget(email, "smart-agenda", 70);
      const attention = applyTarget(target);
      if (attention.hidden) return;
      candidates.push({
        id: `agenda-email-${email.id}`,
        kind: "email",
        title: email.subject || "(no subject)",
        subtitle: email.from_name || email.from_email,
        estimatedMinutes: estimateEmailMinutes(email),
        attentionScore: attention.finalScore,
        url: email.outlook_url,
        navigateTab: "communications",
      });
    });

  // Incomplete Asana tasks
  data.tasks
    .filter((t) => !t.completed)
    .forEach((task) => {
      const baseScore =
        task.days_overdue > 0 ? 72 : 50;
      const target = buildTaskAttentionTarget(task, "smart-agenda", baseScore);
      const attention = applyTarget(target);
      if (attention.hidden) return;
      candidates.push({
        id: `agenda-task-${task.id}`,
        kind: "task",
        title: task.name,
        subtitle: task.project_name || "Task",
        estimatedMinutes: estimateTaskMinutes(task),
        attentionScore: attention.finalScore,
        url: task.permalink_url,
        navigateTab: "operations",
      });
    });

  // Asana comment threads needing response
  data.comments.forEach((thread) => {
    const target = buildAsanaCommentAttentionTarget(
      thread,
      "smart-agenda",
      58
    );
    const attention = applyTarget(target);
    if (attention.hidden) return;
    candidates.push({
      id: `agenda-asana-${thread.id}`,
      kind: "asana",
      title: thread.task_name,
      subtitle: thread.latest_commenter_name,
      estimatedMinutes: 5,
      attentionScore: attention.finalScore,
      url: thread.permalink_url,
      navigateTab: "communications",
    });
  });

  // Teams chats
  data.chats.forEach((chat) => {
    const target = buildTeamsChatAttentionTarget(chat, "smart-agenda", 56);
    const attention = applyTarget(target);
    if (attention.hidden) return;
    candidates.push({
      id: `agenda-chat-${chat.id}`,
      kind: "chat",
      title: chat.topic || "Teams Chat",
      subtitle: chat.last_message_from || "Teams",
      estimatedMinutes: 3,
      attentionScore: attention.finalScore,
      url: chat.web_url ?? null,
      navigateTab: "communications",
    });
  });

  // Slack messages
  data.slackMessages.forEach((msg) => {
    const target = buildSlackAttentionTarget(msg, "smart-agenda", 54);
    const attention = applyTarget(target);
    if (attention.hidden) return;
    candidates.push({
      id: `agenda-slack-${msg.id}`,
      kind: "slack",
      title: `#${msg.channel_name}`,
      subtitle: msg.author_name,
      estimatedMinutes: 3,
      attentionScore: attention.finalScore,
      url: msg.permalink,
      navigateTab: "communications",
    });
  });

  // Salesforce opps closing soon
  data.openOpps
    .filter((opp) => !opp.is_closed && opp.days_to_close <= 7)
    .forEach((opp) => {
      candidates.push({
        id: `agenda-sf-${opp.id}`,
        kind: "salesforce",
        title: opp.name,
        subtitle: `${opp.stage} · closes in ${opp.days_to_close}d`,
        estimatedMinutes: 10,
        attentionScore: 65,
        url: opp.sf_url,
        navigateTab: "performance",
      });
    });

  return candidates;
}

// ── Gap Filling ──────────────────────────────────────────────────────────────

const MAX_SUGGESTIONS_PER_GAP = 5;
const BUFFER_MINUTES = 5;

export function fillGapWithSuggestions(
  durationMin: number,
  candidates: AgendaSuggestion[],
  nextMeeting: AgendaMeetingBlock | null,
  usedIds: Set<string>
): AgendaSuggestion[] {
  const suggestions: AgendaSuggestion[] = [];
  let remainingMin = Math.max(0, durationMin - BUFFER_MINUTES);

  // Add meeting-prep pseudo-item if there's a next meeting and enough time
  if (nextMeeting && durationMin >= 10) {
    const meetingDuration = nextMeeting.durationMin;
    const prepMin = estimateMeetingPrepMinutes(meetingDuration);
    if (prepMin <= remainingMin) {
      suggestions.push({
        id: `agenda-prep-${nextMeeting.event.id}`,
        kind: "meeting-prep",
        title: `Prep for ${nextMeeting.event.subject}`,
        subtitle: nextMeeting.event.organizer || "",
        estimatedMinutes: prepMin,
        attentionScore: 80, // high priority — prep for imminent meeting
        url: null,
        navigateTab: "calendar",
        prepEventId: nextMeeting.event.id,
      });
      remainingMin -= prepMin;
    }
  }

  // Sort candidates by attention score (highest first)
  const sorted = [...candidates]
    .filter((c) => !usedIds.has(c.id))
    .sort((a, b) => b.attentionScore - a.attentionScore);

  // Greedy bin-pack
  for (const candidate of sorted) {
    if (suggestions.length >= MAX_SUGGESTIONS_PER_GAP) break;
    if (remainingMin <= 0) break;
    if (candidate.estimatedMinutes <= remainingMin) {
      suggestions.push(candidate);
      usedIds.add(candidate.id);
      remainingMin -= candidate.estimatedMinutes;
    }
  }

  return suggestions;
}

// ── Block Computation ────────────────────────────────────────────────────────

function toLocalDate(isoString: string): Date {
  return new Date(isoString);
}

function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60_000);
}

export function computeAgendaBlocks(
  events: CalendarEvent[],
  now: Date,
  windowHours: number,
  applyTarget: (t: AttentionTarget) => AttentionItem,
  candidates: AgendaSuggestion[]
): SmartAgendaData {
  const windowStart = now;
  const windowEnd = new Date(now.getTime() + windowHours * 60 * 60_000);

  // Filter to non-all-day events overlapping the window, sorted by start
  const windowEvents = events
    .filter((e) => {
      if (e.is_all_day) return false;
      const start = toLocalDate(e.start_time);
      const end = toLocalDate(e.end_time);
      return start < windowEnd && end > windowStart;
    })
    .sort(
      (a, b) =>
        toLocalDate(a.start_time).getTime() -
        toLocalDate(b.start_time).getTime()
    );

  // Build meeting blocks
  const meetingBlocks: AgendaMeetingBlock[] = windowEvents.map((event) => {
    const rawStart = toLocalDate(event.start_time);
    const rawEnd = toLocalDate(event.end_time);
    const start = rawStart < windowStart ? windowStart : rawStart;
    const end = rawEnd > windowEnd ? windowEnd : rawEnd;
    const target = buildCalendarAttentionTarget(event, "smart-agenda", 62);
    const attention = applyTarget(target);
    return {
      kind: "meeting" as const,
      id: `agenda-meeting-${event.id}`,
      startTime: start,
      endTime: end,
      durationMin: minutesBetween(start, end),
      event,
      attentionScore: attention.finalScore,
    };
  });

  // Walk chronologically to build block sequence with gaps
  const blocks: AgendaBlock[] = [];
  const usedIds = new Set<string>();
  let cursor = windowStart;

  for (let i = 0; i < meetingBlocks.length; i++) {
    const meeting = meetingBlocks[i];

    // Gap before this meeting?
    if (meeting.startTime > cursor) {
      const gapMin = minutesBetween(cursor, meeting.startTime);
      if (gapMin > 0) {
        const suggestions = fillGapWithSuggestions(
          gapMin,
          candidates,
          meeting,
          usedIds
        );
        const totalSuggested = suggestions.reduce(
          (sum, s) => sum + s.estimatedMinutes,
          0
        );
        blocks.push({
          kind: "free-time",
          id: `agenda-gap-${i}`,
          startTime: cursor,
          endTime: meeting.startTime,
          durationMin: gapMin,
          suggestions,
          totalSuggestedMin: totalSuggested,
        });
      }
    }

    blocks.push(meeting);
    cursor =
      meeting.endTime > cursor ? meeting.endTime : cursor;
  }

  // Trailing gap after last meeting
  if (cursor < windowEnd) {
    const gapMin = minutesBetween(cursor, windowEnd);
    if (gapMin > 0) {
      const suggestions = fillGapWithSuggestions(
        gapMin,
        candidates,
        null,
        usedIds
      );
      const totalSuggested = suggestions.reduce(
        (sum, s) => sum + s.estimatedMinutes,
        0
      );
      blocks.push({
        kind: "free-time",
        id: "agenda-gap-trailing",
        startTime: cursor,
        endTime: windowEnd,
        durationMin: gapMin,
        suggestions,
        totalSuggestedMin: totalSuggested,
      });
    }
  }

  return {
    blocks,
    windowStart,
    windowEnd,
    hasCalendar: windowEvents.length > 0,
    hasActionableItems: candidates.length > 0,
  };
}

// ── Format Helpers ───────────────────────────────────────────────────────────

export function formatAgendaTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Los_Angeles",
  });
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
