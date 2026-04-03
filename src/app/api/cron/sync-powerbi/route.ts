import { NextRequest, NextResponse } from "next/server";

// Vercel cron handler — triggers Power BI KPI sync
// Configure in vercel.json: { "crons": [{ "path": "/api/cron/sync-powerbi", "schedule": "*/15 * * * *" }] }

export async function GET(request: NextRequest) {
  // Verify this is a legitimate cron call (Vercel sets this header)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Delegate to the sync endpoint's GET handler
  const baseUrl = process.env.NEXT_PUBLIC_VERCEL_URL
    ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
    : "http://localhost:3000";

  try {
    const res = await fetch(`${baseUrl}/api/sync/powerbi`, { method: "GET" });
    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
