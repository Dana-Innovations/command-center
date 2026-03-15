/**
 * Cortex MCP connection status — check which services a user has connected.
 */

const CORTEX_URL =
  process.env.NEXT_PUBLIC_CORTEX_URL || "https://cortex-bice.vercel.app";

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

/**
 * Fetch the user's connected MCP services from Cortex.
 * Normalizes the Cortex response into a consistent shape.
 */
export async function getConnections(
  cortexToken: string
): Promise<CortexConnection[]> {
  try {
    const res = await fetch(`${CORTEX_URL}/api/v1/oauth/connections`, {
      headers: { Authorization: `Bearer ${cortexToken}` },
    });
    if (!res.ok) {
      console.error(`[connections] Cortex returned ${res.status}`);
      return [];
    }
    const data = await res.json();
    const raw: CortexRawConnection[] = data.connections ?? data ?? [];

    console.log(`[connections] Cortex returned ${raw.length} connections:`,
      raw.map(c => ({ mcp_name: c.mcp_name, provider: c.provider, status: c.status, is_company_default: c.is_company_default }))
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
    return [];
  }
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
      }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
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
