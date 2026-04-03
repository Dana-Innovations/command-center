import { NextRequest, NextResponse } from "next/server";
import { loadAttentionProfile } from "@/lib/attention/server";
import type {
  AttentionProvider,
  FocusPreferenceRecord,
  ImportanceTier,
} from "@/lib/attention/types";
import {
  getCortexToken,
  cortexInit,
  cortexCall,
  callCortexMCP,
} from "@/lib/cortex/client";
import { getConnections, cacheConnectionStatus, type CortexConnection } from "@/lib/cortex/connections";
import { getCortexUserFromRequest } from "@/lib/cortex/user";
import { normalizeCalendarDateTime } from "@/lib/calendar";
import { persistPeopleSnapshots } from "@/lib/people-relevance";
import { createServiceClient } from "@/lib/supabase/server";
import type { AsanaCommentThread, Task } from "@/lib/types";

const CORTEX_URL = process.env.NEXT_PUBLIC_CORTEX_URL ?? "";

interface SessionTool {
  name: string;
  inputSchema?: {
    properties?: Record<string, unknown>;
  };
}

interface AuthenticatedUser {
  name: string;
  email: string;
}

interface AsanaPerson {
  gid: string;
  name: string;
  email: string;
}

interface FocusSelection {
  entityId: string;
  importance: ImportanceTier;
  label: string;
  metadata: Record<string, unknown>;
}

interface LiveAttentionSelections {
  providerImportance: Partial<Record<AttentionProvider, ImportanceTier>>;
  mailFolders: FocusSelection[];
  asanaProjects: FocusSelection[];
  slackChannels: FocusSelection[];
  teamsTeams: FocusSelection[];
  teamsChannels: FocusSelection[];
}

const IMPORTANCE_PRIORITY: Record<ImportanceTier, number> = {
  critical: 3,
  normal: 2,
  quiet: 1,
  muted: 0,
};

const MAIL_FOLDER_ALIASES: Record<string, string> = {
  inbox: "inbox",
  "sent items": "sentitems",
  sentitems: "sentitems",
  sent: "sentitems",
  archive: "archive",
  drafts: "drafts",
  "deleted items": "deleteditems",
  deleteditems: "deleteditems",
  trash: "deleteditems",
  "junk email": "junkemail",
  junkemail: "junkemail",
  spam: "junkemail",
};

function toMetadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function sortSelections(values: FocusSelection[]) {
  return [...values].sort((a, b) => {
    const importanceDiff =
      IMPORTANCE_PRIORITY[b.importance] - IMPORTANCE_PRIORITY[a.importance];
    if (importanceDiff !== 0) return importanceDiff;
    return a.label.localeCompare(b.label);
  });
}

function collectAttentionSelections(
  records: FocusPreferenceRecord[]
): LiveAttentionSelections {
  const selections: LiveAttentionSelections = {
    providerImportance: {},
    mailFolders: [],
    asanaProjects: [],
    slackChannels: [],
    teamsTeams: [],
    teamsChannels: [],
  };

  for (const record of records) {
    if (record.entity_type === "provider") {
      selections.providerImportance[record.provider] = record.importance;
      continue;
    }

    const selection: FocusSelection = {
      entityId: record.entity_id,
      importance: record.importance,
      label:
        record.label_snapshot ||
        String(record.metadata?.displayName ?? record.entity_id),
      metadata: toMetadataRecord(record.metadata),
    };

    if (record.provider === "outlook_mail" && record.entity_type === "mail_folder") {
      selections.mailFolders.push(selection);
    } else if (record.provider === "asana" && record.entity_type === "asana_project") {
      selections.asanaProjects.push(selection);
    } else if (record.provider === "slack" && record.entity_type === "slack_channel") {
      selections.slackChannels.push(selection);
    } else if (record.provider === "teams" && record.entity_type === "teams_team") {
      selections.teamsTeams.push(selection);
    } else if (record.provider === "teams" && record.entity_type === "teams_channel") {
      selections.teamsChannels.push(selection);
    }
  }

  selections.mailFolders = sortSelections(selections.mailFolders);
  selections.asanaProjects = sortSelections(selections.asanaProjects);
  selections.slackChannels = sortSelections(selections.slackChannels);
  selections.teamsTeams = sortSelections(selections.teamsTeams);
  selections.teamsChannels = sortSelections(selections.teamsChannels);

  return selections;
}

function getProviderImportance(
  selections: LiveAttentionSelections,
  provider: AttentionProvider
) {
  return selections.providerImportance[provider] ?? "normal";
}

function shouldSkipProvider(
  selections: LiveAttentionSelections,
  provider: AttentionProvider
) {
  return getProviderImportance(selections, provider) === "muted";
}

function selectionLimit(importance: ImportanceTier, limits?: {
  critical?: number;
  normal?: number;
  quiet?: number;
  muted?: number;
}) {
  const fallback = {
    critical: 40,
    normal: 24,
    quiet: 10,
    muted: 0,
    ...limits,
  };

  return fallback[importance];
}

function resolveMailFolderName(selection: FocusSelection) {
  const rawLabel =
    String(selection.metadata.displayName ?? selection.label ?? selection.entityId)
      .trim()
      .replace(/^#/, "");
  const normalized = rawLabel.toLowerCase();
  return MAIL_FOLDER_ALIASES[normalized] ?? rawLabel;
}

function resolveSlackChannelName(selection: FocusSelection) {
  return String(selection.metadata.channelName ?? selection.label ?? selection.entityId)
    .trim()
    .replace(/^#/, "");
}

function normalizeIdentity(value: string | null | undefined): string {
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

function asArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object"
  );
}

function firstArrayProperty(
  payload: Record<string, unknown>,
  keys: string[]
): Record<string, unknown>[] {
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return asArray(value);
    }
  }
  return [];
}

function toAsanaPerson(value: unknown): AsanaPerson | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const gid = String(record.gid ?? record.id ?? "");
  const name = String(
    record.name ?? record.display_name ?? record.displayName ?? ""
  );
  const email = String(record.email ?? record.mail ?? "");

  if (!gid && !name && !email) return null;
  return { gid, name, email };
}

function peopleList(values: unknown): AsanaPerson[] {
  return asArray(values)
    .map((entry) => toAsanaPerson(entry))
    .filter((entry): entry is AsanaPerson => entry !== null);
}

function personMatchesUser(
  person: AsanaPerson | null,
  authenticatedUser: AuthenticatedUser
): boolean {
  if (!person) return false;

  const userEmail = normalizeIdentity(authenticatedUser.email);
  const userName = normalizeIdentity(authenticatedUser.name);

  if (userEmail && normalizeIdentity(person.email) === userEmail) {
    return true;
  }

  if (userName && normalizeIdentity(person.name) === userName) {
    return true;
  }

  return false;
}

