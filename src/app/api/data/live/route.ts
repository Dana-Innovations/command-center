import { NextResponse } from 'next/server';

const M365_CLIENT_ID = process.env.M365_CLIENT_ID!;
const M365_TENANT_ID = process.env.M365_TENANT_ID!;
const M365_REFRESH_TOKEN = process.env.M365_REFRESH_TOKEN!;
const ASANA_PAT = process.env.ASANA_PAT!;

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
  const data = await res.json();
  if (!data.access_token) throw new Error(`M365 token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function fetchEmails(token: string) {
  // Only Focused Inbox, last 30 days — no Junk/Spam/Deleted/Other
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const filter = encodeURIComponent(
    `inferenceClassification eq 'focused' and isDraft eq false and receivedDateTime ge ${since}`
  );
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=40&$select=id,subject,from,receivedDateTime,isRead,hasAttachments,bodyPreview&$filter=${filter}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  const now = new Date().toISOString();
  const sorted = (data.value ?? []).sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
    new Date(b.receivedDateTime as string).getTime() - new Date(a.receivedDateTime as string).getTime()
  );
  return sorted.map((m: Record<string, unknown>) => {
    const from = m.from as { emailAddress: { name: string; address: string } };
    const receivedAt = m.receivedDateTime as string;
    const daysDiff = Math.floor((Date.now() - new Date(receivedAt).getTime()) / (1000 * 60 * 60 * 24));
    return {
      id: m.id,
      message_id: m.id,
      subject: m.subject || '(no subject)',
      from_name: from?.emailAddress?.name || from?.emailAddress?.address || '',
      from_email: from?.emailAddress?.address || '',
      preview: (m.bodyPreview as string)?.slice(0, 160) || '',
      body_html: '',
      received_at: receivedAt,
      is_read: m.isRead as boolean,
      folder: 'inbox',
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
    `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${now.toISOString()}&endDateTime=${end.toISOString()}&$select=id,subject,start,end,location,isOnlineMeeting,onlineMeetingUrl,attendees,organizer,webLink&$orderby=start/dateTime&$top=20`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  const synced = new Date().toISOString();
  return (data.value ?? []).map((e: Record<string, unknown>) => {
    const start = e.start as { dateTime: string };
    const end = e.end as { dateTime: string };
    const loc = e.location as { displayName?: string };
    const organizer = e.organizer as { emailAddress?: { name?: string } };
    const attendees = e.attendees as unknown[];
    const isAllDay = start?.dateTime?.endsWith('T00:00:00.0000000') &&
                     end?.dateTime?.endsWith('T00:00:00.0000000');
    return {
      id: e.id,
      event_id: e.id,
      subject: e.subject || '(no title)',
      location: loc?.displayName || '',
      start_time: start?.dateTime ? start.dateTime + 'Z' : '',
      end_time: end?.dateTime ? end.dateTime + 'Z' : '',
      is_all_day: isAllDay,
      organizer: organizer?.emailAddress?.name || '',
      is_online: e.isOnlineMeeting as boolean,
      join_url: (e.onlineMeetingUrl as string) || (e.webLink as string) || '',
      outlook_url: (e.webLink as string) || '',
      attendee_count: attendees?.length ?? 0,
      synced_at: synced,
    };
  });
}

async function fetchTeamsMessages(token: string) {
  // Get Teams chats (direct messages and group chats)
  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/chats?$select=id,topic,chatType,lastUpdatedDateTime&$top=20&$orderby=lastUpdatedDateTime desc`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    const chats = data.value ?? [];
    const synced = new Date().toISOString();

    // Get last message for each chat (parallel, limit to 10)
    const chatItems = await Promise.allSettled(
      chats.slice(0, 10).map(async (chat: Record<string, unknown>) => {
        const msgRes = await fetch(
          `https://graph.microsoft.com/v1.0/me/chats/${chat.id}/messages?$top=1&$select=id,from,body,createdDateTime`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const msgData = await msgRes.json();
        const lastMsg = msgData.value?.[0];
        const from = lastMsg?.from?.user?.displayName || lastMsg?.from?.application?.displayName || '';
        const bodyContent = lastMsg?.body?.content?.replace(/<[^>]+>/g, '').slice(0, 120) || '';
        return {
          id: chat.id,
          chat_id: chat.id,
          topic: (chat.topic as string) || from || 'Chat',
          chat_type: chat.chatType as string,
          last_message_preview: bodyContent,
          last_sender: from,
          last_activity: (chat.lastUpdatedDateTime as string) || synced,
          synced_at: synced,
        };
      })
    );

    return chatItems
      .filter((r) => r.status === 'fulfilled')
      .map((r) => (r as PromiseFulfilledResult<unknown>).value);
  } catch {
    return [];
  }
}

async function fetchAsanaTasks() {
  const res = await fetch(
    `https://app.asana.com/api/1.0/tasks?project=1211840949719691&opt_fields=gid,name,due_on,completed,permalink_url,assignee,notes,assignee_status&limit=100`,
    { headers: { Authorization: `Bearer ${ASANA_PAT}` } }
  );
  const data = await res.json();
  const today = new Date();
  const ARI_GID = '1206594996279383';
  const now = new Date().toISOString();

  return (data.data ?? [])
    .filter((t: Record<string, unknown>) => {
      if (t.completed) return false;
      const assignee = t.assignee as { gid?: string } | null;
      return !assignee || assignee.gid === ARI_GID;
    })
    .map((t: Record<string, unknown>) => {
      const dueOn = t.due_on as string | null;
      let daysOverdue = 0;
      if (dueOn) {
        const due = new Date(dueOn + 'T00:00:00');
        daysOverdue = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
      }
      return {
        id: t.gid,
        task_gid: t.gid,
        name: t.name,
        notes: (t.notes as string) || '',
        due_on: dueOn || '',
        completed: false,
        assignee: ARI_GID,
        project_name: "Ari's Plan",
        permalink_url: t.permalink_url,
        priority: 'normal',
        days_overdue: daysOverdue,
        synced_at: now,
      };
    });
}

export async function GET() {
  try {
    const [tokenResult, asanaResult] = await Promise.allSettled([
      getM365Token(),
      fetchAsanaTasks(),
    ]);

    const token = tokenResult.status === 'fulfilled' ? tokenResult.value : null;

    const [emailsResult, calendarResult, teamsResult] = await Promise.allSettled([
      token ? fetchEmails(token) : Promise.resolve([]),
      token ? fetchCalendar(token) : Promise.resolve([]),
      token ? fetchTeamsMessages(token) : Promise.resolve([]),
    ]);

    return NextResponse.json({
      emails: emailsResult.status === 'fulfilled' ? emailsResult.value : [],
      calendar: calendarResult.status === 'fulfilled' ? calendarResult.value : [],
      tasks: asanaResult.status === 'fulfilled' ? asanaResult.value : [],
      chats: teamsResult.status === 'fulfilled' ? teamsResult.value : [],
      pipeline: [],
      fetchedAt: new Date().toISOString(),
      source: 'live',
      errors: {
        m365: token ? null : (tokenResult.status === 'rejected' ? String(tokenResult.reason) : null),
        asana: asanaResult.status === 'rejected' ? String(asanaResult.reason) : null,
      }
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
