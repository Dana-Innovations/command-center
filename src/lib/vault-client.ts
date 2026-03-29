import { createClient } from "@supabase/supabase-js";

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
