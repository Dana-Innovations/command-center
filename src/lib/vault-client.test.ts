import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(),
            maybeSingle: vi.fn(),
          })),
          single: vi.fn(),
          maybeSingle: vi.fn(),
          ilike: vi.fn(() => ({
            single: vi.fn(),
            maybeSingle: vi.fn(),
          })),
          limit: vi.fn(() => ({
            then: vi.fn(),
          })),
        })),
        limit: vi.fn(),
      })),
      rpc: vi.fn(),
    })),
    rpc: vi.fn(),
  })),
}));

describe("searchVaultText", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("VAULT_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VAULT_SUPABASE_SERVICE_ROLE_KEY", "test-key");
    vi.resetModules();
  });

  it("returns formatted search results", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const mockRpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: "uuid-1",
          file_path: "company/initiatives/studio-visit.md",
          title: "Studio Visit Capture",
          content: "Initiative about capturing studio visits...",
          folder: "company/initiatives",
          tags: ["sonance", "crm", "sales"],
          rank: 0.85,
        },
      ],
      error: null,
    });
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue({ rpc: mockRpc, from: vi.fn() });

    const { searchVaultText } = await import("@/lib/vault-client");
    const results = await searchVaultText("studio visit");

    expect(mockRpc).toHaveBeenCalledWith("search_vault_text", {
      search_query: "studio visit",
      match_count: 10,
    });
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      file_path: "company/initiatives/studio-visit.md",
      title: "Studio Visit Capture",
      folder: "company/initiatives",
      tags: ["sonance", "crm", "sales"],
      rank: 0.85,
    });
  });

  it("returns empty array when vault is not configured", async () => {
    vi.stubEnv("VAULT_SUPABASE_URL", "");
    vi.stubEnv("VAULT_SUPABASE_SERVICE_ROLE_KEY", "");
    vi.resetModules();

    const { searchVaultText } = await import("@/lib/vault-client");
    const results = await searchVaultText("anything");
    expect(results).toEqual([]);
  });

  it("returns empty array on error", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: { message: "timeout" } });
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue({ rpc: mockRpc, from: vi.fn() });

    const { searchVaultText } = await import("@/lib/vault-client");
    const results = await searchVaultText("test");
    expect(results).toEqual([]);
  });
});

describe("getVaultPerson", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("VAULT_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VAULT_SUPABASE_SERVICE_ROLE_KEY", "test-key");
    vi.resetModules();
  });

  it("returns person data with department from frontmatter", async () => {
    const { createClient } = await import("@supabase/supabase-js");

    const mockRow = {
      file_path: "company/people/debbie-michelle.md",
      title: "Debbie Michelle",
      content: "Debbie leads the marketing department and is responsible for brand strategy. She reports to the CEO.",
      frontmatter: { type: "person", department: "Marketing", title: "Debbie Michelle", aliases: ["Debbie Michelle"] },
      tags: ["person", "marketing"],
      wikilinks: ["derick-dahl"],
      backlinks: ["company/intelligence/slt-monthly-2026-03/marketing.md"],
    };

    const mockSingle = vi.fn().mockResolvedValue({ data: mockRow, error: null });
    const mockIlike = vi.fn(() => ({ single: mockSingle }));
    const mockEqFolder = vi.fn(() => ({ ilike: mockIlike }));
    const mockEq = vi.fn(() => ({ eq: mockEqFolder }));
    const mockSelect = vi.fn(() => ({ eq: mockEq }));
    const mockFrom = vi.fn(() => ({ select: mockSelect }));
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom, rpc: vi.fn() });

    const { getVaultPerson } = await import("@/lib/vault-client");
    const person = await getVaultPerson("Debbie Michelle");

    expect(person).not.toBeNull();
    expect(person!.title).toBe("Debbie Michelle");
    expect(person!.department).toBe("Marketing");
    expect(person!.wikilinks).toEqual(["derick-dahl"]);
    expect(person!.contentSummary.length).toBeLessThanOrEqual(500);
  });

  it("returns null when vault is not configured", async () => {
    vi.stubEnv("VAULT_SUPABASE_URL", "");
    vi.stubEnv("VAULT_SUPABASE_SERVICE_ROLE_KEY", "");
    vi.resetModules();

    const { getVaultPerson } = await import("@/lib/vault-client");
    const person = await getVaultPerson("Anyone");
    expect(person).toBeNull();
  });
});

describe("hasVaultAccess", () => {
  it("returns true for ari@sonance.com", async () => {
    const { hasVaultAccess } = await import("@/lib/vault-client");
    expect(hasVaultAccess("ari@sonance.com")).toBe(true);
  });

  it("returns false for other emails", async () => {
    const { hasVaultAccess } = await import("@/lib/vault-client");
    expect(hasVaultAccess("someone@sonance.com")).toBe(false);
  });

  it("returns false for empty string", async () => {
    const { hasVaultAccess } = await import("@/lib/vault-client");
    expect(hasVaultAccess("")).toBe(false);
  });
});
