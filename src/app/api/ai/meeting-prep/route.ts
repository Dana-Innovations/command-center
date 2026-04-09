import { NextRequest, NextResponse } from "next/server";
import { generateText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { getCortexUserFromRequest } from "@/lib/cortex/user";
import { createServiceClient } from "@/lib/supabase/server";
import {
  buildBatchDossiers,
  serializeDossierForPrompt,
} from "@/lib/relationship-dossier";
import { hasVaultAccess, getVaultContext } from "@/lib/vault-client";

interface MeetingPrepRequest {
  subject: string;
  organizer: string;
  location: string;
  startTime: string;
  endTime: string;
  attendees?: string[];
  existingContext: {
    attendeeNames: string[];
    emailSubjects: string[];
    relatedOpps: Array<{
      name: string;
      account: string;
      amount: number;
      stage: string;
    }>;
    relatedTaskNames: string[];
  };
}

interface AIMeetingPrep {
  summary: string;
  attendeeInsights: Array<{
    name: string;
    role?: string;
    company?: string;
    insight: string;
  }>;
  companyInsights: Array<{
    company: string;
    insight: string;
  }>;
  talkingPoints: string[];
  risks: string[];
}

export async function POST(request: NextRequest) {
  let body: MeetingPrepRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { subject, organizer, location, startTime, endTime, existingContext } =
    body;

  if (!subject) {
    return NextResponse.json(
      { error: "Missing required field: subject" },
      { status: 400 }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  // Build context summary from existing Cortex data
  const contextLines: string[] = [];
  const attendeeNames = body.attendees?.length
    ? body.attendees
    : existingContext?.attendeeNames ?? [];

  if (attendeeNames.length) {
    contextLines.push(`Known attendees: ${attendeeNames.join(", ")}`);
  }
  if (existingContext?.emailSubjects?.length) {
    contextLines.push(
      `Recent email threads with attendees: ${existingContext.emailSubjects.join("; ")}`
    );
  }
  if (existingContext?.relatedOpps?.length) {
    const oppSummaries = existingContext.relatedOpps.map(
      (o) => `${o.name} (${o.account}, $${o.amount?.toLocaleString()}, ${o.stage})`
    );
    contextLines.push(
      `Related Salesforce opportunities: ${oppSummaries.join("; ")}`
    );
  }
  if (existingContext?.relatedTaskNames?.length) {
    contextLines.push(
      `Related open tasks: ${existingContext.relatedTaskNames.join("; ")}`
    );
  }

  // Enrich with relationship dossiers from Supabase
  let relationshipSection = "";
  const user = await getCortexUserFromRequest(request);
  if (user && attendeeNames.length > 0) {
    try {
      const supabase = createServiceClient();
      const dossiers = await buildBatchDossiers(
        supabase,
        user.sub,
        attendeeNames
      );
      if (dossiers.length > 0) {
        relationshipSection =
          "\n\nInternal Relationship Intelligence (from CRM and interaction history):\n" +
          dossiers.map(serializeDossierForPrompt).join("\n\n");
      }
    } catch (e) {
      console.warn("[meeting-prep] dossier enrichment failed:", e);
    }
  }

  // Enrich with Vault Graph organizational context
  let vaultSection = "";
  if (user && hasVaultAccess(user.email ?? "")) {
    try {
      const vaultContext = await getVaultContext(
        attendeeNames,
        subject ? [subject] : undefined
      );
      if (vaultContext) {
        vaultSection = "\n\n" + vaultContext;
      }
    } catch (e) {
      console.warn("[meeting-prep] vault enrichment failed:", e);
    }
  }

  const prompt = `You are an executive meeting prep researcher. Research and prepare a briefing for this meeting.

Meeting: ${subject}
When: ${startTime} – ${endTime}
Organizer: ${organizer || "Unknown"}
Location: ${location || "Not specified"}

${contextLines.length > 0 ? `Internal context from CRM and email:\n${contextLines.join("\n")}` : "No internal context available."}${relationshipSection}${vaultSection}

Instructions:
1. Prioritize internal relationship data — the relationship intelligence above shows the user's actual history with each attendee. Use it to generate highly specific, personalized talking points.
2. If Organizational Knowledge is provided, use it to understand each attendee's role, department, and connections within the organization. Reference specific initiatives, decisions, or intelligence when generating talking points.
3. Search the web for each attendee and their company to find their current role, recent news, and relevant background.
4. Search for any companies mentioned in the meeting subject or attendee affiliations for recent developments.
5. Based on ALL gathered context (internal relationship data + CRM data + web research), generate:
   - A 2-3 sentence executive summary of what this meeting is likely about and how to approach it
   - Insights for each attendee (current role, company, relevant background)
   - Insights for each company involved (recent news, developments, market position)
   - 3-5 specific, actionable talking points
   - Any risks or sensitive topics to be aware of

Return your response as JSON matching this exact schema (no markdown, no code fences, just JSON):
{
  "summary": "string",
  "attendeeInsights": [{ "name": "string", "role": "string", "company": "string", "insight": "string" }],
  "companyInsights": [{ "company": "string", "insight": "string" }],
  "talkingPoints": ["string"],
  "risks": ["string"]
}`;

  try {
    const result = await generateText({
      model: anthropic("claude-sonnet-4-20250514"),
      tools: {
        web_search: anthropic.tools.webSearch_20250305(),
      },
      system:
        "You are an executive meeting prep researcher. Prioritize internal relationship intelligence (interaction history, deals, delegated tasks) over web research — this shows the user's actual history with each attendee. Supplement with web search for external news, roles, and company context. Always return valid JSON.",
      prompt,
      stopWhen: stepCountIs(8),
      maxOutputTokens: 3000,
    });

    const text = result.text.trim();
    if (!text) {
      return NextResponse.json(
        { error: "Empty response from AI" },
        { status: 502 }
      );
    }

    // Extract JSON — handle potential markdown code fences
    let jsonStr = text;
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    let parsed: AIMeetingPrep;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      // Try to find JSON object in the response
      const objMatch = text.match(/\{[\s\S]*\}/);
      if (objMatch) {
        parsed = JSON.parse(objMatch[0]);
      } else {
        return NextResponse.json(
          {
            summary: text.slice(0, 500),
            attendeeInsights: [],
            companyInsights: [],
            talkingPoints: [],
            risks: [],
          },
          { status: 200 }
        );
      }
    }

    return NextResponse.json({
      summary: parsed.summary || "",
      attendeeInsights: parsed.attendeeInsights || [],
      companyInsights: parsed.companyInsights || [],
      talkingPoints: parsed.talkingPoints || [],
      risks: parsed.risks || [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("AI meeting prep error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
