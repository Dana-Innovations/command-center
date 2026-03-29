import { NextRequest, NextResponse } from "next/server";
import { cortexCall, cortexInit, getCortexToken } from "@/lib/cortex/client";
import { getCortexUserFromRequest } from "@/lib/cortex/user";

export async function POST(request: NextRequest) {
  try {
    const user = await getCortexUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const cortexToken = getCortexToken(request)!;

    const body = (await request.json()) as {
      channelId?: string;
      message?: string;
      threadTs?: string;
    };

    const channelId = String(body.channelId ?? "").trim();
    const message = String(body.message ?? "").trim();
    const threadTs = String(body.threadTs ?? "").trim() || undefined;

    if (!channelId || !message) {
      return NextResponse.json(
        { error: "channelId and message are required" },
        { status: 400 }
      );
    }

    const sessionId = await cortexInit(cortexToken);

    if (threadTs) {
      await cortexCall(
        cortexToken,
        sessionId,
        `slack-thread-${channelId}-${threadTs}`,
        "slack__reply_to_thread",
        { channel_id: channelId, message, thread_ts: threadTs }
      );
    } else {
      await cortexCall(
        cortexToken,
        sessionId,
        `slack-msg-${channelId}`,
        "slack__send_message",
        { channel_id: channelId, message }
      );
    }

    return NextResponse.json({ ok: true, sent: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to send Slack message";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