function listMatchesUser(
  names: string[] | undefined,
  emails: string[] | undefined,
  authenticatedUser: AuthenticatedUser
): boolean {
  const userEmail = normalizeIdentity(authenticatedUser.email);
  const userName = normalizeIdentity(authenticatedUser.name);

  if (
    userEmail &&
    (emails ?? []).some((email) => normalizeIdentity(email) === userEmail)
  ) {
    return true;
  }

  if (
    userName &&
    (names ?? []).some((name) => normalizeIdentity(name) === userName)
  ) {
    return true;
  }

  return false;
}

async function cortexSessionRequest(
  token: string,
  sessionId: string,
  id: string,
  method: "tools/call" | "tools/list",
  params?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!CORTEX_URL) {
    throw new Error("NEXT_PUBLIC_CORTEX_URL is not configured");
  }

  const res = await fetch(`${CORTEX_URL}/mcp/cortex`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "mcp-protocol-version": "2024-11-05",
      "x-cortex-client": "cortex-mcp-stdio",
      "mcp-session-id": sessionId,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params: params ?? {},
    }),
  });

  const payload = (await res.json()) as {
    result?: Record<string, unknown>;
    error?: { message?: string };
  };

  if (!res.ok || payload.error) {
    throw new Error(
      payload.error?.message || `Cortex request failed with ${res.status}`
    );
  }

  return payload.result ?? {};
}

async function listSessionTools(
  token: string,
  sessionId: string
): Promise<SessionTool[]> {
  try {
    const result = await cortexSessionRequest(
      token,
      sessionId,
      "tools_list",
      "tools/list"
    );

    return asArray(result.tools).map((tool) => ({
      name: String(tool.name ?? ""),
      inputSchema:
        typeof tool.inputSchema === "object" && tool.inputSchema
          ? (tool.inputSchema as SessionTool["inputSchema"])
          : undefined,
    }));
  } catch {
    return [];
  }
}

function selectAsanaStoryTool(tools: SessionTool[]): SessionTool | null {
  const exactCandidates = [
    "asana__list_task_stories",
    "asana__get_task_stories",
    "asana__list_stories",
    "asana__get_stories",
    "asana__list_comments",
    "asana__get_comments",
  ];

  for (const candidate of exactCandidates) {
    const match = tools.find((tool) => tool.name === candidate);
    if (match) return match;
  }

  return (
    tools.find(
      (tool) =>
        tool.name.startsWith("asana__") &&
        (tool.name.includes("story") || tool.name.includes("comment")) &&
        tool.name.includes("task")
    ) ?? null
  );
}

function buildStoryArgs(tool: SessionTool, taskGid: string): Record<string, unknown> {
  const props = Object.keys(tool.inputSchema?.properties ?? {});
  const args: Record<string, unknown> = {};

  if (props.includes("task_gid")) args.task_gid = taskGid;
  if (props.includes("task_id")) args.task_id = taskGid;
  if (props.includes("gid")) args.gid = taskGid;
  if (props.includes("task")) args.task = taskGid;
  if (props.includes("resource_gid")) args.resource_gid = taskGid;
  if (props.includes("resource_id")) args.resource_id = taskGid;
  if (props.includes("limit")) args.limit = 20;

  if (Object.keys(args).length === 0) {
    return { task_gid: taskGid, limit: 20 };
  }

  return args;
}

function extractTextValue(value: unknown): string {
  if (typeof value === "string") return stripHtml(value);
  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  return stripHtml(
    String(
      record.text ??
        record.content ??
        record.html_text ??
        record.htmlText ??
        record.display_value ??
        ""
    )
  );
}

function isHumanCommentStory(story: Record<string, unknown>): boolean {
  const subtype = String(
    story.resource_subtype ?? story.subtype ?? story.story_type ?? story.type ?? ""
  ).toLowerCase();
  const text = extractTextValue(story.text ?? story.html_text ?? story.content);

  if (!text) return false;

  if (subtype.includes("comment")) return true;

  return ![
    "assigned",
    "completed",
    "changed",
    "added",
    "removed",
    "due_date",
    "dependency",
    "section",
  ].some((token) => subtype.includes(token));
}

function extractStories(payload: Record<string, unknown>): Record<string, unknown>[] {
  return firstArrayProperty(payload, [
    "stories",
    "comments",
    "items",
    "data",
    "events",
    "value",
  ]);
}

// ─── M365 via Cortex MCP ────────────────────────────────────────────────────

