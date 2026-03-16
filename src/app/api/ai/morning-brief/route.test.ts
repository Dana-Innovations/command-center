import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import {
  computeSnapshotHash,
  type BriefApiSnapshot,
  type MorningBrief,
  type MorningBriefDraft,
} from "@/lib/morning-brief";

const {
  anthropicMock,
  createServiceClientMock,
  generateTextMock,
  getCortexUserFromRequestMock,
} = vi.hoisted(() => ({
  anthropicMock: vi.fn(() => "mock-model"),
  createServiceClientMock: vi.fn(),
  generateTextMock: vi.fn(),
  getCortexUserFromRequestMock: vi.fn(),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: anthropicMock,
}));

vi.mock("ai", () => ({
  generateText: generateTextMock,
}));

vi.mock("@/lib/cortex/user", () => ({
  getCortexUserFromRequest: getCortexUserFromRequestMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: createServiceClientMock,
}));

import { POST } from "@/app/api/ai/morning-brief/route";

function makeRequest(body: unknown | string): NextRequest {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("http://localhost/api/ai/morning-brief", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
  }) as NextRequest;
}

function createSnapshot(): BriefApiSnapshot {
  return {
    communications: [
      {
        itemType: "email",
        itemId: "email-1",
        provider: "outlook_mail",
        title: 'CEO "quote" {priority}',
        preview: "Need a response before lunch",
        sender: "Dana",
        url: "https://outlook.example/email-1",
        score: 70,
        timestamp: new Date("2026-03-15T14:00:00.000Z").toISOString(),
      },
    ],
    calendar: [
      {
        eventId: "event-1",
        subject: "Morning revenue review",
        organizer: "Taylor",
        location: "Board room",
        startTime: new Date("2026-03-15T17:00:00.000Z").toISOString(),
        endTime: new Date("2026-03-15T18:00:00.000Z").toISOString(),
        isAllDay: false,
        score: 62,
      },
    ],
    tasks: [
      {
        itemType: "asana_task",
        itemId: "task-1",
        provider: "asana",
        title: "Close open action items",
        preview: "1d overdue · Exec Ops",
        sender: "Ari",
        url: "https://asana.example/task-1",
        score: 72,
        timestamp: new Date("2026-03-15T13:00:00.000Z").toISOString(),
      },
    ],
    pipeline: [
      {
        oppId: "opp-1",
        name: "Project Horizon",
        accountName: "Acme",
        amount: 250000,
        stage: "Proposal",
        daysToClose: 3,
        probability: 60,
      },
    ],
    operations: [
      {
        id: "order-1",
        name: "Pacific install",
        status: "DWG NEEDED",
        location: "Los Angeles",
      },
    ],
    counts: {
      emailsNeedingReply: 1,
      overdueTasks: 1,
      meetingsToday: 1,
      dealsClosingThisWeek: 1,
    },
  };
}

function createBriefDraft(): MorningBriefDraft {
  return {
    headline: "Dana needs a reply and the exec review starts this morning.",
    priorityActions: [
      {
        id: "action-0",
        text: "Reply to Dana before the revenue review.",
        urgency: "now",
        source: {
          itemType: "email",
          itemId: "email-1",
          provider: "outlook_mail",
          title: 'CEO "quote" {priority}',
          url: "https://outlook.example/email-1",
        },
        attentionScore: 70,
      },
    ],
    crossCorrelations: [
      {
        id: "correlation-0",
        text: "The email urgency lines up with the revenue meeting and overdue task.",
        entities: ["Dana", "Project Horizon"],
        sources: [
          {
            itemType: "email",
            itemId: "email-1",
            provider: "outlook_mail",
          },
        ],
      },
    ],
    calendarHighlights: [
      {
        id: "calendar-0",
        text: "Revenue review is where this answer will be discussed.",
        eventId: "event-1",
        startTime: new Date("2026-03-15T17:00:00.000Z").toISOString(),
      },
    ],
    overnightChanges: [
      {
        id: "change-0",
        text: "Project Horizon remains at risk ahead of close.",
        severity: "warning",
        source: {
          itemType: "asana_task",
          itemId: "task-1",
          provider: "asana",
        },
      },
    ],
    keyNumbers: [
      {
        id: "metric-0",
        label: "Deals closing this week",
        value: "1",
        trend: "flat",
        context: "Project Horizon closes in 3 days.",
      },
    ],
  };
}

function createStoredBrief(overrides: Partial<MorningBrief> = {}): MorningBrief {
  return {
    generatedAt: new Date("2026-03-15T16:00:00.000Z").toISOString(),
    ...createBriefDraft(),
    ...overrides,
  };
}

