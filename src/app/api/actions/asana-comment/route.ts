import { NextRequest, NextResponse } from "next/server";
import { cortexCall, cortexInit, getCortexToken } from "@/lib/cortex/client";
import { getCortexUserFromRequest } from "@/lib/cortex/user";
import type { AsanaCommentEntry } from "@/lib/types";

function normalizeAsanaText(value: unknown): string {
  const raw = String(value ?? "");

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

export async function POST(request: NextRequest) {
  try {
    const user = await getCortexUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const cortexToken = getCortexToken(request)!;

    const body = (await request.json()) as {
      taskGid?: string;
      text?: string;
    };

    const taskGid = String(body.taskGid ?? "").trim();
    const text = String(body.text ?? "").trim();

    if (!taskGid || !text) {
      return NextResponse.json(
        { error: "taskGid and text are required" },
        { status: 400 }
      );
    }

    const sessionId = await cortexInit(cortexToken);
    const result = (await cortexCall(
      cortexToken,
      sessionId,
      `asana-comment-${taskGid}`,
      "asana__add_comment",
      {
        task_gid: taskGid,
        text,
      }
    )) as Record<string, unknown>;

    const payload =
      typeof result.comment === "object" && result.comment && !Array.isArray(result.comment)
        ? (result.comment as Record<string, unknown>)
        : result;
    const now = new Date().toISOString();

    const comment: AsanaCommentEntry = {
      id: String(payload.gid ?? payload.id ?? `${taskGid}:${now}`),
      text: normalizeAsanaText(
        payload.text ?? payload.html_text ?? payload.content ?? text
      ),
      created_at: String(payload.created_at ?? payload.createdAt ?? now),
      author_name: user.name || user.email || "You",
      author_email: user.email || null,
    };

    return NextResponse.json({ ok: true, comment });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to post Asana comment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
