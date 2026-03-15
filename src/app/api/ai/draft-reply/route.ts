import { NextRequest, NextResponse } from "next/server";
import { streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { getWritingStyle } from "@/lib/constants";
import { getCortexToken, cortexCall, cortexInit } from "@/lib/cortex/client";
import { getCortexUserFromRequest } from "@/lib/cortex/user";
import { extractEmailDetail } from "@/lib/email-reply";

function trimForModel(value: string, max = 6000): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}\n\n[truncated]`;
}

export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const prompt = String(body.prompt ?? "").trim();
  const channel = String(body.channel ?? "").trim();
  const messageId = String(body.messageId ?? "").trim();

  if (!prompt || !channel) {
    return NextResponse.json(
      { error: "Missing required fields: prompt, channel" },
      { status: 400 }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  let resolvedMessage = String(body.message ?? "").trim();
  let resolvedSender = String(body.sender ?? "").trim();
  let resolvedSubject = String(body.subject ?? "").trim();
  let earlierContext = "";

  if (channel === "email") {
    if (!messageId) {
      return NextResponse.json(
        { error: "messageId is required for email drafts" },
        { status: 400 }
      );
    }

    const cortexToken = getCortexToken(request);
    if (!cortexToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const sessionId = await cortexInit(cortexToken);
    const rawMessage = await cortexCall(
      cortexToken,
      sessionId,
      `draft-email-${messageId}`,
      "m365__get_email",
      { message_id: messageId }
    );

    const email = extractEmailDetail(rawMessage, messageId);
    resolvedMessage = email.latestMessageText || email.replyableText || email.bodyText;
    resolvedSender = email.fromName || email.fromEmail || resolvedSender;
    resolvedSubject = email.subject || resolvedSubject;
    earlierContext = email.earlierThreadText || "";
  }

  if (!resolvedMessage || !resolvedSender || !resolvedSubject) {
    return NextResponse.json(
      { error: "Unable to resolve message context for draft" },
      { status: 400 }
    );
  }

  const signedInUser = await getCortexUserFromRequest(request);
  const isAri = signedInUser?.email.toLowerCase() === "ari@sonance.com";
  const systemPrompt = `${getWritingStyle(isAri)}

You are drafting a reply to a ${channel} message.
Reply as the signed-in user. Ground the reply in the actual message content and the user's guidance.
Do not echo the original salutation unless it genuinely fits the reply.
Do not address copied recipients unless the reply truly needs them.
For appreciation or thank-you notes, keep the reply to 1-3 sentences.
Do not invent meetings, next steps, owners, or commitments unless the message or user guidance explicitly supports them.
Output only the reply body. No subject line. No explanation.`;

  try {
    const result = streamText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            `Incoming ${channel} subject: ${resolvedSubject}`,
            `From: ${resolvedSender}`,
            "",
            "Latest message to reply to:",
            trimForModel(resolvedMessage),
            earlierContext
              ? `\nEarlier thread context:\n${trimForModel(earlierContext, 4000)}`
              : "",
            "",
            "Reply guidance:",
            prompt,
          ].join("\n"),
        },
      ],
      maxOutputTokens: 500,
    });

    const text = await result.text;
    if (!text.trim()) {
      return NextResponse.json({ error: "Empty response from AI" }, { status: 502 });
    }

    return new Response(text, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
