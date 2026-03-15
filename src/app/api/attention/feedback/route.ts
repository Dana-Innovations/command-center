import { NextRequest, NextResponse } from "next/server";
import type { AttentionTarget } from "@/lib/attention/types";
import { applyAttentionFeedback } from "@/lib/attention/server";
import { getCortexUserFromRequest } from "@/lib/cortex/user";

function normalizeTarget(value: unknown): AttentionTarget | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;

  const provider = String(record.provider ?? "").trim();
  const itemType = String(record.itemType ?? "").trim();
  const itemId = String(record.itemId ?? "").trim();
  const title = String(record.title ?? "").trim();
  const timestamp = String(record.timestamp ?? new Date().toISOString());
  const baseScore = Number(record.baseScore ?? 0);
  if (!provider || !itemType || !itemId || !title) return null;

  return {
    provider: provider as AttentionTarget["provider"],
    itemType,
    itemId,
    title,
    timestamp,
    baseScore: Number.isFinite(baseScore) ? baseScore : 0,
    surface: typeof record.surface === "string" ? record.surface : undefined,
    resourceKeys: Array.isArray(record.resourceKeys)
      ? record.resourceKeys.filter((entry): entry is string => typeof entry === "string")
      : [],
    actorKeys: Array.isArray(record.actorKeys)
      ? record.actorKeys.filter((entry): entry is string => typeof entry === "string")
      : [],
    topicKeys: Array.isArray(record.topicKeys)
      ? record.topicKeys.filter((entry): entry is string => typeof entry === "string")
      : [],
    metadata:
      record.metadata && typeof record.metadata === "object"
        ? (record.metadata as Record<string, unknown>)
        : {},
  };
}

export async function POST(request: NextRequest) {
  const user = await getCortexUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      target?: unknown;
      feedback?: "raise" | "right" | "lower";
      surface?: string;
    };

    const target = normalizeTarget(body.target);
    if (!target) {
      return NextResponse.json({ error: "Invalid target payload" }, { status: 400 });
    }

    if (body.feedback !== "raise" && body.feedback !== "right" && body.feedback !== "lower") {
      return NextResponse.json({ error: "Invalid feedback value" }, { status: 400 });
    }

    const profile = await applyAttentionFeedback({
      cortexUserId: user.sub,
      target,
      feedback: body.feedback,
      surface: body.surface || target.surface || "unknown",
    });

    return NextResponse.json({
      ok: true,
      profile,
      explanation:
        body.feedback === "raise"
          ? "We will nudge similar items upward."
          : body.feedback === "lower"
            ? "We will soften similar items in future rankings."
            : "We will stabilize similar items around their current level.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to record feedback" },
      { status: 500 }
    );
  }
}
