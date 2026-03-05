import { NextRequest, NextResponse } from "next/server";
import { getCortexToken } from "@/lib/cortex/client";
import {
  getConnections,
  initiateConnect,
  REQUIRED_SERVICES,
} from "@/lib/cortex/connections";

/**
 * GET /api/connections — list user's connected services
 */
export async function GET(request: NextRequest) {
  const cortexToken = getCortexToken(request);
  if (!cortexToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const connections = await getConnections(cortexToken);

  // Map to the services the Command Center needs, matching by mcp_name or provider
  const services = REQUIRED_SERVICES.map((svc) => {
    const conn = connections.find(
      (c) =>
        c.mcp_name === svc.mcp_name ||
        c.provider === svc.provider ||
        c.mcp_name === svc.provider ||
        c.provider === svc.mcp_name
    );
    return {
      ...svc,
      connected: conn?.connected ?? false,
      account_email: conn?.account_email,
    };
  });

  return NextResponse.json({ services, _raw: connections });
}

/**
 * POST /api/connections — initiate a connect flow for a provider
 */
export async function POST(request: NextRequest) {
  const cortexToken = getCortexToken(request);
  if (!cortexToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { provider } = await request.json();
  if (!provider) {
    return NextResponse.json(
      { error: "provider is required" },
      { status: 400 }
    );
  }

  const result = await initiateConnect(cortexToken, provider);
  if (!result) {
    return NextResponse.json(
      { error: "Failed to initiate connection" },
      { status: 500 }
    );
  }

  return NextResponse.json(result);
}
