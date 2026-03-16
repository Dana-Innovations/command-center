import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AttentionItem, AttentionTarget } from "@/lib/attention/types";
import type {
  AsanaCommentThread,
  CalendarEvent,
  Chat,
  Email,
  SalesforceOpportunity,
  SlackFeedMessage,
  Task,
} from "@/lib/types";
import {
  buildBriefActionTarget,
  buildBriefPrompt,
  buildBriefSnapshot,
  buildOriginalTargetsMap,
  computeSnapshotHash,
  stripAttentionTargetsFromBriefSnapshot,
  type BriefAction,
} from "@/lib/morning-brief";

function iso(value: string) {
  return new Date(value).toISOString();
}

function createEmail(overrides: Partial<Email> = {}): Email {
  return {
    id: "email-row-1",
    message_id: "email-1",
    from_name: "Dana",
    from_email: "dana@example.com",
    subject: 'CEO "quote" {priority}',
    preview: "Need a reply before lunch",
    body_html: "<p>hello</p>",
    received_at: iso("2026-03-15T14:00:00.000Z"),
    is_read: false,
    folder: "Inbox",
    folder_id: "folder-inbox",
    has_attachments: false,
    outlook_url: "https://outlook.example/email-1",
    needs_reply: true,
    days_overdue: 0,
    synced_at: iso("2026-03-15T14:05:00.000Z"),
    ...overrides,
  };
}

function createEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "calendar-row-1",
    event_id: "event-1",
    subject: "Morning revenue review",
    location: "Board room",
    start_time: iso("2026-03-15T17:00:00.000Z"),
    end_time: iso("2026-03-15T18:00:00.000Z"),
    is_all_day: false,
    organizer: "Taylor",
    is_online: false,
    join_url: "",
    outlook_url: "https://outlook.example/event-1",
    synced_at: iso("2026-03-15T15:00:00.000Z"),
    ...overrides,
  };
}

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-row-1",
    task_gid: "task-1",
    name: "Close open action items",
    notes: "Need follow-up",
    due_on: "2026-03-15",
    completed: false,
    assignee: "me",
    assignee_name: "Ari",
    assignee_email: "ari@example.com",
    created_by_gid: "creator-1",
    created_by_name: "Dana",
    created_by_email: "dana@example.com",
    collaborator_names: [],
    collaborator_emails: [],
    follower_names: [],
    follower_emails: [],
    modified_at: iso("2026-03-15T13:00:00.000Z"),
    project_name: "Exec Ops",
    project_gid: "project-1",
    permalink_url: "https://asana.example/task-1",
    priority: "High",
    days_overdue: 1,
    synced_at: iso("2026-03-15T13:05:00.000Z"),
    ...overrides,
  };
}

function createComment(
  overrides: Partial<AsanaCommentThread> = {}
): AsanaCommentThread {
  return {
    id: "comment-1",
    task_gid: "task-1",
    task_name: "Close open action items",
    task_due_on: "2026-03-15",
    project_gid: "project-1",
    project_name: "Exec Ops",
    permalink_url: "https://asana.example/comment-1",
    latest_comment_text: "Can you update this before the meeting?",
    latest_comment_at: iso("2026-03-15T12:30:00.000Z"),
    latest_commenter_name: "Dana",
    latest_commenter_email: "dana@example.com",
    participant_names: ["Dana", "Ari"],
    participant_emails: ["dana@example.com", "ari@example.com"],
    relevance_reason: "assignee",
    synced_at: iso("2026-03-15T12:35:00.000Z"),
    ...overrides,
  };
}

function createChat(overrides: Partial<Chat> = {}): Chat {
  return {
    id: "chat-row-1",
    chat_id: "chat-1",
    topic: "Sales deal",
    chat_type: "group",
    last_message_preview: "Need your approval",
    last_message_from: "Morgan",
    last_activity: iso("2026-03-15T11:00:00.000Z"),
    members: ["Morgan", "Ari"],
    web_url: "https://teams.example/chat-1",
    synced_at: iso("2026-03-15T11:05:00.000Z"),
    ...overrides,
  };
}

