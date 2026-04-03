import { NextRequest, NextResponse } from "next/server";
import { getCortexToken } from "@/lib/cortex/client";
import {
  getConnections,
  initiateConnect,
  matchesConnectionName,
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

  const { connections } = await getConnections(cortexToken);

  // Map to the services the Command Center needs, matching by mcp_name or provider
  const services = REQUIRED_SERVICES.map((svc) => {
    const conn = connections.find(
      (c) =>
        matchesConnectionName(c, svc.mcp_name) ||
        matchesConnectionName(c, svc.provider)
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
    // Check if already connected — Cortex may reject re-initiation
    const { connections: conns } = await getConnections(cortexToken);
    const svc = REQUIRED_SERVICES.find((s) => s.provider === provider);
    const alreadyConnected = conns.some(
      (c) =>
        (svc && (matchesConnectionName(c, svc.mcp_name) || matchesConnectionName(c, svc.provider))) &&
        c.connected
    );
    if (alreadyConnected) {
      return NextResponse.json({ already_connected: true });
    }
    return NextResponse.json(
      { error: "Failed to initiate connection" },
      { status: 500 }
    );
  }

  return NextResponse.json(result);
}
