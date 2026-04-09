import { createClient } from "@supabase/supabase-js";

// ── Vault Types ───────────────────────────────────────────────────────────

export interface VaultSearchResult {
  file_path: string;
  title: string;
  folder: string;
  tags: string[] | null;
  rank: number;
}

export interface VaultPerson {
  file_path: string;
  title: string;
  department: string | null;
  frontmatter: Record<string, unknown>;
  wikilinks: string[];
  backlinks: string[];
  contentSummary: string;
}

export interface VaultConnection {
  direction: "outgoing" | "incoming";
  connected_path: string;
  connected_title: string;
  connected_folder: string;
  connected_tags: string[] | null;
}

// ── Access Gating ─────────────────────────────────────────────────────────

export function hasVaultAccess(userEmail: string): boolean {
  return userEmail.toLowerCase() === "ari@sonance.com";
}

let _client: ReturnType<typeof createClient> | null = null;

/**
 * Read-only Supabase client for the Vault Graph project.
 * Used to fetch Writing Style Guide and other vault pages at draft time.
 *
 * Requires env vars:
 *   VAULT_SUPABASE_URL
 *   VAULT_SUPABASE_SERVICE_ROLE_KEY
 */
export function getVaultClient() {
  if (_client) return _client;

  const url = process.env.VAULT_SUPABASE_URL;
  const key = process.env.VAULT_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

  _client = createClient(url, key);
  return _client;
}

/**
 * Full-text search across vault pages via the search_vault_text() Postgres function.
 * Returns empty array if vault is not configured or query fails.
 */
export async function searchVaultText(
  query: string,
  limit = 10
): Promise<VaultSearchResult[]> {
  const client = getVaultClient();
  if (!client) return [];

  try {
    const { data, error } = await client.rpc("search_vault_text", {
      search_query: query,
      match_count: limit,
    });

    if (error || !data) return [];

    return (data as Array<Record<string, unknown>>).map((row) => ({
      file_path: row.file_path as string,
      title: row.title as string,
      folder: row.folder as string,
      tags: (row.tags as string[] | null) ?? null,
      rank: row.rank as number,
    }));
  } catch (e) {
    console.warn("[vault-client] searchVaultText failed:", e);
    return [];
  }
}

/**
 * Look up a person by name in the Vault Graph.
 * Matches: exact title, case-insensitive title, or frontmatter aliases.
 * Returns null if not found or vault not configured.
 */
export async function getVaultPerson(
  name: string
): Promise<VaultPerson | null> {
  const client = getVaultClient();
  if (!client || !name.trim()) return null;

  try {
    // Try case-insensitive title match in company/people/
    const { data, error } = await client
      .from("vault_pages")
      .select("file_path, title, content, frontmatter, tags, wikilinks, backlinks")
      .eq("type", "person")
      .eq("folder", "company/people")
      .ilike("title", name.trim())
      .single();

    if (error || !data) {
      // Fallback: search by alias in frontmatter
      const { data: aliasData } = await client
        .from("vault_pages")
        .select("file_path, title, content, frontmatter, tags, wikilinks, backlinks")
        .eq("folder", "company/people")
        .contains("frontmatter", { aliases: [name.trim()] })
        .limit(1)
        .single();

      if (!aliasData) return null;
      return formatVaultPerson(aliasData);
    }

    return formatVaultPerson(data);
  } catch (e) {
    console.warn("[vault-client] getVaultPerson failed:", e);
    return null;
  }
}

function formatVaultPerson(row: Record<string, unknown>): VaultPerson {
  const frontmatter = (row.frontmatter as Record<string, unknown>) ?? {};
  const content = (row.content as string) ?? "";
  return {
    file_path: row.file_path as string,
    title: row.title as string,
    department: (frontmatter.department as string) ?? null,
    frontmatter,
    wikilinks: (row.wikilinks as string[]) ?? [],
    backlinks: (row.backlinks as string[]) ?? [],
    contentSummary: content.slice(0, 500),
  };
}

/**
 * Fetch a vault page by title and folder.
 * Returns the page content string, or null if not found or vault not configured.
 */
export async function fetchVaultPage(
  title: string,
  folder: string
): Promise<string | null> {
  const client = getVaultClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from("vault_pages")
      .select("content")
      .eq("title", title)
      .eq("folder", folder)
      .single<{ content: string | null }>();

    if (error || !data?.content) return null;
    return data.content;
  } catch {
    return null;
  }
}
