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

// ── Write Types ───────────────────────────────────────────────────────────

export interface VaultPageInsert {
  file_path: string;
  title: string;
  content: string;
  frontmatter: Record<string, unknown>;
  tags: string[];
  wikilinks: string[];
  folder: string;
}

export type VaultWriteResult =
  | { ok: true; filePath: string }
  | { ok: false; error: string };

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (client as any).rpc("search_vault_text", {
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
 * Traverse the vault graph to find all connections for a given page.
 * Uses the get_connections() Postgres function which returns both
 * outgoing (wikilinks) and incoming (backlinks) connections.
 */
export async function getVaultConnections(
  filePath: string
): Promise<VaultConnection[]> {
  const client = getVaultClient();
  if (!client) return [];

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (client as any).rpc("get_connections", {
      page_path: filePath,
    });

    if (error || !data) return [];

    return (data as Array<Record<string, unknown>>).map((row) => ({
      direction: row.direction as "outgoing" | "incoming",
      connected_path: row.connected_path as string,
      connected_title: row.connected_title as string,
      connected_folder: row.connected_folder as string,
      connected_tags: (row.connected_tags as string[] | null) ?? null,
    }));
  } catch (e) {
    console.warn("[vault-client] getVaultConnections failed:", e);
    return [];
  }
}

const MAX_CONTEXT_CHARS = 8000; // ~2000 tokens

/**
 * Build a consolidated vault context string for AI prompt injection.
 * Gathers person pages + their graph connections + optional topic search.
 * Returns null if vault is not configured or no useful context found.
 */
export async function getVaultContext(
  names: string[],
  topics?: string[]
): Promise<string | null> {
  const client = getVaultClient();
  if (!client || names.length === 0) return null;

  try {
    // Look up each person in parallel
    const personResults = await Promise.all(
      names.slice(0, 10).map((name) => getVaultPerson(name))
    );
    const people = personResults.filter(
      (p): p is VaultPerson => p !== null
    );

    // Get connections for each found person in parallel
    const connectionResults = await Promise.all(
      people.map((p) => getVaultConnections(p.file_path))
    );

    // Optional topic search
    let topicResults: VaultSearchResult[] = [];
    if (topics && topics.length > 0) {
      const searchResults = await Promise.all(
        topics.slice(0, 3).map((t) => searchVaultText(t, 5))
      );
      topicResults = searchResults.flat();
    }

    // Build the context string
    return formatVaultContext(people, connectionResults, topicResults);
  } catch (e) {
    console.warn("[vault-client] getVaultContext failed:", e);
    return null;
  }
}

function formatVaultContext(
  people: VaultPerson[],
  connectionsByPerson: VaultConnection[][],
  topicResults: VaultSearchResult[]
): string | null {
  const sections: string[] = [];

  // People section
  if (people.length > 0) {
    const lines = people.map((person, i) => {
      const connections = connectionsByPerson[i] ?? [];
      const initiatives = connections
        .filter((c) => c.connected_folder.startsWith("company/initiatives"))
        .map((c) => c.connected_title);
      const intel = connections
        .filter((c) => c.connected_folder.startsWith("company/intelligence"))
        .map((c) => c.connected_title);
      const decisions = connections
        .filter((c) => c.connected_folder.startsWith("company/decisions"))
        .map((c) => c.connected_title);

      let line = `- ${person.title}`;
      if (person.department) line += `: ${person.department} department`;
      if (initiatives.length > 0)
        line += `. Initiatives: ${initiatives.join(", ")}`;
      if (decisions.length > 0)
        line += `. Decisions: ${decisions.join(", ")}`;
      if (intel.length > 0)
        line += `. Intel: ${intel.slice(0, 3).join(", ")}`;
      return line;
    });
    sections.push(`PEOPLE:\n${lines.join("\n")}`);
  }

  // Related initiatives from connections (deduplicated)
  const allInitiatives = new Map<string, string>();
  for (const connections of connectionsByPerson) {
    for (const c of connections) {
      if (
        c.connected_folder.startsWith("company/initiatives") &&
        !allInitiatives.has(c.connected_path)
      ) {
        const tagStr = c.connected_tags?.length
          ? ` (${c.connected_tags.join(", ")})`
          : "";
        allInitiatives.set(c.connected_path, `- ${c.connected_title}${tagStr}`);
      }
    }
  }
  if (allInitiatives.size > 0) {
    sections.push(
      `RELATED INITIATIVES:\n${[...allInitiatives.values()].join("\n")}`
    );
  }

  // Topic search results (deduplicated against people/initiatives already listed)
  const listedPaths = new Set([
    ...people.map((p) => p.file_path),
    ...allInitiatives.keys(),
  ]);
  const uniqueTopics = topicResults.filter(
    (r) => !listedPaths.has(r.file_path)
  );
  if (uniqueTopics.length > 0) {
    const lines = uniqueTopics.slice(0, 5).map((r) => {
      const tagStr = r.tags?.length ? ` (${r.tags.join(", ")})` : "";
      return `- ${r.title} [${r.folder}]${tagStr}`;
    });
    sections.push(`RELATED CONTEXT:\n${lines.join("\n")}`);
  }

  if (sections.length === 0) return null;

  let output = `=== Organizational Knowledge (from Vault Graph) ===\n\n${sections.join("\n\n")}`;

  // Truncate to token budget
  if (output.length > MAX_CONTEXT_CHARS) {
    output = output.slice(0, MAX_CONTEXT_CHARS).trimEnd() + "\n\n[truncated]";
  }

  return output;
}

// ── Write Functions ───────────────────────────────────────────────────────

async function computeChecksum(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Insert a new page into the Vault Graph.
 * Computes checksum, sets source to 'cortex-capture'.
 */
export async function createVaultPage(
  page: VaultPageInsert
): Promise<VaultWriteResult> {
  const client = getVaultClient();
  if (!client) return { ok: false, error: "Vault not configured" };

  try {
    const checksum = await computeChecksum(page.content);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (client as any).from("vault_pages").insert({
      file_path: page.file_path,
      title: page.title,
      content: page.content,
      frontmatter: page.frontmatter,
      tags: page.tags,
      wikilinks: page.wikilinks,
      backlinks: [],
      folder: page.folder,
      source: "cortex-capture",
      checksum,
    });

    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true, filePath: page.file_path };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.warn("[vault-client] createVaultPage failed:", message);
    return { ok: false, error: message };
  }
}

/**
 * Check if a vault page exists at the given file_path.
 * Returns false when vault is unconfigured or on any error.
 */
export async function checkVaultPageExists(filePath: string): Promise<boolean> {
  const client = getVaultClient();
  if (!client) return false;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (client as any)
      .from("vault_pages")
      .select("file_path")
      .eq("file_path", filePath)
      .maybeSingle();
    return data !== null;
  } catch (e) {
    console.warn("[vault-client] checkVaultPageExists failed:", e);
    return false;
  }
}

