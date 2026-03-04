/**
 * Cortex MCP client — makes authenticated calls to Cortex MCP endpoints
 * on behalf of the logged-in user.
 */

const CORTEX_URL = process.env.NEXT_PUBLIC_CORTEX_URL!;

interface MCPResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

interface MCPResponse {
  jsonrpc: string;
  id: number;
  result?: MCPResult;
  error?: { code: number; message: string };
}

/**
 * Call a Cortex MCP tool on behalf of the authenticated user.
 *
 * @param mcpName - The MCP service name (e.g., "m365", "asana", "slack")
 * @param toolName - The tool to call (e.g., "list_emails", "list_tasks")
 * @param args - Tool arguments
 * @param cortexToken - The user's Cortex access token
 * @returns Parsed JSON result from the tool, or null on error
 */
export async function callCortexMCP(
  mcpName: string,
  toolName: string,
  args: Record<string, unknown>,
  cortexToken: string
): Promise<unknown> {
  const res = await fetch(`${CORTEX_URL}/mcp/${mcpName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cortexToken}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
  });

  if (!res.ok) {
    console.error(
      `Cortex MCP error [${mcpName}/${toolName}]: ${res.status} ${res.statusText}`
    );
    return null;
  }

  const data: MCPResponse = await res.json();

  if (data.error) {
    console.error(
      `Cortex MCP error [${mcpName}/${toolName}]:`,
      data.error.message
    );
    return null;
  }

  // MCP results come as content array with text entries
  if (data.result?.content?.[0]?.text) {
    try {
      return JSON.parse(data.result.content[0].text);
    } catch {
      return data.result.content[0].text;
    }
  }

  return data.result;
}

/**
 * Extract the Cortex access token from the request.
 * Checks the x-cortex-token header (set by middleware) first,
 * then falls back to the cookie.
 */
export function getCortexToken(request: Request): string | null {
  // Middleware forwards the token via header
  const headerToken = request.headers.get("x-cortex-token");
  if (headerToken) return headerToken;

  // Fallback: read from cookie
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(/cortex_access_token=([^;]+)/);
  return match ? match[1] : null;
}
