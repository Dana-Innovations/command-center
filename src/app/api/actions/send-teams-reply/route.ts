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
      chatId?: string;
      message?: string;
    };

    const chatId = String(body.chatId ?? "").trim();
    const message = String(body.message ?? "").trim();

    if (!chatId || !message) {
      return NextResponse.json(
        { error: "chatId and message are required" },
        { status: 400 }
      );
    }

    const sessionId = await cortexInit(cortexToken);
    await cortexCall(
      cortexToken,
      sessionId,
      `teams-reply-${chatId}`,
      "m365__send_chat_message",
      { chat_id: chatId, message }
    );

    return NextResponse.json({ ok: true, sent: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to send Teams message";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
