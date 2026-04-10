// Types and prompt builder for AI-routed vault captures.

export type CaptureSourceType =
  | "email"
  | "teams"
  | "slack"
  | "calendar"
  | "asana";

export interface CaptureSourceMeta {
  from?: string;
  subject?: string;
  timestamp: string;
  channel?: string;
  url?: string;
}

export interface CaptureRequest {
  content: string;
  sourceType: CaptureSourceType;
  sourceMeta: CaptureSourceMeta;
}

// Re-exported here so capture-routing is self-contained for consumers
export interface VaultSearchResult {
  file_path: string;
  title: string;
  folder: string;
  tags: string[] | null;
  rank: number;
}

export interface RoutingPlan {
  action: "create" | "append";
  targetPath: string;
  targetTitle: string;
  formattedContent: string;
  detectedPeople: string[];
  detectedTopics: string[];
  reasoning: string;
  confidence: "high" | "medium" | "low";
}

const VAULT_FOLDERS = `
Vault folder taxonomy:
- company/people/           — one page per person
- company/initiatives/      — strategic initiatives
- company/intelligence/     — meeting intel, enrichment notes
- company/intelligence/captures/ — Command Center captures (new pages go here)
- company/projects/         — projects and Asana-sourced project pages
- company/decisions/        — key decisions with context
- company/objectives/       — corporate objectives
`;

const ROUTING_RULES = `
Routing rules:
1. If the content is primarily a signal about ONE person (their opinion, sentiment, personal update, or a direct quote from them), set action="append" and target their person page at company/people/<slug>.md (use the matching candidate if present).
2. If the content is primarily about a specific initiative or project mentioned in the candidates, set action="append" and target that page.
3. Otherwise, set action="create" with targetPath = company/intelligence/captures/YYYY-MM-DD-<kebab-slug-of-subject>.md
4. Extract all person names mentioned as detectedPeople.
5. Extract initiatives, projects, or topics as detectedTopics.
6. formattedContent must start with "## Captured YYYY-MM-DD from <sourceType>" then "**Source:** <subject> — <from>" then a blank line then the content (lightly cleaned, NOT summarized — preserve the original words).
7. If sourceUrl is present, add "**Link:** <url>" on its own line before the content.
`;

export function buildCapturePrompt(
  request: CaptureRequest,
  candidates: VaultSearchResult[]
): string {
  const candidateBlock =
    candidates.length === 0
      ? "No candidate pages found from vault search."
      : candidates
          .map(
            (c) =>
              `- ${c.title} [${c.folder}] at ${c.file_path}${
                c.tags?.length ? ` (tags: ${c.tags.join(", ")})` : ""
              }`
          )
          .join("\n");

  return `You are routing a captured piece of content into a personal knowledge graph (Obsidian-style vault).

SOURCE
Type: ${request.sourceType}
From: ${request.sourceMeta.from ?? "(unknown)"}
Subject: ${request.sourceMeta.subject ?? "(none)"}
Timestamp: ${request.sourceMeta.timestamp}
${request.sourceMeta.channel ? `Channel: ${request.sourceMeta.channel}\n` : ""}${request.sourceMeta.url ? `URL: ${request.sourceMeta.url}\n` : ""}
CONTENT
${request.content}

CANDIDATE VAULT PAGES (from keyword search)
${candidateBlock}

${VAULT_FOLDERS}
${ROUTING_RULES}

Return a JSON object matching this exact schema (no markdown, no code fences):
{
  "action": "create" | "append",
  "targetPath": "string",
  "targetTitle": "string",
  "formattedContent": "string",
  "detectedPeople": ["string"],
  "detectedTopics": ["string"],
  "reasoning": "string (1-2 sentences)",
  "confidence": "high" | "medium" | "low"
}`;
}
