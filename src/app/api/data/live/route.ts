import { NextResponse } from 'next/server';

const M365_CLIENT_ID = process.env.M365_CLIENT_ID!;
const M365_TENANT_ID = process.env.M365_TENANT_ID!;
const M365_REFRESH_TOKEN = process.env.M365_REFRESH_TOKEN!;
const ASANA_PAT = process.env.ASANA_PAT!;
const CORTEX_API_KEY = process.env.CORTEX_API_KEY!;
const CORTEX_URL = 'https://cortex-bice.vercel.app/mcp/cortex';

// ─── Cortex MCP client ────────────────────────────────────────────────────────

async function cortexInit(): Promise<string> {
  const res = await fetch(CORTEX_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CORTEX_API_KEY,
      'mcp-protocol-version': '2024-11-05',
      'x-cortex-client': 'cortex-mcp-stdio',
    },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'init',
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'command-center', version: '1.0.0' } },
    }),
  });
  const sessionId = res.headers.get('mcp-session-id');
  if (!sessionId) {
    const body = await res.text();
    throw new Error(`Cortex init failed — no session ID. Status: ${res.status}. Body: ${body.slice(0, 200)}`);
  }
  return sessionId;
}

async function cortexCall(sessionId: string, id: string, tool: string, args: Record<string, unknown>) {
  const res = await fetch(CORTEX_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CORTEX_API_KEY,
      'mcp-protocol-version': '2024-11-05',
      'x-cortex-client': 'cortex-mcp-stdio',
      'mcp-session-id': sessionId,
    },
    body: JSON.stringify({
      jsonrpc: '2.0', id,
      method: 'tools/call',
      params: { name: tool, arguments: args },
    }),
  });
  const data = await res.json() as { result?: { content?: { text?: string }[] } };
  const text = data?.result?.content?.[0]?.text ?? '{}';
  try { return JSON.parse(text); } catch { return {}; }
}

// ─── M365 direct (email + calendar — faster than Cortex) ─────────────────────

async function getM365Token(): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: M365_CLIENT_ID,
    refresh_token: M365_REFRESH_TOKEN,
    scope: 'https://graph.microsoft.com/.default offline_access',
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${M365_TENANT_ID}/oauth2/v2.0/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }
  );
  const data = await res.json() as { access_token?: string };
  if (!data.access_token) throw new Error('M365 token failed');
  return data.access_token;
}

async function fetchEmails(token: string) {
  // Get 60 most recent inbox emails sorted newest first, filter focused client-side
  // NOTE: Graph API rejects $filter + $orderby together (InefficientFilter)
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=60&$select=id,subject,from,receivedDateTime,isRead,hasAttachments,bodyPreview,inferenceClassification&$orderby=receivedDateTime desc`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json() as { value?: Record<string, unknown>[] };
  const now = new Date().toISOString();
  return ((data.value ?? []) as Record<string, unknown>[])
    .filter(m => m.inferenceClassification === 'focused' && !m.isDraft)
    .slice(0, 40)
    .map((m) => {
      const from = m.from as { emailAddress: { name: string; address: string } };
      const receivedAt = m.receivedDateTime as string;
      const daysDiff = Math.floor((Date.now() - new Date(receivedAt).getTime()) / (1000 * 60 * 60 * 24));
      return {
        id: m.id, message_id: m.id,
        subject: m.subject || '(no subject)',
        from_name: from?.emailAddress?.name || from?.emailAddress?.address || '',
        from_email: from?.emailAddress?.address || '',
        preview: ((m.bodyPreview as string) || '').slice(0, 160),
        body_html: '',
        received_at: receivedAt,
        is_read: m.isRead as boolean,
        folder: 'focused',
        has_attachments: m.hasAttachments as boolean,
        outlook_url: `https://outlook.office.com/mail/inbox/id/${encodeURIComponent(m.id as string)}`,
        needs_reply: !(m.isRead as boolean),
        days_overdue: Math.max(0, daysDiff - 2),
        synced_at: now,
      };
    });
}