async function fetchEmails(
  token: string,
  sessionId: string,
  folderSelections: FocusSelection[] = []
) {
  const selectedFolders = folderSelections.filter(
    (selection) => selection.importance !== "muted"
  );
  const foldersToFetch =
    selectedFolders.length > 0
      ? selectedFolders.slice(0, 4).map((selection) => ({
          id: selection.entityId,
          label:
            String(selection.metadata.displayName ?? selection.label ?? "Inbox") ||
            "Inbox",
          requestFolder: resolveMailFolderName(selection),
          importance: selection.importance,
        }))
      : [
          {
            id: "inbox",
            label: "Inbox",
            requestFolder: "inbox",
            importance: "normal" as const,
          },
        ];

  const results = await Promise.allSettled(
    foldersToFetch.map((folder, index) =>
      cortexCall(token, sessionId, `emails_${index}`, "m365__list_emails", {
        count: selectionLimit(folder.importance, {
          critical: 48,
          normal: 28,
          quiet: 12,
        }),
        folder: folder.requestFolder,
      }).then((result) => ({ folder, result }))
    )
  );

  const now = new Date().toISOString();
  const seen = new Set<string>();
  const items: Array<Record<string, unknown>> = [];
  const shouldFilterFocused =
    selectedFolders.length === 0 &&
    foldersToFetch.length === 1 &&
    foldersToFetch[0].requestFolder === "inbox";

  for (const outcome of results) {
    if (outcome.status !== "fulfilled") continue;

    const { folder, result } = outcome.value;
    const emails: Record<string, unknown>[] = result.emails ?? result.value ?? [];

    for (const message of emails) {
      const messageId = String(message.id ?? "");
      if (!messageId || seen.has(messageId) || message.isDraft) continue;
      if (
        shouldFilterFocused &&
        message.inferenceClassification &&
        message.inferenceClassification !== "focused"
      ) {
        continue;
      }

      seen.add(messageId);
      items.push({
        ...message,
        __folderId: folder.id,
        __folderLabel: folder.label,
      });
    }
  }

  return items
    .sort(
      (a, b) =>
        new Date(String(b.receivedDateTime ?? now)).getTime() -
        new Date(String(a.receivedDateTime ?? now)).getTime()
    )
    .slice(0, 50)
    .map((m) => {
      const from = m.from as {
        emailAddress?: { name?: string; address?: string };
      } | null;
      const receivedAt = (m.receivedDateTime as string) || now;
      const daysDiff = Math.floor(
        (Date.now() - new Date(receivedAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      return {
        id: m.id,
        message_id: m.id,
        subject: m.subject || "(no subject)",
        from_name:
          from?.emailAddress?.name || from?.emailAddress?.address || "",
        from_email: from?.emailAddress?.address || "",
        preview: ((m.bodyPreview as string) || "").slice(0, 160),
        body_html: "",
        received_at: receivedAt,
        is_read: m.isRead as boolean,
        folder: (m.__folderLabel as string) || "Inbox",
        folder_id: (m.__folderId as string) || "inbox",
        has_attachments: m.hasAttachments as boolean,
        outlook_url:
          m.webLink ||
          `https://outlook.office.com/mail/inbox/id/${encodeURIComponent(m.id as string)}`,
        needs_reply: !(m.isRead as boolean),
        days_overdue: Math.max(0, daysDiff - 2),
        synced_at: now,
      };
    });
}

async function fetchSentEmails(token: string, sessionId: string) {
  const result = await cortexCall(
    token,
    sessionId,
    "sent_emails",
    "m365__list_emails",
    { count: 40, folder: "sentitems" }
  );
  const emails: Record<string, unknown>[] = result.emails ?? result.value ?? [];
  const now = new Date().toISOString();

  return emails
    .filter((m) => !m.isDraft)
    .slice(0, 30)
    .map((m) => {
      const toRecipients = (m.toRecipients ?? []) as Array<{
        emailAddress?: { name?: string; address?: string };
      }>;
      const firstTo = toRecipients[0]?.emailAddress;
      const sentAt = (m.sentDateTime as string) || (m.createdDateTime as string) || now;
      return {
        id: m.id,
        message_id: m.id,
        subject: m.subject || "(no subject)",
        from_name: "",
        from_email: "",
        to_name: firstTo?.name || firstTo?.address || "",
        to_email: firstTo?.address || "",
        preview: ((m.bodyPreview as string) || "").slice(0, 160),
        body_html: "",
        received_at: sentAt,
        is_read: true,
        folder: "sent",
        has_attachments: m.hasAttachments as boolean,
        outlook_url: m.webLink || "",
        needs_reply: false,
        days_overdue: 0,
        synced_at: now,
        direction: "sent" as const,
      };
    });
}

async function fetchCalendar(
  token: string,
  sessionId: string,
  importance: ImportanceTier = "normal"
) {
  const now = new Date();
  const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);
  const calendarArgs = {
    start_date: startDate,
    end_date: endDate,
    count: selectionLimit(importance, {
      critical: 240,
      normal: 180,
      quiet: 90,
    }),
  };

  let result: Record<string, unknown> = {};

  try {
    result = await cortexCall(
      token,
      sessionId,
      "cal",
      "m365__list_events",
      calendarArgs
    );
  } catch (error) {
    console.warn("[live] calendar session fetch failed", {
      startDate,
      endDate,
      error: String(error),
    });
  }

  let events = firstArrayProperty(result, ["events", "value", "data"]);
  const returnedCount =
    typeof result.count === "number" ? result.count : null;

  if (events.length === 0 && returnedCount !== 0) {
    try {
      const fallback = await callCortexMCP(
        "m365",
        "list_events",
        calendarArgs,
        token
      );

      if (fallback && typeof fallback === "object") {
        result = fallback as Record<string, unknown>;
        events = firstArrayProperty(result, ["events", "value", "data"]);
      }

      if (events.length > 0) {
        console.info("[live] calendar recovered via direct m365 MCP", {
          eventCount: events.length,
          startDate,
          endDate,
        });
      }
    } catch (error) {
      console.warn("[live] calendar direct MCP fallback failed", {
        startDate,
        endDate,
        error: String(error),
      });
    }
  }

  if (!result || (!result.events && !result.value)) {
    console.warn("[live] calendar: no events key in response", { keys: Object.keys(result ?? {}), result });
  } else {
    console.log("[live] calendar result:", { eventCount: events.length, startDate, endDate });
  }
  const synced = new Date().toISOString();

  return events
    .map((e) => {
      const start = e.start as { dateTime?: string; timeZone?: string } | null;
      const endTime = e.end as { dateTime?: string; timeZone?: string } | null;
      const loc = e.location as { displayName?: string } | null;
      const organizer = e.organizer as {
        emailAddress?: { name?: string; address?: string };
        name?: string;
      } | null;
      const rawAttendees = (e.attendees ?? []) as Array<{
        emailAddress?: { name?: string; address?: string };
        type?: string;
        status?: { response?: string };
      }>;
      const attendeeNames = rawAttendees
        .map((a) => a.emailAddress?.name || a.emailAddress?.address || "")
        .filter((n) => n.length > 0);
      const startTz = start?.timeZone || "";
      const endTz = endTime?.timeZone || "";
      const startDt =
        typeof e.start === "string"
          ? e.start
          : start?.dateTime || (e.startDateTime as string) || "";
      const endDt =
        typeof e.end === "string"
          ? e.end
          : endTime?.dateTime || (e.endDateTime as string) || "";
      const normalizedStart = normalizeCalendarDateTime(startDt, startTz);
      const normalizedEnd = normalizeCalendarDateTime(endDt, endTz);

      if (!normalizedStart || !normalizedEnd) {
        return null;
      }

      return {
        id: e.id,
        event_id: e.id,
        subject: e.subject || "(no title)",
        calendar_id: "primary",
        location: loc?.displayName || (typeof e.location === "string" ? e.location : ""),
        start_time: normalizedStart,
        end_time: normalizedEnd,
        is_all_day: Boolean(e.isAllDay),
        organizer: organizer?.emailAddress?.name || organizer?.name || (typeof e.organizer === "string" ? e.organizer : ""),
        attendees: attendeeNames,
        is_online: e.isOnlineMeeting as boolean,
        join_url:
          (e.onlineMeetingUrl as string) || (e.webLink as string) || "",
        outlook_url: (e.webLink as string) || "",
        synced_at: synced,
      };
    })
    .filter((event): event is NonNullable<typeof event> => event !== null);
}

// ─── Asana via Cortex MCP ─────────────────────────────────────────────────

async function fetchAsanaTasks(
  token: string,
  sessionId: string,
  selectedProjects: FocusSelection[] = []
) {
  // Step 1: Discover the user's projects dynamically
  const projectsResult = await cortexCall(
    token,
    sessionId,
    "asana_projects",
    "asana__list_projects",
    { limit: 20 }
  );
  const projects: Record<string, unknown>[] =
    projectsResult.projects ?? projectsResult.data ?? [];

  if (projects.length === 0) return { tasks: [], asanaProjects: [] };

  // Build the full project list for the settings panel
  const asanaProjects = projects.map((p) => ({
    gid: ((p.gid || p.id) as string) || "",
    name: (p.name as string) || "Untitled",
  }));

  // Step 2: Determine which projects to fetch tasks from
  const selectedProjectIds = new Set(
    selectedProjects
      .filter((project) => project.importance !== "muted")
      .map((project) => project.entityId)
  );

  let projectSlice: Array<Record<string, unknown> & { __importance?: ImportanceTier }> = [];
  if (selectedProjectIds.size > 0) {
    projectSlice = projects
      .filter((project) => selectedProjectIds.has(String(project.gid || project.id || "")))
      .map((project) => {
        const selection = selectedProjects.find(
          (item) => item.entityId === String(project.gid || project.id || "")
        );
        return {
          ...project,
          __importance: selection?.importance ?? "normal",
        };
      });
  }

  if (projectSlice.length === 0) {
    projectSlice = projects.slice(0, 5).map((project) => ({
      ...project,
      __importance: "normal" as const,
    }));
  }

  const taskResults = await Promise.allSettled(
    projectSlice.map((p) =>
      cortexCall(token, sessionId, `asana_${p.gid}`, "asana__list_tasks", {
        project_gid: (p.gid || p.id) as string,
        limit: selectionLimit(p.__importance ?? "normal", {
          critical: 60,
          normal: 36,
          quiet: 18,
        }),
      })
    )
  );

  const today = new Date();
  const now = new Date().toISOString();
  const allTasks: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < taskResults.length; i++) {
    const r = taskResults[i];
    if (r.status !== "fulfilled") continue;
    const tasks: Record<string, unknown>[] = r.value.tasks ?? r.value.data ?? [];
    const projectName = (projectSlice[i].name as string) || "Tasks";
    const projectGid = ((projectSlice[i].gid || projectSlice[i].id) as string) || "";
    for (const t of tasks) {
      const id = (t.gid || t.id) as string;
      if (seen.has(id)) continue;
      seen.add(id);
      allTasks.push({ ...t, project_name: projectName, project_gid: projectGid });
    }
  }

  const tasks = allTasks
    .filter((t) => !t.completed)
    .map((t) => {
      const assignee = toAsanaPerson(t.assignee);
      const createdBy = toAsanaPerson(t.created_by ?? t.createdBy);
      const collaborators = peopleList(
        t.collaborators ?? t.followers ?? t.members ?? t.followers_list
      );
      const dueOn = (t.due_on as string) || (t.due_date as string) || null;
      let daysOverdue = 0;
      if (dueOn) {
        const due = new Date(dueOn + "T00:00:00");
        daysOverdue = Math.floor(
          (today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)
        );
      }
      return {
        id: t.gid || t.id,
        task_gid: t.gid || t.id,
        name: t.name,
        notes: (t.notes as string) || "",
        due_on: dueOn || "",
        completed: false,
        assignee: assignee?.gid || "",
        assignee_name: assignee?.name || null,
        assignee_email: assignee?.email || null,
        created_by_gid: createdBy?.gid || null,
        created_by_name: createdBy?.name || null,
        created_by_email: createdBy?.email || null,
        collaborator_names: collaborators.map((person) => person.name).filter(Boolean),
        collaborator_emails: collaborators.map((person) => person.email).filter(Boolean),
        follower_names: collaborators.map((person) => person.name).filter(Boolean),
        follower_emails: collaborators.map((person) => person.email).filter(Boolean),
        modified_at: (t.modified_at as string) || (t.modifiedAt as string) || null,
        project_name: (t.project_name as string) || "Tasks",
        project_gid: (t.project_gid as string) || null,
        permalink_url: t.permalink_url,
        priority: "normal",
        days_overdue: daysOverdue,
        synced_at: now,
      };
    });

  return { tasks, asanaProjects };
}

async function fetchAsanaCommentThreads(
  token: string,
  sessionId: string,
  tasks: Task[],
  authenticatedUser: AuthenticatedUser
) {
  const tools = await listSessionTools(token, sessionId);
  const storyTool = selectAsanaStoryTool(tools);

  if (!storyTool) {
    return [];
  }

  const candidateTasks = [...tasks]
    .filter((task) => task.permalink_url && !task.completed)
    .sort((a, b) => {
      const modifiedDiff =
        new Date(b.modified_at || b.synced_at).getTime() -
        new Date(a.modified_at || a.synced_at).getTime();
      if (modifiedDiff !== 0) return modifiedDiff;

      if (a.due_on && b.due_on) {
        return new Date(a.due_on).getTime() - new Date(b.due_on).getTime();
      }

      return 0;
    })
    .slice(0, 20);

  const syncedAt = new Date().toISOString();
  const results = await Promise.allSettled(
    candidateTasks.map(async (task) => {
      const result = await cortexSessionRequest(
        token,
        sessionId,
        `asana_stories_${task.task_gid}`,
        "tools/call",
        {
          name: storyTool.name,
          arguments: buildStoryArgs(storyTool, task.task_gid),
        }
      );

      const rawPayload = (() => {
        const content = asArray(result.content);
        const firstText = content.find(
          (entry) => typeof entry.text === "string"
        )?.text;

        if (typeof firstText === "string") {
          try {
            const parsed = JSON.parse(firstText) as Record<string, unknown>;
            return parsed;
          } catch {
            return { value: [] };
          }
        }

        return result;
      })();

      const stories = extractStories(rawPayload);
      const commentStories = stories
        .filter(isHumanCommentStory)
        .map((story) => {
          const author = toAsanaPerson(
            story.created_by ??
              story.createdBy ??
              story.author ??
              story.user ??
              story.actor
          );

          return {
            author,
            createdAt: String(
              story.created_at ??
                story.createdAt ??
                story.occurred_at ??
                story.timestamp ??
                task.modified_at ??
                task.synced_at
            ),
            text: extractTextValue(
              story.text ??
                story.html_text ??
                story.content ??
                story.body ??
                story.description
            ),
          };
        })
        .filter((story) => story.text && story.author)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

      if (commentStories.length === 0) {
        return null;
      }

      const latestComment = commentStories[0];
      if (!latestComment.author || personMatchesUser(latestComment.author, authenticatedUser)) {
        return null;
      }

      let relevanceReason: AsanaCommentThread["relevance_reason"] | null = null;

      if (
        personMatchesUser(
          {
            gid: task.assignee,
            name: task.assignee_name || "",
            email: task.assignee_email || "",
          },
          authenticatedUser
        )
      ) {
        relevanceReason = "assignee";
      } else if (
        listMatchesUser(
          task.collaborator_names,
          task.collaborator_emails,
          authenticatedUser
        )
      ) {
        relevanceReason = "collaborator";
      } else if (
        listMatchesUser(
          task.follower_names,
          task.follower_emails,
          authenticatedUser
        )
      ) {
        relevanceReason = "follower";
      } else if (
        commentStories.some((story) =>
          personMatchesUser(story.author, authenticatedUser)
        )
      ) {
        relevanceReason = "prior_commenter";
      } else if (
        personMatchesUser(
          {
            gid: task.created_by_gid || "",
            name: task.created_by_name || "",
            email: task.created_by_email || "",
          },
          authenticatedUser
        )
      ) {
        relevanceReason = "creator";
      }

      if (!relevanceReason) {
        return null;
      }

      const participantNames = Array.from(
        new Set(
          commentStories
            .map((story) => story.author?.name || "")
            .filter(Boolean)
        )
      );
      const participantEmails = Array.from(
        new Set(
          commentStories
            .map((story) => story.author?.email || "")
            .filter(Boolean)
        )
      );

      return {
        id: `${task.task_gid}:${latestComment.createdAt}`,
        task_gid: task.task_gid,
        task_name: task.name,
        task_due_on: task.due_on || null,
        project_gid: task.project_gid || null,
        project_name: task.project_name,
        permalink_url: task.permalink_url,
        latest_comment_text: latestComment.text,
        latest_comment_at: latestComment.createdAt,
        latest_commenter_name: latestComment.author?.name || "Asana",
        latest_commenter_email: latestComment.author?.email || null,
        participant_names: participantNames,
        participant_emails: participantEmails,
        relevance_reason: relevanceReason,
        synced_at: syncedAt,
      } satisfies AsanaCommentThread;
    })
  );

  return results
    .flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : []
    )
    .flatMap((thread) => (thread ? [thread] : []))
    .sort(
      (a, b) =>
        new Date(b.latest_comment_at).getTime() -
        new Date(a.latest_comment_at).getTime()
    );
}

