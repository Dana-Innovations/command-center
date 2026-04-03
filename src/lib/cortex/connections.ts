/**
 * Cortex MCP connection status — check which services a user has connected.
 * Includes retry logic and Supabase cache fallback for resilience.
 */

import { createServiceClient } from "@/lib/supabase/server";

const CORTEX_URL =
  process.env.NEXT_PUBLIC_CORTEX_URL || "https://cortex-bice.vercel.app";

/** How old a cached connection status can be before we consider it stale */
const CONNECTION_CACHE_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

const CONNECTED_STATUSES = new Set([
  "active",
  "authorized",
  "complete",
  "completed",
  "connected",
  "ready",
  "success",
]);

/** Raw shape returned by Cortex GET /api/v1/oauth/connections */
interface CortexRawConnection {
  id?: string;
  mcp_name?: string;
  provider?: string;
  account_email?: string;
  status?: string;
  is_company_default?: boolean;
  scopes?: string[];
}

export interface CortexConnection {
  mcp_name: string;
  provider: string;
  account_email?: string;
  connected: boolean;
  is_company_default: boolean;
}

/** Services the Command Center uses — keyed by mcp_name */
export const REQUIRED_SERVICES = [
  {
    provider: "microsoft",
    mcp_name: "m365",
    label: "Microsoft 365",
    description: "Email, Calendar, Teams",
  },
  { provider: "asana", mcp_name: "asana", label: "Asana", description: "Tasks & Projects" },
  { provider: "slack", mcp_name: "slack", label: "Slack", description: "Channel Messages" },
  {
    provider: "salesforce",
    mcp_name: "salesforce",
    label: "Salesforce",
    description: "Pipeline & CRM",
  },
  { provider: "monday", mcp_name: "monday", label: "Monday.com", description: "Manufacturing" },
  {
    provider: "powerbi",
    mcp_name: "powerbi",
    label: "Power BI",
    description: "Reports & Dashboards",
  },
] as const;