function createSlackMessage(
  overrides: Partial<SlackFeedMessage> = {}
): SlackFeedMessage {
  return {
    id: "slack-row-1",
    message_ts: "123.456",
    author_name: "Jamie",
    author_id: "U123",
    text: "Customer asked for an update",
    timestamp: iso("2026-03-15T10:00:00.000Z"),
    channel_name: "leadership",
    channel_id: "C123",
    reactions: [],
    thread_reply_count: 0,
    has_files: false,
    permalink: "https://slack.example/message-1",
    synced_at: iso("2026-03-15T10:05:00.000Z"),
    ...overrides,
  };
}

function createOpportunity(
  overrides: Partial<SalesforceOpportunity> = {}
): SalesforceOpportunity {
  return {
    id: "opp-row-1",
    sf_opportunity_id: "opp-1",
    name: "Project Horizon",
    account_name: "Acme",
    owner_name: "Morgan",
    stage: "Proposal",
    amount: 250000,
    probability: 60,
    close_date: "2026-03-18",
    days_to_close: 3,
    is_closed: false,
    is_won: false,
    last_activity_date: "2026-03-14",
    next_step: "Follow up",
    territory: "West",
    sales_channel: "Direct",
    opp_type: "New",
    forecast_category: "Commit",
    record_type: "Opportunity",
    product_line: "Speakers",
    age_in_days: 20,
    days_in_stage: 12,
    has_overdue_task: false,
    push_count: 0,
    sf_url: "https://salesforce.example/opp-1",
    synced_at: iso("2026-03-15T09:00:00.000Z"),
    ...overrides,
  };
}

function createOrder(overrides: Partial<{
  id: string;
  name: string;
  status: string;
  location: string;
  monday_url: string;
}> = {}) {
  return {
    id: "order-1",
    name: "Pacific install",
    status: "DWG NEEDED",
    location: "Los Angeles",
    monday_url: "https://monday.example/order-1",
    ...overrides,
  };
}

function applyTarget(target: AttentionTarget): AttentionItem {
  return {
    ...target,
    explicitImportance: "normal",
    learnedBias: 0,
    finalScore: target.baseScore,
    explanation: [],
    hidden: false,
  };
}