// ─── Teams chats via Cortex MCP ──────────────────────────────────────────

async function fetchTeamsChats(token: string, sessionId: string) {
  const result = await cortexCall(
    token,
    sessionId,
    "teams1",
    "m365__list_chats",
    { count: 30 }
  );
  const chats: Record<string, unknown>[] = result.chats ?? [];
  const now = new Date().toISOString();

  const withMessages = await Promise.allSettled(
    chats.slice(0, 20).map(async (chat) => {
      const msgsResult = await cortexCall(
        token,
        sessionId,
        `msg_${chat.id}`,
        "m365__list_chat_messages",
        { chat_id: chat.id as string, count: 10 }
      );
      const messages: Record<string, unknown>[] = msgsResult.messages ?? [];
      const lastMsg = messages[0];
      const lastFrom = lastMsg
        ? ((
            (lastMsg.from as Record<string, unknown>)?.user as Record<
              string,
              unknown
            >
          )?.displayName as string) || ""
        : "";
      const lastBody = lastMsg
        ? (
            (
              (lastMsg.body as Record<string, unknown>)?.content as string
            ) || ""
          )
            .replace(/<[^>]+>/g, "")
            .trim()
            .slice(0, 120)
        : "";

      const individualMessages = messages
        .filter((msg) => {
          const msgType = (msg.messageType as string) || "";
          return msgType === "message" || msgType === "";
        })
        .map((msg) => {
          const fromUser = (
            (msg.from as Record<string, unknown>)?.user as Record<string, unknown>
          );
          const displayName = (fromUser?.displayName as string) || "";
          const bodyContent = (
            (msg.body as Record<string, unknown>)?.content as string
          ) || "";
          return {
            from: displayName,
            text: bodyContent.replace(/<[^>]+>/g, "").trim().slice(0, 120),
            timestamp: (msg.createdDateTime as string) || now,
          };
        })
        .filter((msg) => msg.from && msg.text);

      // Extract member display names from the chat response
      const rawMembers = (chat.members ?? []) as Array<{
        displayName?: string;
        email?: string;
        userId?: string;
      }>;
      const memberNames = rawMembers
        .map((m) => m.displayName || "")
        .filter((n) => n.length > 0);

      return {
        id: chat.id,
        chat_id: chat.id,
        topic: (chat.topic as string) || lastFrom || "Teams Chat",
        chat_type: chat.chatType as string,
        last_message_preview: lastBody,
        last_sender: lastFrom,
        last_message_from: lastFrom,
        last_activity: (chat.lastUpdatedDateTime as string) || now,
        members: memberNames,
        web_url:
          (chat.webUrl as string) ||
          (chat.webLink as string) ||
          `https://teams.microsoft.com/l/chat/${encodeURIComponent(String(chat.id))}/conversations`,
        synced_at: now,
        messages: individualMessages,
      };
    })
  );

  return withMessages
    .filter((r) => r.status === "fulfilled")
    .map((r) => (r as PromiseFulfilledResult<unknown>).value)
    .filter((c) => {
      const chat = c as Record<string, unknown>;
      return chat.last_message_preview || chat.topic || chat.last_message_from;
    });
}

