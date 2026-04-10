import { NextRequest, NextResponse } from "next/server";
import { getCortexUserFromRequest } from "@/lib/cortex/user";
import { createServiceClient } from "@/lib/supabase/server";
import {
  hasVaultAccess,
  createVaultPage,
  appendToVaultPage,
  checkVaultPageExists,
} from "@/lib/vault-client";

interface WriteRequest {
  action: "create" | "append";
  targetPath: string;
  targetTitle: string;
  formattedContent: string;
  detectedPeople: string[];
  detectedTopics: string[];
  sourceType?: string;
  sourceUrl?: string;
}

const CAPTURE_ROOT = "company/intelligence/captures/";

function toKebabSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function computeContentHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(request: NextRequest) {
  const user = await getCortexUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!hasVaultAccess(user.email ?? "")) {
    return NextResponse.json({ error: "Vault access denied" }, { status: 403 });
  }

  let body: WriteRequest;
  try {
    body = (await request.json()) as WriteRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.action || !body.targetPath || !body.formattedContent) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  // For create actions, enforce that the path is inside the captures folder
  if (body.action === "create" && !body.targetPath.startsWith(CAPTURE_ROOT)) {
    return NextResponse.json(
      { error: `Create action must target ${CAPTURE_ROOT}` },
      { status: 400 }
    );
  }

  try {
    let writeResult;
    if (body.action === "create") {
      const folder = body.targetPath.substring(
        0,
        body.targetPath.lastIndexOf("/")
      );
      writeResult = await createVaultPage({
        file_path: body.targetPath,
        title: body.targetTitle,
        content: body.formattedContent,
        frontmatter: {
          date: new Date().toISOString(),
          type: "capture",
          title: body.targetTitle,
          source: "cortex-capture",
          sourceUrl: body.sourceUrl ?? null,
          detectedPeople: body.detectedPeople,
          detectedTopics: body.detectedTopics,
        },
        tags: ["capture", ...body.detectedTopics.map(toKebabSlug)],
        wikilinks: body.detectedPeople.map(toKebabSlug),
        folder,
      });
    } else {
      const exists = await checkVaultPageExists(body.targetPath);
      if (!exists) {
        return NextResponse.json(
          {
            error: `Page not found: ${body.targetPath}. Use action="create" instead.`,
          },
          { status: 404 }
        );
      }
      writeResult = await appendToVaultPage(
        body.targetPath,
        body.formattedContent,
        body.detectedPeople.map(toKebabSlug)
      );
    }

    if (!writeResult.ok) {
      return NextResponse.json({ error: writeResult.error }, { status: 500 });
    }

    // Insert audit log row (main app DB, not vault-graph)
    try {
      const supabase = createServiceClient();
      const contentHash = await computeContentHash(body.formattedContent);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("vault_write_log").insert({
        cortex_user_id: user.sub,
        action: body.action,
        target_path: body.targetPath,
        content_hash: contentHash,
        source_type: body.sourceType ?? null,
        source_url: body.sourceUrl ?? null,
      });
    } catch (e) {
      console.warn("[vault-write] audit log insert failed:", e);
    }

    return NextResponse.json({ ok: true, filePath: writeResult.filePath });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[vault-write] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
