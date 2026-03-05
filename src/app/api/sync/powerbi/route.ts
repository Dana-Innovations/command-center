import { NextRequest, NextResponse } from "next/server";
import { getCortexToken, cortexInit, cortexCall } from "@/lib/cortex/client";

/**
 * GET: Pull KPIs from Power BI via Cortex MCP
 */
export async function GET(request: NextRequest) {
  const cortexToken = getCortexToken(request);
  if (!cortexToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const sessionId = await cortexInit(cortexToken);

    // Fetch reports/dashboards via Cortex Power BI MCP
    const result = await cortexCall(cortexToken, sessionId, "list-reports", "powerbi__list_reports", {});

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
