import { describe, expect, it } from "vitest";
import { buildCapturePrompt } from "@/lib/capture-routing";
import type { CaptureRequest, VaultSearchResult } from "@/lib/capture-routing";

describe("buildCapturePrompt", () => {
  it("includes source content, metadata, and candidates in the prompt", () => {
    const request: CaptureRequest = {
      content: "Debbie mentioned the Q2 budget is tight.",
      sourceType: "email",
      sourceMeta: {
        from: "Debbie Michelle",
        subject: "Q2 Plans",
        timestamp: "2026-04-10T14:00:00Z",
        url: "https://outlook.example/msg/123",
      },
    };

    const candidates: VaultSearchResult[] = [
      {
        file_path: "company/people/debbie-michelle.md",
        title: "Debbie Michelle",
        folder: "company/people",
        tags: ["person", "marketing"],
        rank: 0.9,
      },
    ];

    const prompt = buildCapturePrompt(request, candidates);

    expect(prompt).toContain("Debbie mentioned the Q2 budget is tight.");
    expect(prompt).toContain("Q2 Plans");
    expect(prompt).toContain("Debbie Michelle");
    expect(prompt).toContain("company/people/debbie-michelle.md");
    expect(prompt).toContain("append");
    expect(prompt).toContain("create");
    expect(prompt).toContain("company/intelligence/captures");
  });

  it("handles empty candidates list", () => {
    const request: CaptureRequest = {
      content: "standalone note",
      sourceType: "calendar",
      sourceMeta: { timestamp: "2026-04-10T14:00:00Z" },
    };

    const prompt = buildCapturePrompt(request, []);
    expect(prompt).toContain("standalone note");
    expect(prompt).toContain("No candidate pages found");
  });
});
