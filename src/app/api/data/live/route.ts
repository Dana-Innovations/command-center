import { NextRequest, NextResponse } from "next/server";
import { getCortexToken, cortexInit, cortexCall } from "@/lib/cortex/client";
import { getConnections, type CortexConnection } from "@/lib/cortex/connections";

// ─── M365 via Cortex MCP ────────────────────────────────────────────────────

async function fetchEmails(token: string, sessionId: string) {
  const result = await cortexCall(
    token,
    sessionId,
    "emails",
    "m365__list_emails",
    { limit: 60, folder: "inbox" }
  );
  const emails: Record<string, unknown>[] = result.emails ?? result.value ?? [];
  const now = new Date().toISOString();

  return emails
    .filter(
      (m) =>
        (m.inferenceClassification === "focused" || !m.inferenceClassification) &&
        !m.isDraft
    )
    .slice(0, 40)
    .map((m) => {
      const from = m.from as {
        emailAddress?: { name?: string; address?: string };
      } | null;
      const receivedAt = (m.receivedDateTime as string) || now;
      const daysDiff = Math.floor(
        (Date.now() - new Date(receivedAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      return {
        id: m.id,
        message_id: m.id,
        subject: m.subject || "(no subject)",
        from_name:
          from?.emailAddress?.name || from?.emailAddress?.address || "",
        from_email: from?.emailAddress?.address || "",
        preview: ((m.bodyPreview as string) || "").slice(0, 160),
        body_html: "",
        received_at: receivedAt,
        is_read: m.isRead as boolean,
        folder: "focused",
        has_attachments: m.hasAttachments as boolean,
        outlook_url: m.webLink || `https://outlook.office.com/mail/inbox/id/${encodeURIComponent(m.id as string)}`,
        needs_reply: !(m.isRead as boolean),
        days_overdue: Math.max(0, daysDiff - 2),
        synced_at: now,
      };
    });
}

async function fetchCalendar(token: string, sessionId: string) {
  const now = new Date();
  const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const result = await cortexCall(
    token,
    sessionId,
    "cal",
    "m365__list_events",
    {
      start_date: now.toISOString(),
      end_date: end.toISOString(),
      limit: 20,
    }
  );
  const events: Record<string, unknown>[] = result.events ?? result.value ?? [];
  const synced = new Date().toISOString();

  return events.map((e) => {
    const start = e.start as { dateTime?: string } | null;
    const endTime = e.end as { dateTime?: string } | null;
    const loc = e.location as { displayName?: string } | null;
    const organizer = e.organizer as {
      emailAddress?: { name?: string };
    } | null;
    const startDt = start?.dateTime || (e.startDateTime as string) || "";
    const endDt = endTime?.dateTime || (e.endDateTime as string) || "";
    return {
      id: e.id,
      event_id: e.id,
      subject: e.subject || "(no title)",
      location: loc?.displayName || (e.location as string) || "",
      start_time: startDt.endsWith("Z") ? startDt : startDt + "Z",
      end_time: endDt.endsWith("Z") ? endDt : endDt + "Z",
      is_all_day:
        startDt?.endsWith("T00:00:00.0000000") &&
        endDt?.endsWith("T00:00:00.0000000"),
      organizer: organizer?.emailAddress?.name || "",
      is_online: e.isOnlineMeeting as boolean,
      join_url:
        (e.onlineMeetingUrl as string) || (e.webLink as string) || "",
      outlook_url: (e.webLink as string) || "",
      synced_at: synced,
    };
  });
}

// ─── Asana via Cortex MCP ─────────────────────────────────────────────────

async function fetchAsanaTasks(token: string, sessionId: string) {
  // Step 1: Discover the user's projects dynamically
  const projectsResult = await cortexCall(
    token,
    sessionId,
    "asana_projects",
    "asana__list_projects",
    { limit: 20 }
  );
  const projects: Record<string, unknown>[] =
    projectsResult.projects ?? projectsResult.data ?? [];

  if (projects.length === 0) return [];

  // Step 2: Fetch tasks from up to 5 projects in parallel
  const projectSlice = projects.slice(0, 5);
  const taskResults = await Promise.allSettled(
    projectSlice.map((p) =>
      cortexCall(token, sessionId, `asana_${p.gid}`, "asana__list_tasks", {
        project_gid: (p.gid || p.id) as string,
        limit: 50,
      })
    )
  );

  const today = new Date();
  const now = new Date().toISOString();
  const allTasks: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < taskResults.length; i++) {
    const r = taskResults[i];
    if (r.status !== "fulfilled") continue;
    const tasks: Record<string, unknown>[] = r.value.tasks ?? r.value.data ?? [];
    const projectName = (projectSlice[i].name as string) || "Tasks";
    for (const t of tasks) {
      const id = (t.gid || t.id) as string;
      if (seen.has(id)) continue;
      seen.add(id);
      allTasks.push({ ...t, project_name: projectName });
    }
  }

  return allTasks
    .filter((t) => !t.completed)
    .map((t) => {
      const dueOn = (t.due_on as string) || (t.due_date as string) || null;
      let daysOverdue = 0;
      if (dueOn) {
        const due = new Date(dueOn + "T00:00:00");
        daysOverdue = Math.floor(
          (today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)
        );
      }
      return {
        id: t.gid || t.id,
        task_gid: t.gid || t.id,
        name: t.name,
        notes: (t.notes as string) || "",
        due_on: dueOn || "",
        completed: false,
        assignee: (t.assignee as Record<string, unknown>)?.gid || null,
        project_name: (t.project_name as string) || "Tasks",
        permalink_url: t.permalink_url,
        priority: "normal",
        days_overdue: daysOverdue,
        synced_at: now,
      };
    });
}

// ─── Teams chats via Cortex MCP ──────────────────────────────────────────

async function fetchTeamsChats(token: string, sessionId: string) {
  const result = await cortexCall(
    token,
    sessionId,
    "teams1",
    "m365__list_chats",
    { limit: 20 }
  );
  const chats: Record<string, unknown>[] = result.chats ?? [];
  const now = new Date().toISOString();

  const withMessages = await Promise.allSettled(
    chats.slice(0, 8).map(async (chat) => {
      const msgsResult = await cortexCall(
        token,
        sessionId,
        `msg_${chat.id}`,
        "m365__list_chat_messages",
        { chat_id: chat.id as string, limit: 3 }
      );
      const messages: Record<string, unknown>[] = msgsResult.messages ?? [];
      const lastMsg = messages[0];
      const from = lastMsg
        ? ((
            (lastMsg.from as Record<string, unknown>)?.user as Record<
              string,
              unknown
            >
          )?.displayName as string) || ""
        : "";
      const body = lastMsg
        ? (
            (
              (lastMsg.body as Record<string, unknown>)?.content as string
            ) || ""
          )
            .replace(/<[^>]+>/g, "")
            .trim()
            .slice(0, 120)
        : "";
      return {
        id: chat.id,
        chat_id: chat.id,
        topic: (chat.topic as string) || from || "Teams Chat",
        chat_type: chat.chatType as string,
        last_message_preview: body,
        last_sender: from,
        last_message_from: from,
        last_activity: (chat.lastUpdatedDateTime as string) || now,
        members: [],
        synced_at: now,
      };
    })
  );

  return withMessages
    .filter((r) => r.status === "fulfilled")
    .map((r) => (r as PromiseFulfilledResult<unknown>).value)
    .filter((c) => {
      const chat = c as Record<string, unknown>;
      return chat.last_message_preview || chat.topic;
    });
}

// ─── Slack via Cortex MCP ─────────────────────────────────────────────────

async function fetchSlackMessages(token: string, sessionId: string) {
  const KEY_CHANNELS = ["general", "slt", "leadership", "executive", "ai"];
  const result = await cortexCall(
    token,
    sessionId,
    "slack1",
    "slack__list_channels",
    { limit: 30 }
  );
  const channels: Record<string, unknown>[] = result.channels ?? [];

  const prioritized = [
    ...channels.filter((c) =>
      KEY_CHANNELS.some((k) =>
        ((c.name as string) || "").toLowerCase().includes(k)
      )
    ),
    ...channels.filter(
      (c) =>
        !KEY_CHANNELS.some((k) =>
          ((c.name as string) || "").toLowerCase().includes(k)
        )
    ),
  ].slice(0, 5);

  const messages = await Promise.allSettled(
    prioritized.map(async (ch) => {
      const msgs = await cortexCall(
        token,
        sessionId,
        `slack_${ch.id}`,
        "slack__get_channel_history",
        { channel_id: ch.id as string, limit: 3 }
      );
      return {
        channel: ch.name,
        messages: (msgs.messages ?? []) as Record<string, unknown>[],
      };
    })
  );

  const now = new Date().toISOString();
  const items: Record<string, unknown>[] = [];
  for (const r of messages) {
    if (r.status !== "fulfilled") continue;
    const { channel, messages: msgs } = r.value;
    for (const m of msgs.slice(0, 2)) {
      if (!m.text && !m.attachments) continue;
      items.push({
        id: m.ts as string,
        message_ts: m.ts as string,
        author_name:
          (m.username as string) || (m.user as string) || "Unknown",
        author_id: (m.user as string) || null,
        text: (m.text as string) || "",
        timestamp: new Date(
          parseFloat(m.ts as string) * 1000
        ).toISOString(),
        channel_name: channel,
        reactions: [],
        thread_reply_count: (m.reply_count as number) || 0,
        has_files: !!(m.files as unknown[])?.length,
        permalink: null,
        synced_at: now,
      });
    }
  }

  return items
    .sort(
      (a, b) =>
        new Date(b.timestamp as string).getTime() -
        new Date(a.timestamp as string).getTime()
    )
    .slice(0, 10);
}

// ─── Power BI via Cortex MCP ─────────────────────────────────────────────

const SONANCE_WORKSPACE_ID = "05fd9b2f-5d90-443f-8927-ebc2a507c0d9";

async function fetchPowerBI(token: string, sessionId: string) {
  const [reportsResult, datasetsResult] = await Promise.allSettled([
    cortexCall(token, sessionId, "pbi_reports", "powerbi__list_reports", {
      workspace_id: SONANCE_WORKSPACE_ID,
    }),
    cortexCall(token, sessionId, "pbi_datasets", "powerbi__list_datasets", {
      workspace_id: SONANCE_WORKSPACE_ID,
    }),
  ]);

  const reports: Record<string, unknown>[] =
    reportsResult.status === "fulfilled"
      ? (reportsResult.value?.reports ?? [])
      : [];
  const datasets: Record<string, unknown>[] =
    datasetsResult.status === "fulfilled"
      ? (datasetsResult.value?.datasets ?? [])
      : [];

  const now = new Date().toISOString();

  const reportConfigs = reports
    .filter((r) => r.name && r.id)
    .map((r, i) => ({
      id: r.id as string,
      report_id: r.id as string,
      report_name: r.name as string,
      workspace_id: SONANCE_WORKSPACE_ID,
      embed_url:
        (r.embedUrl as string) || (r.webUrl as string) || null,
      description: null,
      display_order: i,
      is_active: true,
      created_at: now,
      updated_at: now,
    }));

  const kpis = datasets
    .filter((d) => d.name && d.id)
    .map((d) => ({
      id: d.id as string,
      kpi_name: d.name as string,
      kpi_category: "revenue",
      current_value: null,
      previous_value: null,
      target_value: null,
      unit: "$",
      period: "current",
      dataset_id: d.id as string,
      dax_query: null,
      raw_result: null,
      synced_at: now,
    }));

  return { reports: reportConfigs, kpis };
}

// ─── Salesforce via Cortex MCP ───────────────────────────────────────────

async function fetchSalesforceKPIs(token: string, sessionId: string) {
  const now = new Date().toISOString();
  try {
    const [pipelineResult, wonResult, lostResult] = await Promise.allSettled([
      cortexCall(token, sessionId, "sf_pipe", "salesforce__run_soql_query", {
        query:
          "SELECT StageName, COUNT(Id) dealCount, SUM(Amount) pipelineTotal FROM Opportunity WHERE IsClosed = false GROUP BY StageName",
      }),
      cortexCall(token, sessionId, "sf_won", "salesforce__run_soql_query", {
        query:
          "SELECT COUNT(Id) wonCount, SUM(Amount) wonTotal FROM Opportunity WHERE IsWon = true AND CloseDate >= 2026-01-01",
      }),
      cortexCall(token, sessionId, "sf_lost", "salesforce__run_soql_query", {
        query:
          "SELECT COUNT(Id) lostCount FROM Opportunity WHERE IsWon = false AND IsClosed = true AND CloseDate >= 2026-01-01",
      }),
    ]);

    const pipelineRecords =
      pipelineResult.status === "fulfilled"
        ? ((pipelineResult.value?.records ?? []) as Record<string, unknown>[])
        : [];
    const wonRecord =
      wonResult.status === "fulfilled"
        ? (((wonResult.value?.records ?? [])[0] ?? {}) as Record<
            string,
            unknown
          >)
        : {};
    const lostRecord =
      lostResult.status === "fulfilled"
        ? (((lostResult.value?.records ?? [])[0] ?? {}) as Record<
            string,
            unknown
          >)
        : {};

    const pipelineTotal = pipelineRecords.reduce(
      (s, r) => s + (Number(r.pipelineTotal) || 0),
      0
    );
    const openDeals = pipelineRecords.reduce(
      (s, r) => s + (Number(r.dealCount) || 0),
      0
    );
    const wonTotal = Number(wonRecord.wonTotal) || 0;
    const wonCount = Number(wonRecord.wonCount) || 0;
    const lostCount = Number(lostRecord.lostCount) || 0;
    const winRate =
      wonCount + lostCount > 0
        ? Math.round((wonCount / (wonCount + lostCount)) * 100)
        : 0;

    const topStage =
      pipelineRecords.length > 0
        ? pipelineRecords.reduce((a, b) =>
            (Number(a.pipelineTotal) || 0) > (Number(b.pipelineTotal) || 0)
              ? a
              : b
          )
        : null;

    return [
      {
        id: "sf-pipeline",
        kpi_name: "Open Pipeline",
        kpi_category: "revenue",
        current_value: pipelineTotal,
        previous_value: null,
        target_value: null,
        unit: "$",
        period: "current",
        subtitle: `${openDeals} open deals`,
        synced_at: now,
      },
      {
        id: "sf-won-ytd",
        kpi_name: "Won YTD",
        kpi_category: "revenue",
        current_value: wonTotal,
        previous_value: null,
        target_value: null,
        unit: "$",
        period: "2026 YTD",
        subtitle: `${wonCount} deals closed`,
        synced_at: now,
      },
      {
        id: "sf-win-rate",
        kpi_name: "Win Rate",
        kpi_category: "revenue",
        current_value: winRate,
        previous_value: null,
        target_value: null,
        unit: "%",
        period: "2026 YTD",
        subtitle: `${wonCount}W / ${lostCount}L`,
        synced_at: now,
      },
      {
        id: "sf-top-stage",
        kpi_name: "Largest Stage",
        kpi_category: "revenue",
        current_value: topStage ? Number(topStage.pipelineTotal) || 0 : 0,
        previous_value: null,
        target_value: null,
        unit: "$",
        period: "current",
        subtitle: topStage ? String(topStage.StageName) : "",
        synced_at: now,
      },
    ];
  } catch {
    return [];
  }
}

async function fetchSalesforce(token: string, sessionId: string) {
  const query =
    "SELECT Id, Name, Amount, StageName, CloseDate, Account.Name, Owner.Name, Probability, RecordType.Name, Type FROM Opportunity WHERE IsClosed = false ORDER BY Amount DESC NULLS LAST LIMIT 50";

  try {
    const result = await cortexCall(
      token,
      sessionId,
      "sf_opps",
      "salesforce__run_soql_query",
      { query }
    );
    const records: Record<string, unknown>[] = result?.records ?? [];
    return records.map((r) => ({
      id: r.Id as string,
      sf_opportunity_id: r.Id as string,
      name: r.Name as string,
      amount: Number(r.Amount ?? 0),
      stage: r.StageName as string,
      close_date: r.CloseDate as string,
      account_name:
        ((r.Account as Record<string, unknown>)?.Name as string) || "",
      owner_name:
        ((r.Owner as Record<string, unknown>)?.Name as string) || "",
      probability: Number(r.Probability ?? 0),
      is_closed: false,
      is_won: false,
      record_type:
        ((r.RecordType as Record<string, unknown>)?.Name as string) ||
        (r.Type as string) ||
        "",
      territory: "",
      sales_channel: "",
      days_in_stage: null,
      days_to_close: Math.ceil(
        (new Date(r.CloseDate as string).getTime() - Date.now()) / 86400000
      ),
      has_overdue_task: false,
      sf_url: `https://sonance.lightning.force.com/lightning/r/Opportunity/${r.Id as string}/view`,
    }));
  } catch {
    return [];
  }
}

// ─── Connection check helpers ─────────────────────────────────────────────

function hasConnection(connections: CortexConnection[], mcpName: string): boolean {
  return connections.some(
    (c) => (c.mcp_name === mcpName || c.provider === mcpName) && c.connected
  );
}

// ─── Main handler ─────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const cortexToken = getCortexToken(request);
  if (!cortexToken) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  const errors: Record<string, string | null> = {};
  const skipped: string[] = [];

  // Check which services the user has connected via Cortex
  const connections = await getConnections(cortexToken);
  const hasM365 = hasConnection(connections, "m365") || hasConnection(connections, "microsoft");
  const hasAsana = hasConnection(connections, "asana");
  const hasSlack = hasConnection(connections, "slack");
  const hasSalesforce = hasConnection(connections, "salesforce");
  const hasPowerBI = hasConnection(connections, "powerbi");

  console.log("[live] Connection status:", { hasM365, hasAsana, hasSlack, hasSalesforce, hasPowerBI });

  // Initialize Cortex session with user's token
  let sessionId = "";
  try {
    sessionId = await cortexInit(cortexToken);
  } catch (e) {
    errors.cortex = String(e);
  }

  if (!sessionId) {
    return NextResponse.json(
      {
        emails: [],
        calendar: [],
        tasks: [],
        chats: [],
        slack: [],
        powerbi: { reports: [], kpis: [] },
        pipeline: [],
        fetchedAt: new Date().toISOString(),
        source: "live",
        errors,
        skipped: ["all — no Cortex session"],
        connections: { m365: hasM365, asana: hasAsana, slack: hasSlack, salesforce: hasSalesforce, powerbi: hasPowerBI },
      },
      { status: 200 }
    );
  }

  // Only fetch data for services the user has connected
  const fetches: Record<string, Promise<unknown>> = {};

  if (hasM365) {
    fetches.emails = fetchEmails(cortexToken, sessionId);
    fetches.calendar = fetchCalendar(cortexToken, sessionId);
    fetches.chats = fetchTeamsChats(cortexToken, sessionId);
  } else {
    skipped.push("m365");
  }

  if (hasAsana) {
    fetches.tasks = fetchAsanaTasks(cortexToken, sessionId);
  } else {
    skipped.push("asana");
  }

  if (hasSlack) {
    fetches.slack = fetchSlackMessages(cortexToken, sessionId);
  } else {
    skipped.push("slack");
  }

  if (hasPowerBI) {
    fetches.powerbi = fetchPowerBI(cortexToken, sessionId);
  } else {
    skipped.push("powerbi");
  }

  if (hasSalesforce) {
    fetches.pipeline = fetchSalesforce(cortexToken, sessionId);
    fetches.sfKpis = fetchSalesforceKPIs(cortexToken, sessionId);
  } else {
    skipped.push("salesforce");
  }

  // Execute all fetches in parallel
  const keys = Object.keys(fetches);
  const results = await Promise.allSettled(Object.values(fetches));
  const resolved: Record<string, unknown> = {};
  for (let i = 0; i < keys.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      resolved[keys[i]] = r.value;
    } else {
      errors[keys[i]] = String(r.reason);
      resolved[keys[i]] = keys[i] === "powerbi" ? { reports: [], kpis: [] } : [];
    }
  }

  const pbi = (resolved.powerbi ?? { reports: [], kpis: [] }) as { reports: unknown[]; kpis: unknown[] };
  const sfKpis = (resolved.sfKpis ?? []) as unknown[];

  return NextResponse.json({
    emails: resolved.emails ?? [],
    calendar: resolved.calendar ?? [],
    tasks: resolved.tasks ?? [],
    chats: resolved.chats ?? [],
    slack: resolved.slack ?? [],
    powerbi: {
      ...pbi,
      kpis: sfKpis.length > 0 ? sfKpis : pbi.kpis,
    },
    pipeline: resolved.pipeline ?? [],
    fetchedAt: new Date().toISOString(),
    source: "live",
    errors,
    skipped,
    connections: { m365: hasM365, asana: hasAsana, slack: hasSlack, salesforce: hasSalesforce, powerbi: hasPowerBI },
  });
}