/**
 * Append a new section to an existing vault page.
 * Uses `---` separator. Merges wikilinks as union. Does NOT modify source field.
 * Returns error if page doesn't exist.
 */
export async function appendToVaultPage(
  filePath: string,
  section: string,
  newWikilinks: string[]
): Promise<VaultWriteResult> {
  const client = getVaultClient();
  if (!client) return { ok: false, error: "Vault not configured" };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing, error: fetchError } = await (client as any)
      .from("vault_pages")
      .select("content, wikilinks, source")
      .eq("file_path", filePath)
      .maybeSingle();

    if (fetchError) {
      return { ok: false, error: fetchError.message };
    }
    if (!existing) {
      return { ok: false, error: `Page not found: ${filePath}` };
    }

    const existingContent = (existing.content as string) ?? "";
    const existingLinks = (existing.wikilinks as string[]) ?? [];

    const mergedContent = `${existingContent}\n\n---\n\n${section}`;
    const mergedWikilinks = Array.from(
      new Set([...existingLinks, ...newWikilinks])
    );
    const newChecksum = await computeChecksum(mergedContent);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (client as any)
      .from("vault_pages")
      .update({
        content: mergedContent,
        wikilinks: mergedWikilinks,
        checksum: newChecksum,
        updated_at: new Date().toISOString(),
      })
      .eq("file_path", filePath);

    if (updateError) {
      return { ok: false, error: updateError.message };
    }
    return { ok: true, filePath };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.warn("[vault-client] appendToVaultPage failed:", message);
    return { ok: false, error: message };
  }
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
