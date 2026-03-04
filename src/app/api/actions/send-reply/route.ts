import { NextRequest, NextResponse } from 'next/server';

async function getToken() {
  const refreshToken = process.env.M365_REFRESH_TOKEN;
  const clientId = process.env.M365_CLIENT_ID;
  const tenantId = process.env.M365_TENANT_ID;
  if (!refreshToken || !clientId || !tenantId) throw new Error('M365 env vars missing');
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: refreshToken,
      scope: 'https://graph.microsoft.com/.default offline_access',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Token refresh failed');
  return data.access_token;
}

export async function POST(req: NextRequest) {
  try {
    const { messageId, body, subject, toEmail, toName } = await req.json();

    if (!body?.trim()) {
      return NextResponse.json({ error: 'Reply body is required' }, { status: 400 });
    }

    const token = await getToken();

    // If we have a messageId, use createReply on that message
    if (messageId && messageId !== 'teams' && messageId !== 'asana') {
      // Create a reply draft
      const draftRes = await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${messageId}/createReply`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }
      );
      if (!draftRes.ok) throw new Error(`createReply failed: ${draftRes.status}`);
      const draft = await draftRes.json();

      // Update the draft body
      await fetch(`https://graph.microsoft.com/v1.0/me/messages/${draft.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: { contentType: 'Text', content: body },
        }),
      });

      return NextResponse.json({ ok: true, drafted: true });
    }

    // Fallback: create a draft to a specific address
    if (toEmail) {
      const draftRes = await fetch('https://graph.microsoft.com/v1.0/me/messages', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject || '(no subject)',
          body: { contentType: 'Text', content: body },
          toRecipients: [{ emailAddress: { address: toEmail, name: toName || toEmail } }],
        }),
      });
      if (!draftRes.ok) throw new Error(`createDraft failed: ${draftRes.status}`);
      return NextResponse.json({ ok: true, drafted: true });
    }

    return NextResponse.json({ error: 'No messageId or toEmail provided' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
