import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { getCortexUserFromRequest } from "@/lib/cortex/user";
import { createServiceClient } from "@/lib/supabase/server";
import {
  type MorningBrief,
  type MorningBriefResponseBody,
  buildBriefPrompt,
  computeSnapshotHash,
  parseMorningBriefDraft,
  parseMorningBriefRequestBody,
  parseStoredMorningBrief,
} from "@/lib/morning-brief";

const BRIEF_SYSTEM_PROMPT = `You are an executive briefing assistant. Synthesize data from multiple business systems (email, calendar, tasks, Slack, Teams, Salesforce, Monday.com) into a concise, actionable morning brief.

Rules:
- Be direct and specific. Name people, deals, and projects.
- Prioritize actions that have deadlines today or are overdue.
- Highlight cross-service correlations (e.g., a meeting today with someone who also emailed and has an open deal).
- Severity levels: "critical" = needs action in hours, "warning" = needs attention today, "info" = awareness only.
- Headline: 1-2 sentences maximum.
- Each action should be a single, clear directive.
- CRITICAL: For each priorityAction, preserve the source object (itemType, itemId, provider, title) exactly as provided in the input data. This is required for the feedback system.
- Return valid JSON matching the exact schema requested. No markdown, no code fences, just raw JSON.`;

const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

export async function POST(request: NextRequest) {
  const user = await getCortexUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const body = parseMorningBriefRequestBody(rawBody);
  if (!body.ok) {
    return NextResponse.json(
      { error: body.error },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();
  const todayDate = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Los_Angeles",
  });
  const inputHash = computeSnapshotHash(body.value.snapshot);

  // --- Check cache ---
  if (!body.value.force) {
    const { data: cached } = await supabase
      .from("morning_brief_cache")
      .select("brief_json, expires_at, input_hash")
      .eq("cortex_user_id", user.sub)
      .eq("brief_date", todayDate)
      .maybeSingle();

    const parsedCached = parseStoredMorningBrief(cached?.brief_json);
    if (
      cached &&
      parsedCached.ok &&
      cached.input_hash === inputHash &&
      new Date(cached.expires_at) > new Date()
    ) {
      return NextResponse.json({
        brief: parsedCached.value,
        cached: true,
      } satisfies MorningBriefResponseBody);
    }
  }

  // --- Generate brief via Claude ---
  const prompt = buildBriefPrompt(body.value.snapshot);

  try {
    const result = await generateText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: BRIEF_SYSTEM_PROMPT,
      prompt,
      maxOutputTokens: 2500,
    });

    const text = result.text.trim();
    if (!text) {
      return NextResponse.json(
        { error: "Empty response from AI" },
        { status: 502 }
      );
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse AI response as JSON" },
        { status: 502 }
      );
    }

    const parsed = parseMorningBriefDraft(parsedJson);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: `AI response schema mismatch: ${parsed.error}` },
        { status: 502 }
      );
    }

    const brief: MorningBrief = {
      generatedAt: new Date().toISOString(),
      ...parsed.value,
    };

    // --- Cache the result ---
    const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString();
    const tokenCount = result.usage?.totalTokens ?? null;

    await supabase.from("morning_brief_cache").upsert(
      {
        cortex_user_id: user.sub,
        brief_date: todayDate,
        brief_json: brief,
        input_hash: inputHash,
        generated_at: brief.generatedAt,
        expires_at: expiresAt,
        model_id: "claude-sonnet-4-20250514",
        token_count: tokenCount,
      },
      { onConflict: "cortex_user_id,brief_date" }
    );

    return NextResponse.json({
      brief,
      cached: false,
    } satisfies MorningBriefResponseBody);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Morning brief generation error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