function normalizeValue(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function canonicalConnectionName(
  value: unknown,
  field: "mcp_name" | "provider"
) {
  const normalized = normalizeValue(value);

  switch (normalized) {
    case "m365":
    case "microsoft":
    case "microsoft365":
    case "office365":
      return field === "mcp_name" ? "m365" : "microsoft";
    case "monday":
    case "mondaycom":
      return "monday";
    case "powerbi":
    case "microsoftpowerbi":
      return "powerbi";
    default:
      return normalized;
  }
}

function isConnectedStatus(status: unknown) {
  return CONNECTED_STATUSES.has(normalizeValue(status));
}

export function matchesConnectionName(
  connection: Pick<CortexConnection, "mcp_name" | "provider">,
  name: string
) {
  const targetMcp = canonicalConnectionName(name, "mcp_name");
  const targetProvider = canonicalConnectionName(name, "provider");

  return (
    connection.mcp_name === targetMcp ||
    connection.provider === targetProvider ||
    connection.mcp_name === targetProvider ||
    connection.provider === targetMcp
  );
}

/** Result of getConnections — includes whether cache was used */
export interface ConnectionsResult {
  connections: CortexConnection[];
  fromCache: boolean;
}

async function fetchConnectionsOnce(
  cortexToken: string
): Promise<CortexConnection[] | null> {
  try {
    const res = await fetch(`${CORTEX_URL}/api/v1/oauth/connections`, {
      headers: { Authorization: `Bearer ${cortexToken}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        `[connections] Cortex returned ${res.status}: ${body.slice(0, 200)}`
      );
      return null;
    }
    const data = await res.json();
    const raw: CortexRawConnection[] = data.connections ?? data ?? [];

    console.log(
      `[connections] Cortex returned ${raw.length} connections:`,
      raw.map((c) => ({
        mcp_name: c.mcp_name,
        provider: c.provider,
        status: c.status,
        is_company_default: c.is_company_default,
      }))
    );

    return raw.map((c) => ({
      mcp_name: canonicalConnectionName(c.mcp_name || c.provider, "mcp_name"),
      provider: canonicalConnectionName(c.provider || c.mcp_name, "provider"),
      account_email: c.account_email,
      connected: isConnectedStatus(c.status),
      is_company_default: c.is_company_default ?? false,
    }));
  } catch (e) {
    console.error("[connections] Failed to fetch:", e);
    return null;
  }
}

/**
 * Persist connection status to Supabase for cache fallback.
 * Fire-and-forget — errors are logged but not thrown.
 */
export async function cacheConnectionStatus(
  userId: string,
  connections: CortexConnection[]
): Promise<void> {
  try {
    const supabase = createServiceClient();
    const now = new Date().toISOString();
    const rows = connections.map((c) => ({
      user_id: userId,
      service: c.mcp_name,
      connected: c.connected,
      checked_at: now,
    }));

    if (rows.length > 0) {
      await supabase
        .from("connection_status")
        .upsert(rows, { onConflict: "user_id,service" });
    }
  } catch (e) {
    console.warn("[connections] Failed to cache status:", e);
  }
}

/**
 * Read cached connection status from Supabase.
 * Returns null if no cache or cache is older than 1 hour.
 */
export async function readCachedConnectionStatus(
  userId: string
): Promise<CortexConnection[] | null> {
  try {
    const supabase = createServiceClient();
    const cutoff = new Date(Date.now() - CONNECTION_CACHE_MAX_AGE_MS).toISOString();

    const { data, error } = await supabase
      .from("connection_status")
      .select("service, connected, checked_at")
      .eq("user_id", userId)
      .gte("checked_at", cutoff);

    if (error || !data || data.length === 0) return null;

    return data.map((row) => ({
      mcp_name: row.service,
      provider: row.service,
      connected: row.connected,
      is_company_default: false,
    }));
  } catch (e) {
    console.warn("[connections] Failed to read cache:", e);
    return null;
  }
}

/**
 * Fetch the user's connected MCP services from Cortex.
 * Retries once on failure, then falls back to Supabase cache.
 */
export async function getConnections(
  cortexToken: string,
  userId?: string
): Promise<ConnectionsResult> {
  // First attempt
  let connections = await fetchConnectionsOnce(cortexToken);

  // Retry once after 500ms
  if (!connections) {
    await new Promise((r) => setTimeout(r, 500));
    connections = await fetchConnectionsOnce(cortexToken);
  }

  if (connections) {
    return { connections, fromCache: false };
  }

  // Fall back to Supabase cache
  if (userId) {
    console.warn("[connections] Falling back to Supabase cache for", userId);
    const cached = await readCachedConnectionStatus(userId);
    if (cached) {
      return { connections: cached, fromCache: true };
    }
  }

  console.error("[connections] No live or cached connections available");
  return { connections: [], fromCache: true };
}

/**
 * Check if a specific service is connected for the user (not a company default).
 */
export function isUserConnected(
  connections: CortexConnection[],
  mcpName: string
): boolean {
  return connections.some(
    (c) =>
      matchesConnectionName(c, mcpName) &&
      c.connected &&
      !c.is_company_default
  );
}

/**
 * Initiate an OAuth connect flow for a provider.
 * Returns the authorization URL to open in a popup.
 */
export async function initiateConnect(
  cortexToken: string,
  provider: string
): Promise<{ authorization_url: string; session_id: string } | null> {
  try {
    const res = await fetch(
      `${CORTEX_URL}/api/v1/oauth/connect/${provider}/initiate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cortexToken}`,
        },
        redirect: "follow",
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        `[initiateConnect] ${provider} failed: ${res.status} ${res.statusText}`,
        body
      );
      // Try to parse body — some Cortex responses return the URL even on non-200
      try {
        const parsed = JSON.parse(body);
        if (parsed.authorization_url) return parsed;
      } catch {}
      return null;
    }
    return res.json();
  } catch (err) {
    console.error(`[initiateConnect] ${provider} exception:`, err);
    return null;
  }
}

/**
 * Poll for connect completion.
 */
export async function pollConnect(
  cortexToken: string,
  sessionId: string
): Promise<{ status: string; account_email?: string }> {
  try {
    const res = await fetch(
      `${CORTEX_URL}/api/v1/oauth/connect/poll/${sessionId}`,
      {
        headers: { Authorization: `Bearer ${cortexToken}` },
      }
    );
    if (!res.ok) return { status: "error" };
    return res.json();
  } catch {
    return { status: "error" };
  }
}