async function fetchCalendar(token: string) {
  const now = new Date();
  const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${now.toISOString()}&endDateTime=${end.toISOString()}&$select=id,subject,start,end,location,isOnlineMeeting,onlineMeetingUrl,organizer,webLink&$orderby=start/dateTime&$top=20`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json() as { value?: Record<string, unknown>[] };
  const synced = new Date().toISOString();
  return ((data.value ?? []) as Record<string, unknown>[]).map((e) => {
    const start = e.start as { dateTime: string };
    const end = e.end as { dateTime: string };
    const loc = e.location as { displayName?: string };
    const organizer = e.organizer as { emailAddress?: { name?: string } };
    return {
      id: e.id, event_id: e.id,
      subject: e.subject || '(no title)',
      location: loc?.displayName || '',
      start_time: start?.dateTime ? start.dateTime + 'Z' : '',
      end_time: end?.dateTime ? end.dateTime + 'Z' : '',
      is_all_day: start?.dateTime?.endsWith('T00:00:00.0000000') && end?.dateTime?.endsWith('T00:00:00.0000000'),
      organizer: organizer?.emailAddress?.name || '',
      is_online: e.isOnlineMeeting as boolean,
      join_url: (e.onlineMeetingUrl as string) || (e.webLink as string) || '',
      outlook_url: (e.webLink as string) || '',
      synced_at: synced,
    };
  });
}

// ─── Asana direct ─────────────────────────────────────────────────────────────

async function fetchAsanaTasks() {
  const res = await fetch(
    `https://app.asana.com/api/1.0/tasks?project=1211840949719691&opt_fields=gid,name,due_on,completed,permalink_url,assignee,notes&limit=100`,
    { headers: { Authorization: `Bearer ${ASANA_PAT}` } }
  );
  const data = await res.json() as { data?: Record<string, unknown>[] };
  const today = new Date();
  const ARI_GID = '1206594996279383';
  const now = new Date().toISOString();
  return ((data.data ?? []) as Record<string, unknown>[])
    .filter((t) => {
      if (t.completed) return false;
      const assignee = t.assignee as { gid?: string } | null;
      return !assignee || assignee.gid === ARI_GID;
    })
    .map((t) => {
      const dueOn = t.due_on as string | null;
      let daysOverdue = 0;
      if (dueOn) {
        const due = new Date(dueOn + 'T00:00:00');
        daysOverdue = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
      }
      return {
        id: t.gid, task_gid: t.gid, name: t.name,
        notes: (t.notes as string) || '',
        due_on: dueOn || '',
        completed: false, assignee: ARI_GID,
        project_name: "Ari's Plan",
        permalink_url: t.permalink_url,
        priority: 'normal',
        days_overdue: daysOverdue,
        synced_at: now,
      };
    });
}

// ─── Cortex: Teams chats ──────────────────────────────────────────────────────

