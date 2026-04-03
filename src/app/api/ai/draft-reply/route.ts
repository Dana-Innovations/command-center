import { NextRequest } from "next/server";
import { streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { getWritingStyle } from "@/lib/constants";
import { getCortexToken, cortexCall, cortexInit } from "@/lib/cortex/client";
import { getCortexUserFromRequest } from "@/lib/cortex/user";
import { extractEmailDetail } from "@/lib/email-reply";
import { createServiceClient } from "@/lib/supabase/server";
import {
  buildRelationshipDossier,
  serializeDossierForPrompt,
} from "@/lib/relationship-dossier";
import { fetchVaultPage } from "@/lib/vault-client";

function trimForModel(value: string, max = 6000): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}\n\n[truncated]`;
}

function isWeekend(): boolean {
  const day = new Date().getDay();
  return day === 0 || day === 6;
}

function pickFormalityGuidance(
  channel: string,
  relevanceTier: string
): string {
  if (channel === "teams" || channel === "slack") {
    return "Use Level 8 (Teams Chat) from the Writing Style Guide: most casual, stream of consciousness, often lowercase, periods optional, short fragments. No sign-off.";
  }
  if (channel === "asana") {
    return "Use Level 5 (Quick Operational) from the Writing Style Guide: ultra-brief, action-oriented, no pleasantries needed. Start with the action or decision.";
  }
  // Email — pick by relationship
  if (relevanceTier === "vip") {
    return "Use Level 3 (Internal Leadership / SLT) from the Writing Style Guide: direct, collaborative, sometimes stream-of-consciousness. Short paragraphs. Sign off with just the name or 'Thanks'.";
  }
  if (relevanceTier === "occasional" || relevanceTier === "new" || relevanceTier === "unknown") {
    return "Use Level 2 (Professional External) from the Writing Style Guide: professional, direct, shows homework done. Clear asks, often numbered. Sign off with 'Thanks!' and first name.";
  }
  // active tier or default
  return "Use Level 3 (Internal Leadership) from the Writing Style Guide: direct, collaborative, clear next steps. Sign off simply.";
}

export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const prompt = String(body.prompt ?? "").trim();
  const channel = String(body.channel ?? "").trim();
  const messageId = String(body.messageId ?? "").trim();

  if (!prompt || !channel) {
    return Response.json(
      { error: "Missing required fields: prompt, channel" },
      { status: 400 }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  let resolvedMessage = String(body.message ?? "").trim();
  let resolvedSender = String(body.sender ?? "").trim();
  let resolvedSubject = String(body.subject ?? "").trim();
  let earlierContext = "";

  // Channel-specific context enrichment
  if (channel === "email") {
    if (!messageId) {
      return Response.json(
        { error: "messageId is required for email drafts" },
        { status: 400 }
      );
    }

    const cortexToken = getCortexToken(request);
    if (!cortexToken) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
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

  // Teams, Slack, Asana: use provided message (already in ReplyQueueItem.message)

  if (!resolvedMessage || !resolvedSender) {
    return Response.json(
      { error: "Unable to resolve message context for draft" },
      { status: 400 }
    );
  }

  const signedInUser = await getCortexUserFromRequest(request);
  const isAri = signedInUser?.email.toLowerCase() === "ari@sonance.com";

  // Fetch Writing Style Guide from Vault (for Ari) or fall back to hardcoded
  let writingStyle = getWritingStyle(isAri);
  if (isAri) {
    const vaultStyle = await fetchVaultPage("Writing Style", "personal/preferences");
    if (vaultStyle) {
      writingStyle = vaultStyle;
    }

    // Append weekend tone if applicable
    if (isWeekend()) {
      const weekendTone = await fetchVaultPage("Weekend Tone", "personal/preferences");
      if (weekendTone) {
        writingStyle += `\n\n## Weekend Override\n${weekendTone}`;
      }
    }
  }

  // Enrich with sender relationship context
  let relationshipContext = "";
  let relevanceTier = "unknown";
  if (signedInUser && resolvedSender) {
    try {
      const supabase = createServiceClient();
      const dossier = await buildRelationshipDossier({
        supabase,
        cortexUserId: signedInUser.sub,
        personName: resolvedSender,
      });
      if (dossier.relevanceTier !== "unknown") {
        relationshipContext = serializeDossierForPrompt(dossier);
        relevanceTier = dossier.relevanceTier;
      }
    } catch (e) {
      console.warn("[draft-reply] dossier enrichment failed:", e);
    }
  }

  const formalityGuidance = pickFormalityGuidance(channel, relevanceTier);

  const systemPrompt = `${writingStyle}

${formalityGuidance}

You are drafting a reply to a ${channel} message.
Reply as the signed-in user. Ground the reply in the actual message content and the user's guidance.
Do not echo the original salutation unless it genuinely fits the reply.
Do not address copied recipients unless the reply truly needs them.
For appreciation or thank-you notes, keep the reply to 1-3 sentences.
Do not invent meetings, next steps, owners, or commitments unless the message or user guidance explicitly supports them.
${relationshipContext ? "Use the relationship context to inform tone and content — reference pending items or upcoming meetings when relevant to the reply. Never fabricate context." : ""}
Output only the reply body. No subject line. No explanation.`;

  try {
    const relationshipSection = relationshipContext
      ? `\nRelationship context:\n${relationshipContext}\n`
      : "";

    const result = streamText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            `Incoming ${channel} ${resolvedSubject ? `subject: ${resolvedSubject}` : "message"}`,
            `From: ${resolvedSender}`,
            relationshipSection,
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

    return result.toTextStreamResponse();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