describe("morning-brief domain", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T16:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds and filters the brief snapshot across communications, calendar, and tasks", () => {
    const snapshot = buildBriefSnapshot(
      {
        emails: [
          createEmail(),
          createEmail({
            id: "email-row-2",
            message_id: "email-2",
            needs_reply: false,
            subject: "FYI only",
          }),
        ],
        events: [
          createEvent(),
          createEvent({
            id: "calendar-row-2",
            event_id: "event-2",
            start_time: iso("2026-03-16T17:00:00.000Z"),
            end_time: iso("2026-03-16T18:00:00.000Z"),
            subject: "Tomorrow review",
          }),
        ],
        tasks: [
          createTask(),
          createTask({
            id: "task-row-2",
            task_gid: "task-2",
            completed: true,
            days_overdue: 0,
            due_on: "2026-03-20",
          }),
        ],
        comments: [createComment()],
        chats: [createChat()],
        slackMessages: [createSlackMessage()],
        openOpps: [createOpportunity()],
        orders: [createOrder()],
      },
      applyTarget
    );

    expect(snapshot.communications.map((item) => item.itemType)).toEqual([
      "email",
      "asana_comment",
      "teams_chat",
      "slack_message",
    ]);
    expect(snapshot.calendar).toHaveLength(1);
    expect(snapshot.calendar[0].eventId).toBe("event-1");
    expect(snapshot.tasks).toHaveLength(1);
    expect(snapshot.tasks[0].itemId).toBe("task-1");
    expect(snapshot.pipeline).toHaveLength(1);
    expect(snapshot.operations).toHaveLength(1);
    expect(snapshot.counts).toEqual({
      emailsNeedingReply: 1,
      overdueTasks: 1,
      meetingsToday: 1,
      dealsClosingThisWeek: 1,
    });
  });

  it("changes the snapshot hash when calendar, pipeline, or operations data changes", () => {
    const snapshot = buildBriefSnapshot(
      {
        emails: [createEmail()],
        events: [createEvent()],
        tasks: [createTask()],
        comments: [createComment()],
        chats: [createChat()],
        slackMessages: [createSlackMessage()],
        openOpps: [createOpportunity()],
        orders: [createOrder()],
      },
      applyTarget
    );

    const baseHash = computeSnapshotHash(snapshot);
    const changedCalendarHash = computeSnapshotHash({
      ...snapshot,
      calendar: snapshot.calendar.map((item, index) =>
        index === 0
          ? { ...item, startTime: iso("2026-03-15T19:00:00.000Z") }
          : item
      ),
    });
    const changedPipelineHash = computeSnapshotHash({
      ...snapshot,
      pipeline: snapshot.pipeline.map((item, index) =>
        index === 0 ? { ...item, stage: "Negotiation" } : item
      ),
    });
    const changedOperationsHash = computeSnapshotHash({
      ...snapshot,
      operations: snapshot.operations.map((item, index) =>
        index === 0 ? { ...item, status: "SALES ORDER NEEDED" } : item
      ),
    });

    expect(changedCalendarHash).not.toBe(baseHash);
    expect(changedPipelineHash).not.toBe(baseHash);
    expect(changedOperationsHash).not.toBe(baseHash);
  });

  it("builds the original-targets map for communication, task, and calendar items", () => {
    const snapshot = buildBriefSnapshot(
      {
        emails: [createEmail()],
        events: [createEvent()],
        tasks: [createTask()],
        comments: [createComment()],
        chats: [createChat()],
        slackMessages: [createSlackMessage()],
        openOpps: [createOpportunity()],
        orders: [createOrder()],
      },
      applyTarget
    );

    const map = buildOriginalTargetsMap(snapshot);

    expect(map.get("email:email-1")?.itemId).toBe("email-1");
    expect(map.get("asana_task:task-1")?.itemId).toBe("task-1");
    expect(map.get("calendar_event:event-1")?.itemId).toBe("event-1");
  });

  it("prefers the original attention target for brief feedback actions", () => {
    const snapshot = buildBriefSnapshot(
      {
        emails: [createEmail()],
        events: [createEvent()],
        tasks: [createTask()],
        comments: [createComment()],
        chats: [createChat()],
        slackMessages: [createSlackMessage()],
        openOpps: [createOpportunity()],
        orders: [createOrder()],
      },
      applyTarget
    );

    const originalTargets = buildOriginalTargetsMap(snapshot);
    const action: BriefAction = {
      id: "action-1",
      text: "Reply to Dana",
      urgency: "now",
      source: {
        itemType: "email",
        itemId: "email-1",
        provider: "outlook_mail",
        title: "New title that should not win",
      },
      attentionScore: 99,
    };

    const target = buildBriefActionTarget(action, originalTargets);

    expect(target.itemId).toBe("email-1");
    expect(target.title).toBe('CEO "quote" {priority}');
    expect(target.surface).toBe("morning_brief");
  });

  it("falls back to a minimal attention target when no original target exists", () => {
    const target = buildBriefActionTarget(
      {
        id: "action-2",
        text: "Follow up with the customer",
        urgency: "today",
        source: {
          itemType: "asana_task",
          itemId: "missing-task",
          provider: "asana",
          title: "Customer follow-up",
        },
        attentionScore: 61,
      },
      new Map()
    );

    expect(target.itemId).toBe("missing-task");
    expect(target.baseScore).toBe(61);
    expect(target.surface).toBe("morning_brief");
    expect(target.topicKeys.length).toBeGreaterThan(0);
  });

  it("strips attention targets for the server payload and builds an escape-safe prompt", () => {
    const snapshot = buildBriefSnapshot(
      {
        emails: [createEmail()],
        events: [createEvent()],
        tasks: [createTask()],
        comments: [createComment()],
        chats: [createChat()],
        slackMessages: [createSlackMessage()],
        openOpps: [createOpportunity()],
        orders: [createOrder()],
      },
      applyTarget
    );

    const apiSnapshot = stripAttentionTargetsFromBriefSnapshot(snapshot);
    const prompt = buildBriefPrompt(apiSnapshot);

    expect(apiSnapshot.communications[0]).not.toHaveProperty("attentionTarget");
    expect(prompt).toContain('\\"quote\\"');
    expect(prompt).toContain('"preservePriorityActionSourceExactly": true');
  });
});