async function fetchTeamsChats(sessionId: string) {
  const result = await cortexCall(sessionId, 'teams1', 'm365__list_chats', { limit: 20 });
  const chats: Record<string, unknown>[] = result.chats ?? [];
  const now = new Date().toISOString();

  // Get recent messages for top 8 chats in parallel
  const withMessages = await Promise.allSettled(
    chats.slice(0, 8).map(async (chat) => {
      const msgsResult = await cortexCall(sessionId, `msg_${chat.id}`, 'm365__list_chat_messages', {
        chat_id: chat.id as string,
        limit: 3,
      });
      const messages: Record<string, unknown>[] = msgsResult.messages ?? [];
      const lastMsg = messages[0];
      const from = lastMsg ? ((lastMsg.from as Record<string, unknown>)?.user as Record<string, unknown>)?.displayName as string || '' : '';
      const body = lastMsg ? ((lastMsg.body as Record<string, unknown>)?.content as string || '').replace(/<[^>]+>/g, '').trim().slice(0, 120) : '';
      return {
        id: chat.id, chat_id: chat.id,
        topic: (chat.topic as string) || from || 'Teams Chat',
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
    .filter((r) => r.status === 'fulfilled')
    .map((r) => (r as PromiseFulfilledResult<unknown>).value)
    .filter((c) => {
      const chat = c as Record<string, unknown>;
      return chat.last_message_preview || chat.topic;
    });
}

// ─── Cortex: Slack ────────────────────────────────────────────────────────────

async function fetchSlackMessages(sessionId: string) {
  // Get recent messages from key channels
  const KEY_CHANNELS = ['general', 'slt', 'leadership', 'executive', 'ai'];
  const result = await cortexCall(sessionId, 'slack1', 'slack__list_channels', { limit: 30 });
  const channels: Record<string, unknown>[] = result.channels ?? [];

  // Prioritize key channels, then take most active
  const prioritized = [
    ...channels.filter((c) => KEY_CHANNELS.some((k) => (c.name as string || '').toLowerCase().includes(k))),
    ...channels.filter((c) => !KEY_CHANNELS.some((k) => (c.name as string || '').toLowerCase().includes(k))),
  ].slice(0, 5);

  const messages = await Promise.allSettled(
    prioritized.map(async (ch) => {
      const msgs = await cortexCall(sessionId, `slack_${ch.id}`, 'slack__get_channel_history', {
        channel_id: ch.id as string,
        limit: 3,
      });
      return { channel: ch.name, messages: (msgs.messages ?? []) as Record<string, unknown>[] };
    })
  );

  const now = new Date().toISOString();
  const items: Record<string, unknown>[] = [];
  for (const r of messages) {
    if (r.status !== 'fulfilled') continue;
    const { channel, messages: msgs } = r.value;
    for (const m of msgs.slice(0, 2)) {
      if (!m.text && !m.attachments) continue;
      items.push({
        id: m.ts as string,
        message_ts: m.ts as string,
        author_name: (m.username as string) || (m.user as string) || 'Unknown',
        author_id: m.user as string || null,
        text: (m.text as string) || '',
        timestamp: new Date((parseFloat(m.ts as string) * 1000)).toISOString(),
        channel_name: channel,
        reactions: [],
        thread_reply_count: (m.reply_count as number) || 0,
        has_files: !!(m.files as unknown[])?.length,
        permalink: null,
        synced_at: now,
      });
    }
  }

  return items.sort((a, b) =>
    new Date(b.timestamp as string).getTime() - new Date(a.timestamp as string).getTime()
  ).slice(0, 10);
}

// ─── Cortex: Power BI ────────────────────────────────────────────────────────

const SONANCE_WORKSPACE_ID = '05fd9b2f-5d90-443f-8927-ebc2a507c0d9';

async function fetchPowerBI(sessionId: string) {
  // Fetch reports and datasets in parallel
  const [reportsResult, datasetsResult] = await Promise.allSettled([
    cortexCall(sessionId, 'pbi_reports', 'powerbi__list_reports', { workspace_id: SONANCE_WORKSPACE_ID }),
    cortexCall(sessionId, 'pbi_datasets', 'powerbi__list_datasets', { workspace_id: SONANCE_WORKSPACE_ID }),
  ]);

  const reports: Record<string, unknown>[] = (reportsResult.status === 'fulfilled' ? reportsResult.value?.reports : null) ?? [];
  const datasets: Record<string, unknown>[] = (datasetsResult.status === 'fulfilled' ? datasetsResult.value?.datasets : null) ?? [];

  const now = new Date().toISOString();

  const reportConfigs = reports
    .filter((r) => r.name && r.id)
    .map((r, i) => ({
      id: r.id as string,
      report_id: r.id as string,
      report_name: r.name as string,
      workspace_id: SONANCE_WORKSPACE_ID,
      embed_url: (r.embedUrl as string) || (r.webUrl as string) || null,
      description: null,
      display_order: i,
      is_active: true,
      created_at: now,
      updated_at: now,
    }));

  // Build KPI stubs from datasets — actual values would need DAX queries
  const kpis = datasets
    .filter((d) => d.name && d.id)
    .map((d, i) => ({
      id: d.id as string,
      kpi_name: d.name as string,
      kpi_category: 'revenue',
      current_value: null,
      previous_value: null,
      target_value: null,
      unit: '$',
      period: 'current',
      dataset_id: d.id as string,
      dax_query: null,
      raw_result: null,
      synced_at: now,
    }));

  return { reports: reportConfigs, kpis };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

async function fetchSalesforceKPIs(sessionId: string) {
  const now = new Date().toISOString();
  try {
    const [pipelineResult, wonResult, lostResult] = await Promise.allSettled([
      cortexCall(sessionId, 'sf_pipe', 'salesforce__run_soql_query', {
        query: "SELECT StageName, COUNT(Id) dealCount, SUM(Amount) pipelineTotal FROM Opportunity WHERE IsClosed = false GROUP BY StageName"
      }),
      cortexCall(sessionId, 'sf_won', 'salesforce__run_soql_query', {
        query: "SELECT COUNT(Id) wonCount, SUM(Amount) wonTotal FROM Opportunity WHERE IsWon = true AND CloseDate >= 2026-01-01"
      }),
      cortexCall(sessionId, 'sf_lost', 'salesforce__run_soql_query', {
        query: "SELECT COUNT(Id) lostCount FROM Opportunity WHERE IsWon = false AND IsClosed = true AND CloseDate >= 2026-01-01"
      }),
    ]);

    const pipelineRecords = pipelineResult.status === 'fulfilled' ? (pipelineResult.value?.records ?? []) as Record<string, unknown>[] : [];
    const wonRecord = wonResult.status === 'fulfilled' ? ((wonResult.value?.records ?? [])[0] ?? {}) as Record<string, unknown> : {};
    const lostRecord = lostResult.status === 'fulfilled' ? ((lostResult.value?.records ?? [])[0] ?? {}) as Record<string, unknown> : {};

    const pipelineTotal = pipelineRecords.reduce((s, r) => s + (Number(r.pipelineTotal) || 0), 0);
    const openDeals = pipelineRecords.reduce((s, r) => s + (Number(r.dealCount) || 0), 0);
    const wonTotal = Number(wonRecord.wonTotal) || 0;
    const wonCount = Number(wonRecord.wonCount) || 0;
    const lostCount = Number(lostRecord.lostCount) || 0;
    const winRate = (wonCount + lostCount) > 0 ? Math.round((wonCount / (wonCount + lostCount)) * 100) : 0;

    // Top stage by value
    const topStage = pipelineRecords.length > 0
      ? pipelineRecords.reduce((a, b) => (Number(a.pipelineTotal) || 0) > (Number(b.pipelineTotal) || 0) ? a : b)
      : null;

    return [
      {
        id: 'sf-pipeline',
        kpi_name: 'Open Pipeline',
        kpi_category: 'revenue',
        current_value: pipelineTotal,
        previous_value: null,
        target_value: null,
        unit: '$',
        period: 'current',
        subtitle: `${openDeals} open deals`,
        synced_at: now,
      },
      {
        id: 'sf-won-ytd',
        kpi_name: 'Won YTD',
        kpi_category: 'revenue',
        current_value: wonTotal,
        previous_value: null,
        target_value: null,
        unit: '$',
        period: '2026 YTD',
        subtitle: `${wonCount} deals closed`,
        synced_at: now,
      },
      {
        id: 'sf-win-rate',
        kpi_name: 'Win Rate',
        kpi_category: 'revenue',
        current_value: winRate,
        previous_value: null,
        target_value: null,
        unit: '%',
        period: '2026 YTD',
        subtitle: `${wonCount}W / ${lostCount}L`,
        synced_at: now,
      },
      {
        id: 'sf-top-stage',
        kpi_name: 'Largest Stage',
        kpi_category: 'revenue',
        current_value: topStage ? Number(topStage.pipelineTotal) || 0 : 0,
        previous_value: null,
        target_value: null,
        unit: '$',
        period: 'current',
        subtitle: topStage ? String(topStage.StageName) : '',
        synced_at: now,
      },
    ];
  } catch {
    return [];
  }
}


async function fetchSalesforce(sessionId: string) {
  const query = "SELECT Id, Name, Amount, StageName, CloseDate, Account.Name, Owner.Name, Probability, RecordType.Name, Type FROM Opportunity WHERE IsClosed = false ORDER BY Amount DESC NULLS LAST LIMIT 50";

  try {
    const result = await cortexCall(sessionId, 'sf_opps', 'salesforce__run_soql_query', { query });
    const records: Record<string, unknown>[] = result?.records ?? [];
    return records.map((r) => ({
      id: r.Id as string,
      sf_opportunity_id: r.Id as string,
      name: r.Name as string,
      amount: Number(r.Amount ?? 0),
      stage: r.StageName as string,
      close_date: r.CloseDate as string,
      account_name: (r.Account as Record<string, unknown>)?.Name as string || '',
      owner_name: (r.Owner as Record<string, unknown>)?.Name as string || '',
      probability: Number(r.Probability ?? 0),
      is_closed: false,
      is_won: false,
      record_type: (r.RecordType as Record<string, unknown>)?.Name as string || (r.Type as string) || '',
      territory: '',
      sales_channel: '',
      days_in_stage: null,
      days_to_close: Math.ceil((new Date(r.CloseDate as string).getTime() - Date.now()) / 86400000),
      has_overdue_task: false,
      sf_url: `https://sonance.lightning.force.com/lightning/r/Opportunity/${r.Id as string}/view`,
    }));
  } catch {
    return [];
  }
}


export async function GET() {
  const errors: Record<string, string | null> = {};

  // Initialize Cortex session
  let sessionId = '';
  try {
    sessionId = await cortexInit();
  } catch (e) {
    errors.cortex = String(e);
  }

  // Run all fetches in parallel
  const [tokenResult, asanaResult, teamsResult, slackResult, powerbiResult, sfResult, sfKpiResult] = await Promise.allSettled([
    getM365Token(),
    fetchAsanaTasks(),
    sessionId ? fetchTeamsChats(sessionId) : Promise.resolve([]),
    sessionId ? fetchSlackMessages(sessionId) : Promise.resolve([]),
    sessionId ? fetchPowerBI(sessionId) : Promise.resolve({ reports: [], kpis: [] }),
    sessionId ? fetchSalesforce(sessionId) : Promise.resolve([]),
    sessionId ? fetchSalesforceKPIs(sessionId) : Promise.resolve([]),
  ]);

  const token = tokenResult.status === 'fulfilled' ? tokenResult.value : null;
  if (tokenResult.status === 'rejected') errors.m365_token = String(tokenResult.reason);

  const [emailsResult, calendarResult] = await Promise.allSettled([
    token ? fetchEmails(token) : Promise.resolve([]),
    token ? fetchCalendar(token) : Promise.resolve([]),
  ]);

  return NextResponse.json({
    emails: emailsResult.status === 'fulfilled' ? emailsResult.value : [],
    calendar: calendarResult.status === 'fulfilled' ? calendarResult.value : [],
    tasks: asanaResult.status === 'fulfilled' ? asanaResult.value : [],
    chats: teamsResult.status === 'fulfilled' ? teamsResult.value : [],
    slack: slackResult.status === 'fulfilled' ? slackResult.value : [],
    powerbi: (() => { const pbi = powerbiResult.status === 'fulfilled' ? powerbiResult.value : { reports: [], kpis: [] }; const sfKpis = sfKpiResult?.status === 'fulfilled' ? sfKpiResult.value : []; return { ...pbi, kpis: sfKpis.length > 0 ? sfKpis : pbi.kpis }; })(),
    pipeline: sfResult.status === 'fulfilled' ? sfResult.value : [],
    fetchedAt: new Date().toISOString(),
    source: 'live',
    errors,
  });
}
// token-refresh-1772601264
