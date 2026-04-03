import { NextRequest, NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase/server";
import { getCortexUserFromRequest } from "@/lib/cortex/user";
import { readCachedConnectionStatus } from "@/lib/cortex/connections";

/**
 * GET /api/data/cached
 *
 * Returns user data from Supabase (previously synced) for instant page load.
 * This is Phase 1 of the two-phase fetch — fast cached data first,
 * then /api/data/live replaces it with fresh Cortex data.
 */
export async function GET(request: NextRequest) {
  const user = await getCortexUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const supabase = await createAuthClient();

    // Parallel reads from all cached tables
    const [
      emailsRes,
      sentEmailsRes,
      calendarRes,
      tasksRes,
      chatsRes,
      slackRes,
      pipelineRes,
      teamsChannelsRes,
      syncLogRes,
    ] = await Promise.all([
      // Inbox emails
      supabase
        .from("emails")
        .select("*")
        .eq("folder", "inbox")
        .order("received_at", { ascending: false })
        .limit(50),

      // Sent emails
      supabase
        .from("emails")
        .select("*")
        .eq("folder", "sentitems")
        .order("received_at", { ascending: false })
        .limit(30),

      // Calendar events (future only)
      supabase
        .from("calendar_events")
        .select("*")
        .gte("end_time", new Date().toISOString())
        .order("start_time", { ascending: true }),

      // Tasks
      supabase
        .from("tasks")
        .select("*")
        .order("due_on", { ascending: true }),

      // Teams chats
      supabase
        .from("chats")
        .select("*")
        .order("last_activity", { ascending: false }),

      // Slack feed
      supabase
        .from("slack_feed")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(100),

      // Salesforce opportunities (open only)
      supabase
        .from("salesforce_opportunities")
        .select("*")
        .eq("is_closed", false),

      // Teams channels
      supabase
        .from("teams_channels")
        .select("*")
        .order("team_name", { ascending: true }),

      // Most recent sync timestamps per data type
      supabase
        .from("sync_log")
        .select("data_type, completed_at")
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(20),
    ]);

    // Read cached connection status (uses service client internally)
    const cachedConnections = await readCachedConnectionStatus(user.sub);

    // Build connection status from cache
    const connectionMap: Record<string, boolean> = {};
    if (cachedConnections) {
      for (const c of cachedConnections) {
        connectionMap[c.mcp_name] = c.connected;
      }
    }

    // Find the most recent sync timestamp
    const syncEntries = syncLogRes.data ?? [];
    let cachedAt: string | null = null;
    for (const entry of syncEntries) {
      if (!cachedAt || entry.completed_at > cachedAt) {
        cachedAt = entry.completed_at;
      }
    }

    // Check if we actually have any cached data
    const hasData =
      (emailsRes.data?.length ?? 0) > 0 ||
      (calendarRes.data?.length ?? 0) > 0 ||
      (tasksRes.data?.length ?? 0) > 0;

    if (!hasData) {
      return NextResponse.json({
        empty: true,
        source: "cache",
        fetchedAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      emails: emailsRes.data ?? [],
      sentEmails: sentEmailsRes.data ?? [],
      calendar: calendarRes.data ?? [],
      tasks: tasksRes.data ?? [],
      asanaComments: [],
      asanaProjects: [],
      chats: chatsRes.data ?? [],
      teamsChannelMessages: [],
      slack: slackRes.data ?? [],
      powerbi: { reports: [], kpis: [] },
      pipeline: pipelineRes.data ?? [],
      connections: {
        m365: connectionMap["m365"] ?? false,
        asana: connectionMap["asana"] ?? false,
        slack: connectionMap["slack"] ?? false,
        salesforce: connectionMap["salesforce"] ?? false,
        powerbi: connectionMap["powerbi"] ?? false,
        monday: connectionMap["monday"] ?? false,
      },
      source: "cache",
      cachedAt,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[cached] Error reading from Supabase:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
