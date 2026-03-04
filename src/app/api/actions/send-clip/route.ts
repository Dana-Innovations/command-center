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

async function uploadImageToOneDrive(token: string, imageBase64: string, filename: string): Promise<string> {
  const buffer = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
  const uploadRes = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/root:/CommandCenterClips/${filename}:/content`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/png' },
      body: buffer,
    }
  );
  if (!uploadRes.ok) return '';
  const file = await uploadRes.json();
  const shareRes = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${file.id}/createLink`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'view', scope: 'organization' }),
    }
  );
  const shareData = await shareRes.json();
  return shareData.link?.webUrl || file.webUrl || '';
}

export async function POST(req: NextRequest) {
  try {
    const { note, imageBase64, destination, reportUrl, reportName } = await req.json();
    if (!destination) return NextResponse.json({ error: 'No destination' }, { status: 400 });

    const token = await getToken();
    const timestamp = new Date().toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
    const filename = `clip-${Date.now()}.png`;

    let imageUrl = '';
    if (imageBase64) {
      imageUrl = await uploadImageToOneDrive(token, imageBase64, filename).catch(() => '');
    }

    const reportBtnHtml = reportUrl
      ? `<p style="margin:14px 0"><a href="${reportUrl}" style="display:inline-block;background:#d4a44c;color:#0d0d0d;padding:9px 18px;border-radius:6px;text-decoration:none;font-weight:700;font-size:13px">📊 Open ${reportName || 'Report'} →</a></p>`
      : '';

    const reportLinkText = reportUrl ? `\n\n📊 Open report: ${reportUrl}` : '';

    if (destination.type === 'teams_chat') {
      const htmlContent = [
        note ? `<p style="font-size:14px">${note.replace(/\n/g, '<br>')}</p>` : '',
        imageUrl ? `<p><a href="${imageUrl}" style="color:#d4a44c;font-weight:600">📎 View screenshot →</a></p>` : '',
        reportUrl ? `<p><a href="${reportUrl}" style="color:#d4a44c;font-weight:600">📊 Open ${reportName || 'Report'} →</a></p>` : '',
        `<p style="color:#666;font-size:11px">Sent from Sonance Command Center &middot; ${timestamp}</p>`,
      ].filter(Boolean).join('');

      const chatRes = await fetch(
        `https://graph.microsoft.com/v1.0/chats/${destination.id}/messages`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: { contentType: 'html', content: htmlContent } }),
        }
      );
      if (!chatRes.ok) throw new Error(`Teams send failed: ${chatRes.status}`);
      return NextResponse.json({ ok: true, to: destination.name });
    }

    if (destination.type === 'email') {
      const htmlBody = [
        `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;max-width:680px">`,
        note ? `<p style="font-size:15px;line-height:1.5;color:#1a1a1a">${note.replace(/\n/g, '<br>')}</p>` : '',
        imageBase64 ? `<p style="margin:16px 0"><img src="${imageBase64}" style="max-width:100%;border-radius:8px;border:1px solid #ddd;display:block" /></p>` : '',
        reportBtnHtml,
        imageUrl ? `<p style="margin:8px 0"><a href="${imageUrl}" style="color:#888;font-size:12px">View screenshot in OneDrive →</a></p>` : '',
        `<hr style="border:none;border-top:1px solid #eee;margin:20px 0" />`,
        `<p style="color:#999;font-size:12px">Sent from Sonance Command Center &middot; ${timestamp}</p>`,
        `</div>`,
      ].filter(Boolean).join('');

      const sendRes = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            subject: `📊 ${reportName || 'Command Center'} Clip · ${timestamp}`,
            body: { contentType: 'HTML', content: htmlBody },
            toRecipients: [{ emailAddress: { address: destination.address, name: destination.name || destination.address } }],
          },
        }),
      });
      if (!sendRes.ok) throw new Error(`Email send failed: ${sendRes.status}`);
      return NextResponse.json({ ok: true, to: destination.address });
    }

    return NextResponse.json({ error: 'Unknown destination type' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