async function fetchTeamsChannelMessages(
  token: string,
  sessionId: string,
  teamSelections: FocusSelection[] = [],
  channelSelections: FocusSelection[] = []
) {
  const explicitChannels = channelSelections
    .filter((selection) => selection.importance !== "muted")
    .slice(0, 6)
    .map((selection) => ({
      teamId: String(selection.metadata.teamId ?? ""),
      teamName: String(
        selection.metadata.teamName ?? selection.metadata.teamLabel ?? "Team"
      ),
      channelId: selection.entityId,
      channelName: String(
        selection.metadata.channelName ?? selection.label ?? "Channel"
      ).replace(/^#/, ""),
      importance: selection.importance,
    }))
    .filter((selection) => selection.teamId && selection.channelId);

  let channelsToFetch = explicitChannels;

  if (channelsToFetch.length === 0) {
    const candidateTeams = teamSelections
      .filter((selection) => selection.importance !== "muted")
      .slice(0, 3);

    const teamChannels = await Promise.allSettled(
      candidateTeams.map(async (team) => {
        const result = await cortexCall(
          token,
          sessionId,
          `team_channels_${team.entityId}`,
          "m365__list_channels",
          { team_id: team.entityId }
        );

        const channels: Record<string, unknown>[] =
          result.channels ?? result.value ?? [];

        return channels
          .slice(0, team.importance === "critical" ? 3 : 2)
          .map((channel) => ({
            teamId: team.entityId,
            teamName: String(team.label || "Team"),
            channelId: String(channel.id ?? ""),
            channelName: String(channel.displayName ?? "Channel"),
            importance: team.importance,
          }))
          .filter((channel) => channel.channelId);
      })
    );

    channelsToFetch = teamChannels.flatMap((result) =>
      result.status === "fulfilled" ? result.value : []
    );
  }

  // Auto-discover teams and channels when no focus preferences are configured
  if (channelsToFetch.length === 0) {
    try {
      const teamsResult = await cortexCall(
        token,
        sessionId,
        "auto_teams",
        "m365__list_teams",
        {}
      );
      const discoveredTeams = firstArrayProperty(teamsResult, [
        "teams",
        "value",
        "data",
      ]).slice(0, 3);

      const discoveredChannels = await Promise.allSettled(
        discoveredTeams.map(async (team) => {
          const chResult = await cortexCall(
            token,
            sessionId,
            `auto_channels_${team.id}`,
            "m365__list_channels",
            { team_id: String(team.id) }
          );
          const channels: Record<string, unknown>[] =
            chResult.channels ?? chResult.value ?? [];
          return channels.slice(0, 2).map((channel) => ({
            teamId: String(team.id),
            teamName: String(team.displayName ?? team.name ?? "Team"),
            channelId: String(channel.id ?? ""),
            channelName: String(channel.displayName ?? "Channel"),
            importance: "normal" as const,
          }));
        })
      );

      channelsToFetch = discoveredChannels.flatMap((r) =>
        r.status === "fulfilled" ? r.value.filter((c) => c.channelId) : []
      );
    } catch (e) {
      console.warn("[live] teams auto-discovery failed:", e);
    }
  }

  if (channelsToFetch.length === 0) {
    return [];
  }

  const now = new Date().toISOString();
  const responses = await Promise.allSettled(
    channelsToFetch.map(async (channel, index) => {
      const result = await cortexCall(
        token,
        sessionId,
        `team_messages_${index}`,
        "m365__list_channel_messages",
        {
          team_id: channel.teamId,
          channel_id: channel.channelId,
          count: selectionLimit(channel.importance, {
            critical: 6,
            normal: 4,
            quiet: 2,
          }),
        }
      );

      return { channel, messages: firstArrayProperty(result, ["messages", "value", "data"]) };
    })
  );

  const items: Record<string, unknown>[] = [];
  for (const response of responses) {
    if (response.status !== "fulfilled") continue;

    const { channel, messages } = response.value;
    for (const message of messages) {
      const body = message.body as { content?: string } | null;
      const fromUser = (message.from as Record<string, unknown> | null)?.user as
        | Record<string, unknown>
        | undefined;
      const text = stripHtml(body?.content || String(message.summary ?? ""));
      if (!text) continue;

      items.push({
        id: `${channel.channelId}:${message.id ?? message.etag ?? message.createdDateTime ?? Math.random()}`,
        message_id: message.id ?? null,
        team_id: channel.teamId,
        team_name: channel.teamName,
        channel_id: channel.channelId,
        channel_name: channel.channelName,
        author_name:
          String(fromUser?.displayName ?? message.fromDisplayName ?? "Teams"),
        text,
        timestamp: String(message.createdDateTime ?? now),
        reply_count: Number(message.replyCount ?? 0),
        web_url: String(message.webUrl ?? ""),
        synced_at: now,
      });
    }
  }

  return items
    .sort(
      (a, b) =>
        new Date(String(b.timestamp ?? now)).getTime() -
        new Date(String(a.timestamp ?? now)).getTime()
    )
    .slice(0, 24);
}

// ─── Slack via Cortex MCP ─────────────────────────────────────────────────

async function fetchSlackMessages(
  token: string,
  sessionId: string,
  channelSelections: FocusSelection[] = []
) {
  const explicitChannels = channelSelections
    .filter((selection) => selection.importance !== "muted")
    .slice(0, 6)
    .map((selection) => ({
      id: selection.entityId,
      name: resolveSlackChannelName(selection),
      importance: selection.importance,
    }));

  let prioritized = explicitChannels;

  if (prioritized.length === 0) {
    const result = await cortexCall(
      token,
      sessionId,
      "slack1",
      "slack__list_channels",
      { limit: 40, types: "public_channel,private_channel" }
    );
    const channels: Record<string, unknown>[] = result.channels ?? [];

    prioritized = channels
      .filter((channel) => {
        const type = String(channel.type ?? "");
        const name = String(channel.name ?? "");
        if (type === "group_dm" || type === "im") return false;
        if (name.startsWith("mpdm-")) return false;
        return true;
      })
      .slice(0, 6)
      .map((channel) => ({
        id: String(channel.id ?? ""),
        name: String(channel.name ?? "channel"),
        importance: "normal" as const,
      }))
      .filter((channel) => channel.id);
  }

  const messages = await Promise.allSettled(
    prioritized.map(async (ch, index) => {
      const msgs = await cortexCall(
        token,
        sessionId,
        `slack_${index}`,
        "slack__get_channel_history",
        {
          channel_id: ch.id as string,
          limit: selectionLimit(ch.importance, {
            critical: 5,
            normal: 3,
            quiet: 2,
          }),
        }
      );
      return {
        channel: ch.name,
        channelId: ch.id,
        messages: (msgs.messages ?? []) as Record<string, unknown>[],
      };
    })
  );

  const now = new Date().toISOString();
  const items: Record<string, unknown>[] = [];
  for (const r of messages) {
    if (r.status !== "fulfilled") continue;
    const { channel, channelId, messages: msgs } = r.value;
    for (const m of msgs.slice(0, 2)) {
      if (!m.text && !m.attachments) continue;
      items.push({
        id: m.ts as string,
        message_ts: m.ts as string,
        author_name:
          (m.username as string) || (m.user as string) || "Unknown",
        author_id: (m.user as string) || null,
        text: (m.text as string) || "",
        timestamp: new Date(
          parseFloat(m.ts as string) * 1000
        ).toISOString(),
        channel_name: channel,
        channel_id: (channelId as string) || null,
        reactions: [],
        thread_reply_count: (m.reply_count as number) || 0,
        has_files: !!(m.files as unknown[])?.length,
        permalink:
          (m.permalink as string) ||
          (m.permalink_url as string) ||
          null,
        synced_at: now,
      });
    }
  }

  return items
    .sort(
      (a, b) =>
        new Date(b.timestamp as string).getTime() -
        new Date(a.timestamp as string).getTime()
    )
    .slice(0, 10);
}

// ─── Power BI via Cortex MCP ─────────────────────────────────────────────

const SONANCE_WORKSPACE_ID = "05fd9b2f-5d90-443f-8927-ebc2a507c0d9";

async function fetchPowerBI(token: string, sessionId: string) {
  const [reportsResult, datasetsResult] = await Promise.allSettled([
    cortexCall(token, sessionId, "pbi_reports", "powerbi__list_reports", {
      workspace_id: SONANCE_WORKSPACE_ID,
    }),
    cortexCall(token, sessionId, "pbi_datasets", "powerbi__list_datasets", {
      workspace_id: SONANCE_WORKSPACE_ID,
    }),
  ]);

  const reports: Record<string, unknown>[] =
    reportsResult.status === "fulfilled"
      ? (reportsResult.value?.reports ?? [])
      : [];
  const datasets: Record<string, unknown>[] =
    datasetsResult.status === "fulfilled"
      ? (datasetsResult.value?.datasets ?? [])
      : [];

  const now = new Date().toISOString();

  const reportConfigs = reports
    .filter((r) => r.name && r.id)
    .map((r, i) => ({
      id: r.id as string,
      report_id: r.id as string,
      report_name: r.name as string,
      workspace_id: SONANCE_WORKSPACE_ID,
      embed_url:
        (r.embedUrl as string) || (r.webUrl as string) || null,
      description: null,
      display_order: i,
      is_active: true,
      created_at: now,
      updated_at: now,
    }));

  const kpis = datasets
    .filter((d) => d.name && d.id)
    .map((d) => ({
      id: d.id as string,
      kpi_name: d.name as string,
      kpi_category: "revenue",
      current_value: null,
      previous_value: null,
      target_value: null,
      unit: "$",
      period: "current",
      dataset_id: d.id as string,
      dax_query: null,
      raw_result: null,
      synced_at: now,
    }));

  return { reports: reportConfigs, kpis };
}

// ─── Salesforce via Cortex MCP ───────────────────────────────────────────

async function fetchSalesforceKPIs(token: string, sessionId: string) {
  const now = new Date().toISOString();
  try {
    const [pipelineResult, wonResult, lostResult] = await Promise.allSettled([
      cortexCall(token, sessionId, "sf_pipe", "salesforce__run_soql_query", {
        query:
          "SELECT StageName, COUNT(Id) dealCount, SUM(Amount) pipelineTotal FROM Opportunity WHERE IsClosed = false GROUP BY StageName",
      }),
      cortexCall(token, sessionId, "sf_won", "salesforce__run_soql_query", {
        query:
          "SELECT COUNT(Id) wonCount, SUM(Amount) wonTotal FROM Opportunity WHERE IsWon = true AND CloseDate >= 2026-01-01",
      }),
      cortexCall(token, sessionId, "sf_lost", "salesforce__run_soql_query", {
        query:
          "SELECT COUNT(Id) lostCount FROM Opportunity WHERE IsWon = false AND IsClosed = true AND CloseDate >= 2026-01-01",
      }),
    ]);

    const pipelineRecords =
      pipelineResult.status === "fulfilled"
        ? ((pipelineResult.value?.records ?? []) as Record<string, unknown>[])
        : [];
    const wonRecord =
      wonResult.status === "fulfilled"
        ? (((wonResult.value?.records ?? [])[0] ?? {}) as Record<
            string,
            unknown
          >)
        : {};
    const lostRecord =
      lostResult.status === "fulfilled"
        ? (((lostResult.value?.records ?? [])[0] ?? {}) as Record<
            string,
            unknown
          >)
        : {};

    const pipelineTotal = pipelineRecords.reduce(
      (s, r) => s + (Number(r.pipelineTotal) || 0),
      0
    );
    const openDeals = pipelineRecords.reduce(
      (s, r) => s + (Number(r.dealCount) || 0),
      0
    );
    const wonTotal = Number(wonRecord.wonTotal) || 0;
    const wonCount = Number(wonRecord.wonCount) || 0;
    const lostCount = Number(lostRecord.lostCount) || 0;
    const winRate =
      wonCount + lostCount > 0
        ? Math.round((wonCount / (wonCount + lostCount)) * 100)
        : 0;

    const topStage =
      pipelineRecords.length > 0
        ? pipelineRecords.reduce((a, b) =>
            (Number(a.pipelineTotal) || 0) > (Number(b.pipelineTotal) || 0)
              ? a
              : b
          )
        : null;

    return [
      {
        id: "sf-pipeline",
        kpi_name: "Open Pipeline",
        kpi_category: "revenue",
        current_value: pipelineTotal,
        previous_value: null,
        target_value: null,
        unit: "$",
        period: "current",
        subtitle: `${openDeals} open deals`,
        synced_at: now,
      },
      {
        id: "sf-won-ytd",
        kpi_name: "Won YTD",
        kpi_category: "revenue",
        current_value: wonTotal,
        previous_value: null,
        target_value: null,
        unit: "$",
        period: "2026 YTD",
        subtitle: `${wonCount} deals closed`,
        synced_at: now,
      },
      {
        id: "sf-win-rate",
        kpi_name: "Win Rate",
        kpi_category: "revenue",
        current_value: winRate,
        previous_value: null,
        target_value: null,
        unit: "%",
        period: "2026 YTD",
        subtitle: `${wonCount}W / ${lostCount}L`,
        synced_at: now,
      },
      {
        id: "sf-top-stage",
        kpi_name: "Largest Stage",
        kpi_category: "revenue",
        current_value: topStage ? Number(topStage.pipelineTotal) || 0 : 0,
        previous_value: null,
        target_value: null,
        unit: "$",
        period: "current",
        subtitle: topStage ? String(topStage.StageName) : "",
        synced_at: now,
      },
    ];
  } catch {
    return [];
  }
}

async function fetchSalesforce(token: string, sessionId: string) {
  const query =
    "SELECT Id, Name, Amount, StageName, CloseDate, Account.Name, Owner.Name, Probability, RecordType.Name, Type FROM Opportunity WHERE IsClosed = false ORDER BY Amount DESC NULLS LAST LIMIT 50";

  try {
    const result = await cortexCall(
      token,
      sessionId,
      "sf_opps",
      "salesforce__run_soql_query",
      { query }
    );
    const records: Record<string, unknown>[] = result?.records ?? [];
    return records.map((r) => ({
      id: r.Id as string,
      sf_opportunity_id: r.Id as string,
      name: r.Name as string,
      amount: Number(r.Amount ?? 0),
      stage: r.StageName as string,
      close_date: r.CloseDate as string,
      account_name:
        ((r.Account as Record<string, unknown>)?.Name as string) || "",
      owner_name:
        ((r.Owner as Record<string, unknown>)?.Name as string) || "",
      probability: Number(r.Probability ?? 0),
      is_closed: false,
      is_won: false,
      record_type:
        ((r.RecordType as Record<string, unknown>)?.Name as string) ||
        (r.Type as string) ||
        "",
      territory: "",
      sales_channel: "",
      days_in_stage: null,
      days_to_close: Math.ceil(
        (new Date(r.CloseDate as string).getTime() - Date.now()) / 86400000
      ),
      has_overdue_task: false,
      sf_url: `https://sonance.lightning.force.com/lightning/r/Opportunity/${r.Id as string}/view`,
    }));
  } catch {
    return [];
  }
}

// ─── Connection check helpers ─────────────────────────────────────────────

function hasConnection(connections: CortexConnection[], mcpName: string): boolean {
  return connections.some(
    (c) => (c.mcp_name === mcpName || c.provider === mcpName) && c.connected
  );
}

// ─── Main handler ─────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const cortexToken = getCortexToken(request);
  if (!cortexToken) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  const errors: Record<string, string | null> = {};
  const skipped: string[] = [];
  const cortexUser = await getCortexUserFromRequest(request);
  const authenticatedUser: AuthenticatedUser = {
    name: cortexUser?.name ?? "",
    email: cortexUser?.email ?? "",
  };
  let attentionSelections: LiveAttentionSelections = {
    providerImportance: {},
    mailFolders: [],
    asanaProjects: [],
    slackChannels: [],
    teamsTeams: [],
    teamsChannels: [],
  };

  if (cortexUser) {
    try {
      const profile = await loadAttentionProfile(cortexUser.sub);
      attentionSelections = collectAttentionSelections(profile.focusPreferences);
    } catch (error) {
      errors.preferences = String(error);
    }
  }

  // Check which services the user has connected via Cortex (with retry + cache fallback)
  const connectionsResult = await getConnections(cortexToken, cortexUser?.sub);
  const connections = connectionsResult.connections;
  const connectionError = connectionsResult.fromCache;
  const hasM365 = hasConnection(connections, "m365") || hasConnection(connections, "microsoft");
  const hasAsana = hasConnection(connections, "asana");
  const hasSlack = hasConnection(connections, "slack");
  const hasSalesforce = hasConnection(connections, "salesforce");
  const hasPowerBI = hasConnection(connections, "powerbi");
  const hasMonday = hasConnection(connections, "monday");

  console.log("[live] Connection status:", { hasM365, hasAsana, hasSlack, hasSalesforce, hasPowerBI, hasMonday, fromCache: connectionError });

  // Cache connection status to Supabase (fire-and-forget)
  if (!connectionError && cortexUser?.sub) {
    void cacheConnectionStatus(cortexUser.sub, connections);
  }

  // Initialize Cortex session with user's token
  let sessionId = "";
  try {
    sessionId = await cortexInit(cortexToken);
  } catch (e) {
    errors.cortex = String(e);
  }

  if (!sessionId) {
    return NextResponse.json(
      {
        emails: [],
        sentEmails: [],
        calendar: [],
        tasks: [],
        asanaComments: [],
        chats: [],
        teamsChannelMessages: [],
        slack: [],
        powerbi: { reports: [], kpis: [] },
        pipeline: [],
        fetchedAt: new Date().toISOString(),
        source: "live",
        errors,
        skipped: ["all — no Cortex session"],
        connections: { m365: hasM365, asana: hasAsana, slack: hasSlack, salesforce: hasSalesforce, powerbi: hasPowerBI, monday: hasMonday },
        connectionError,
      },
      { status: 200 }
    );
  }

  // Only fetch data for services the user has connected
  const fetches: Record<string, Promise<unknown>> = {};

  if (hasM365) {
    if (!shouldSkipProvider(attentionSelections, "outlook_mail")) {
      fetches.emails = fetchEmails(
        cortexToken,
        sessionId,
        attentionSelections.mailFolders
      );
      fetches.sentEmails = fetchSentEmails(cortexToken, sessionId);
    } else {
      skipped.push("outlook_mail");
    }

    if (!shouldSkipProvider(attentionSelections, "outlook_calendar")) {
      fetches.calendar = fetchCalendar(
        cortexToken,
        sessionId,
        getProviderImportance(attentionSelections, "outlook_calendar")
      );
    } else {
      skipped.push("outlook_calendar");
    }

    if (!shouldSkipProvider(attentionSelections, "teams")) {
      fetches.chats = fetchTeamsChats(cortexToken, sessionId);
      fetches.teamsChannelMessages = fetchTeamsChannelMessages(
        cortexToken,
        sessionId,
        attentionSelections.teamsTeams,
        attentionSelections.teamsChannels
      );
    } else {
      skipped.push("teams");
    }
  } else {
    skipped.push("m365");
  }

  if (hasAsana) {
    if (!shouldSkipProvider(attentionSelections, "asana")) {
      const asanaPromise = fetchAsanaTasks(
        cortexToken,
        sessionId,
        attentionSelections.asanaProjects
      );
      fetches.tasks = asanaPromise.then((result) => result.tasks);
      fetches.asanaProjects = asanaPromise.then((result) => result.asanaProjects);
      fetches.asanaComments = asanaPromise.then((result) =>
        fetchAsanaCommentThreads(
          cortexToken,
          sessionId,
          result.tasks as Task[],
          authenticatedUser
        )
      );
    } else {
      skipped.push("asana");
    }
  } else {
    skipped.push("asana");
  }

  if (hasSlack) {
    if (!shouldSkipProvider(attentionSelections, "slack")) {
      fetches.slack = fetchSlackMessages(
        cortexToken,
        sessionId,
        attentionSelections.slackChannels
      );
    } else {
      skipped.push("slack");
    }
  } else {
    skipped.push("slack");
  }

  if (hasPowerBI) {
    fetches.powerbi = fetchPowerBI(cortexToken, sessionId);
  } else {
    skipped.push("powerbi");
  }

  if (hasSalesforce) {
    fetches.pipeline = fetchSalesforce(cortexToken, sessionId);
    fetches.sfKpis = fetchSalesforceKPIs(cortexToken, sessionId);
  } else {
    skipped.push("salesforce");
  }

  // Execute all fetches in parallel
  const keys = Object.keys(fetches);
  const results = await Promise.allSettled(Object.values(fetches));
  const resolved: Record<string, unknown> = {};
  for (let i = 0; i < keys.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      resolved[keys[i]] = r.value;
    } else {
      errors[keys[i]] = String(r.reason);
      resolved[keys[i]] = keys[i] === "powerbi" ? { reports: [], kpis: [] } : [];
    }
  }

  const pbi = (resolved.powerbi ?? { reports: [], kpis: [] }) as { reports: unknown[]; kpis: unknown[] };
  const sfKpis = (resolved.sfKpis ?? []) as unknown[];

  // Fire-and-forget: persist people interaction snapshots for relevance scoring
  if (cortexUser) {
    void persistPeopleSnapshots(
      cortexUser.sub,
      authenticatedUser.name,
      authenticatedUser.email,
      resolved,
      createServiceClient()
    );
  }

  return NextResponse.json({
    emails: resolved.emails ?? [],
    sentEmails: resolved.sentEmails ?? [],
    calendar: resolved.calendar ?? [],
    tasks: resolved.tasks ?? [],
    asanaComments: resolved.asanaComments ?? [],
    asanaProjects: resolved.asanaProjects ?? [],
    chats: resolved.chats ?? [],
    teamsChannelMessages: resolved.teamsChannelMessages ?? [],
    slack: resolved.slack ?? [],
    powerbi: {
      ...pbi,
      kpis: sfKpis.length > 0 ? sfKpis : pbi.kpis,
    },
    pipeline: resolved.pipeline ?? [],
    fetchedAt: new Date().toISOString(),
    source: "live",
    errors,
    skipped,
    connections: { m365: hasM365, asana: hasAsana, slack: hasSlack, salesforce: hasSalesforce, powerbi: hasPowerBI, monday: hasMonday },
  });
}
