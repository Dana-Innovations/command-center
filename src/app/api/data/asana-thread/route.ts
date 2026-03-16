import { NextRequest, NextResponse } from "next/server";
import { cortexCall, cortexInit, getCortexToken } from "@/lib/cortex/client";
import type { AsanaCommentEntry, AsanaThreadDetail } from "@/lib/types";

const CORTEX_URL = process.env.NEXT_PUBLIC_CORTEX_URL ?? "";

interface SessionTool {
  name: string;
  inputSchema?: {
    properties?: Record<string, unknown>;
  };
}

interface AsanaPerson {
  gid: string;
  name: string;
  email: string;
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

function normalizeAsanaText(value: unknown): string {
  const raw =
    typeof value === "string"
      ? value
      : value && typeof value === "object"
        ? String(
            (value as Record<string, unknown>).text ??
              (value as Record<string, unknown>).content ??
              (value as Record<string, unknown>).html_text ??
              (value as Record<string, unknown>).htmlText ??
              (value as Record<string, unknown>).display_value ??
              ""
          )
        : "";

  return raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/<[^>]*>/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
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

async function cortexSessionRequest(
  token: string,
  sessionId: string,
  id: string,
  method: "tools/list",
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
      "asana_tools_list",
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

function selectTool(
  tools: SessionTool[],
  exactNames: string[],
  fallback?: (tool: SessionTool) => boolean
): SessionTool | null {
  for (const candidate of exactNames) {
    const match = tools.find((tool) => tool.name === candidate);
    if (match) return match;
  }

  return fallback ? tools.find((tool) => fallback(tool)) ?? null : null;
}

function buildTaskScopedArgs(
  tool: SessionTool | null,
  taskGid: string,
  limit?: number
): Record<string, unknown> {
  const props = Object.keys(tool?.inputSchema?.properties ?? {});
  const args: Record<string, unknown> = {};

  if (props.length === 0) {
    return limit ? { task_gid: taskGid, limit } : { task_gid: taskGid };
  }

  if (props.includes("task_gid")) args.task_gid = taskGid;
  if (props.includes("task_id")) args.task_id = taskGid;
  if (props.includes("gid")) args.gid = taskGid;
  if (props.includes("task")) args.task = taskGid;
  if (props.includes("resource_gid")) args.resource_gid = taskGid;
  if (props.includes("resource_id")) args.resource_id = taskGid;
  if (typeof limit === "number") {
    if (props.includes("limit")) args.limit = limit;
    if (props.includes("count")) args.count = limit;
    if (props.includes("max_results")) args.max_results = limit;
    if (props.includes("per_page")) args.per_page = limit;
  }

  if (Object.keys(args).length === 0) {
    return limit ? { task_gid: taskGid, limit } : { task_gid: taskGid };
  }

  return args;
}

function isHumanCommentStory(story: Record<string, unknown>): boolean {
  const subtype = String(
    story.resource_subtype ?? story.subtype ?? story.story_type ?? story.type ?? ""
  ).toLowerCase();
  const text = normalizeAsanaText(
    story.text ??
      story.html_text ??
      story.content ??
      story.body ??
      story.description
  );

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

function extractCommentEntry(
  comment: Record<string, unknown>,
  fallbackId: string
): AsanaCommentEntry | null {
  const author = toAsanaPerson(
    comment.created_by ??
      comment.createdBy ??
      comment.author ??
      comment.user ??
      comment.actor
  );
  const text = normalizeAsanaText(
    comment.text ??
      comment.html_text ??
      comment.content ??
      comment.body ??
      comment.description
  );

  if (!text) return null;

  const createdAt = String(
    comment.created_at ??
      comment.createdAt ??
      comment.occurred_at ??
      comment.timestamp ??
      new Date().toISOString()
  );

  return {
    id: String(comment.gid ?? comment.id ?? fallbackId),
    text,
    created_at: createdAt,
    author_name: author?.name || "Asana",
    author_email: author?.email || null,
  };
}

function extractRecentComments(payload: Record<string, unknown>): AsanaCommentEntry[] {
  const comments = firstArrayProperty(payload, [
    "comments",
    "stories",
    "items",
    "data",
    "events",
    "value",
  ]);

  return comments
    .map((comment, index) => extractCommentEntry(comment, `comment-${index}`))
    .filter((comment): comment is AsanaCommentEntry => comment !== null)
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    .slice(-5);
}

function extractRecentCommentsFromStories(
  payload: Record<string, unknown>
): AsanaCommentEntry[] {
  const stories = firstArrayProperty(payload, [
    "stories",
    "comments",
    "items",
    "data",
    "events",
    "value",
  ]);

  return stories
    .filter(isHumanCommentStory)
    .map((story, index) => extractCommentEntry(story, `story-${index}`))
    .filter((comment): comment is AsanaCommentEntry => comment !== null)
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    .slice(-5);
}

function extractTaskRecord(payload: Record<string, unknown>): Record<string, unknown> {
  const directRecord =
    typeof payload.task === "object" && payload.task && !Array.isArray(payload.task)
      ? (payload.task as Record<string, unknown>)
      : typeof payload.data === "object" && payload.data && !Array.isArray(payload.data)
        ? (payload.data as Record<string, unknown>)
        : typeof payload.value === "object" && payload.value && !Array.isArray(payload.value)
          ? (payload.value as Record<string, unknown>)
          : null;

  if (directRecord) return directRecord;

  const firstRecord = firstArrayProperty(payload, ["data", "value", "items"])[0];
  if (firstRecord) return firstRecord;

  return payload;
}

function extractProject(task: Record<string, unknown>) {
  const directName = String(task.project_name ?? "").trim();
  const directGid = String(task.project_gid ?? "").trim();
  if (directName || directGid) {
    return {
      projectName: directName || "Tasks",
      projectGid: directGid || null,
    };
  }

  const projects = firstArrayProperty(task, ["projects", "memberships"]);
  for (const project of projects) {
    if (project.project && typeof project.project === "object") {
      const nested = project.project as Record<string, unknown>;
      const projectName = String(nested.name ?? "").trim();
      const projectGid = String(nested.gid ?? nested.id ?? "").trim();
      if (projectName || projectGid) {
        return {
          projectName: projectName || "Tasks",
          projectGid: projectGid || null,
        };
      }
    }

    const projectName = String(project.name ?? "").trim();
    const projectGid = String(project.gid ?? project.id ?? "").trim();
    if (projectName || projectGid) {
      return {
        projectName: projectName || "Tasks",
        projectGid: projectGid || null,
      };
    }
  }

  return {
    projectName: "Tasks",
    projectGid: null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const cortexToken = getCortexToken(request);
    if (!cortexToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const taskGid = request.nextUrl.searchParams.get("taskGid");
    if (!taskGid) {
      return NextResponse.json(
        { error: "taskGid is required" },
        { status: 400 }
      );
    }

    const sessionId = await cortexInit(cortexToken);
    const tools = await listSessionTools(cortexToken, sessionId);
    const taskTool =
      selectTool(
        tools,
        ["asana__get_task"],
        (tool) =>
          tool.name.startsWith("asana__") &&
          tool.name.includes("get_task")
      ) ?? { name: "asana__get_task" };

    const commentsTool = selectTool(
      tools,
      ["asana__list_task_comments", "asana__list_comments"],
      (tool) =>
        tool.name.startsWith("asana__") &&
        tool.name.includes("comment") &&
        tool.name.includes("task")
    );

    const storyTool = selectTool(
      tools,
      [
        "asana__list_task_stories",
        "asana__get_task_stories",
        "asana__list_stories",
        "asana__get_stories",
      ],
      (tool) =>
        tool.name.startsWith("asana__") &&
        (tool.name.includes("story") || tool.name.includes("comment")) &&
        tool.name.includes("task")
    );

    let rawTask: Record<string, unknown> = {};
    try {
      rawTask = await cortexCall(
        cortexToken,
        sessionId,
        `asana-task-${taskGid}`,
        taskTool.name,
        buildTaskScopedArgs(taskTool, taskGid)
      );
    } catch {
      rawTask = {};
    }

    const task = extractTaskRecord(rawTask);
    const project = extractProject(task);
    const assignee = toAsanaPerson(task.assignee);
    const now = new Date().toISOString();

    let recentComments: AsanaCommentEntry[] = [];

    if (commentsTool) {
      try {
        const rawComments = await cortexCall(
          cortexToken,
          sessionId,
          `asana-comments-${taskGid}`,
          commentsTool.name,
          buildTaskScopedArgs(commentsTool, taskGid, 8)
        );
        recentComments = extractRecentComments(
          rawComments as Record<string, unknown>
        );
      } catch {
        recentComments = [];
      }
    }

    if (recentComments.length === 0 && storyTool) {
      try {
        const rawStories = await cortexCall(
          cortexToken,
          sessionId,
          `asana-stories-${taskGid}`,
          storyTool.name,
          buildTaskScopedArgs(storyTool, taskGid, 12)
        );
        recentComments = extractRecentCommentsFromStories(
          rawStories as Record<string, unknown>
        );
      } catch {
        recentComments = [];
      }
    }

    const detail: AsanaThreadDetail = {
      task_gid: taskGid,
      task_name: String(task.name ?? "Asana task"),
      task_due_on: String(task.due_on ?? task.due_date ?? "").trim() || null,
      project_gid: project.projectGid,
      project_name: project.projectName,
      permalink_url: String(task.permalink_url ?? ""),
      completed: Boolean(task.completed),
      notes: normalizeAsanaText(task.notes ?? task.description ?? ""),
      assignee_name: assignee?.name || null,
      assignee_email: assignee?.email || null,
      recent_comments: recentComments,
      synced_at: now,
    };

    return NextResponse.json(detail);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to fetch Asana thread";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
