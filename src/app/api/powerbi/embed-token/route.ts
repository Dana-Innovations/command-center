import { NextRequest, NextResponse } from "next/server";
import { getCortexToken, cortexInit, cortexCall } from "@/lib/cortex/client";

export async function POST(request: NextRequest) {
  const cortexToken = getCortexToken(request);
  if (!cortexToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const { reportId, datasetIds, workspaceId } = await request.json();

    if (!reportId || !workspaceId) {
      return NextResponse.json(
        { error: "reportId and workspaceId are required" },
        { status: 400 }
      );
    }

    const sessionId = await cortexInit(cortexToken);

    // Generate embed token via Cortex Power BI MCP
    const result = await cortexCall(cortexToken, sessionId, "embed-token", "powerbi__generate_embed_token", {
      report_id: reportId,
      dataset_ids: datasetIds || [],
      workspace_id: workspaceId,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