function createSupabaseMock(options?: {
  cached?: {
    brief_json: unknown;
    expires_at: string;
    input_hash: string;
  } | null;
}) {
  const maybeSingle = vi
    .fn()
    .mockResolvedValue({ data: options?.cached ?? null, error: null });
  const eqBriefDate = vi.fn(() => ({ maybeSingle }));
  const eqUser = vi.fn(() => ({ eq: eqBriefDate }));
  const select = vi.fn(() => ({ eq: eqUser }));
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn(() => ({ select, upsert }));

  return {
    client: { from },
    maybeSingle,
    upsert,
  };
}

describe("/api/ai/morning-brief", () => {
  const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T16:00:00.000Z"));
    process.env.ANTHROPIC_API_KEY = "test-key";
    getCortexUserFromRequestMock.mockResolvedValue({
      sub: "user-1",
      name: "Ari",
      email: "ari@example.com",
    });
    createServiceClientMock.mockReset();
    generateTextMock.mockReset();
    anthropicMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalAnthropicKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    }
  });

  it("returns 401 when the request is unauthenticated", async () => {
    getCortexUserFromRequestMock.mockResolvedValue(null);

    const response = await POST(makeRequest({ snapshot: createSnapshot() }));

    expect(response.status).toBe(401);
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("returns 500 when ANTHROPIC_API_KEY is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const response = await POST(makeRequest({ snapshot: createSnapshot() }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("ANTHROPIC_API_KEY not configured");
  });

  it("returns 400 for invalid JSON", async () => {
    const response = await POST(makeRequest("{not-json"));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid JSON");
  });

  it("returns 400 when snapshot is missing", async () => {
    const response = await POST(makeRequest({ force: false }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("body.snapshot");
  });

  it("returns a cached brief when the input hash still matches", async () => {
    const snapshot = createSnapshot();
    const cachedBrief = createStoredBrief();
    const supabase = createSupabaseMock({
      cached: {
        brief_json: cachedBrief,
        expires_at: new Date("2026-03-15T20:00:00.000Z").toISOString(),
        input_hash: computeSnapshotHash(snapshot),
      },
    });
    createServiceClientMock.mockReturnValue(supabase.client);

    const response = await POST(makeRequest({ snapshot }));
    const data = (await response.json()) as {
      brief: MorningBrief;
      cached: boolean;
    };

    expect(response.status).toBe(200);
    expect(data.cached).toBe(true);
    expect(data.brief.headline).toBe(cachedBrief.headline);
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(supabase.upsert).not.toHaveBeenCalled();
  });

  it("generates, validates, caches, and returns a fresh brief", async () => {
    const snapshot = createSnapshot();
    const supabase = createSupabaseMock();
    createServiceClientMock.mockReturnValue(supabase.client);
    generateTextMock.mockResolvedValue({
      text: JSON.stringify(createBriefDraft()),
      usage: { totalTokens: 321 },
    });

    const response = await POST(makeRequest({ snapshot }));
    const data = (await response.json()) as {
      brief: MorningBrief;
      cached: boolean;
    };

    expect(response.status).toBe(200);
    expect(data.cached).toBe(false);
    expect(data.brief.headline).toBe(createBriefDraft().headline);
    expect(data.brief.generatedAt).toBe(
      new Date("2026-03-15T16:00:00.000Z").toISOString()
    );
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(supabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        cortex_user_id: "user-1",
        input_hash: computeSnapshotHash(snapshot),
        model_id: "claude-sonnet-4-20250514",
        token_count: 321,
      }),
      { onConflict: "cortex_user_id,brief_date" }
    );
  });

  it("returns 502 when the AI response is not valid JSON", async () => {
    const supabase = createSupabaseMock();
    createServiceClientMock.mockReturnValue(supabase.client);
    generateTextMock.mockResolvedValue({
      text: "not valid json",
      usage: { totalTokens: 111 },
    });

    const response = await POST(makeRequest({ snapshot: createSnapshot() }));
    const data = await response.json();

    expect(response.status).toBe(502);
    expect(data.error).toBe("Failed to parse AI response as JSON");
  });

  it("returns 502 when the AI response fails schema validation", async () => {
    const supabase = createSupabaseMock();
    createServiceClientMock.mockReturnValue(supabase.client);
    generateTextMock.mockResolvedValue({
      text: JSON.stringify({
        ...createBriefDraft(),
        priorityActions: "wrong-shape",
      }),
      usage: { totalTokens: 222 },
    });

    const response = await POST(makeRequest({ snapshot: createSnapshot() }));
    const data = await response.json();

    expect(response.status).toBe(502);
    expect(data.error).toContain("AI response schema mismatch");
  });
});
