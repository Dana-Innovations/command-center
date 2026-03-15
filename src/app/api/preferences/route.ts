import { NextRequest, NextResponse } from "next/server";
import { loadAttentionProfile, saveAttentionPreferences } from "@/lib/attention/server";
import { getCortexUserFromRequest } from "@/lib/cortex/user";

export async function GET(request: NextRequest) {
  const user = await getCortexUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const profile = await loadAttentionProfile(user.sub);
    return NextResponse.json(profile);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load preferences" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const user = await getCortexUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      settings?: Record<string, unknown>;
      focusUpserts?: Array<Record<string, unknown>>;
      focusDeletes?: Array<Record<string, unknown>>;
    };

    const profile = await saveAttentionPreferences({
      cortexUserId: user.sub,
      settings: body.settings,
      focusUpserts: (body.focusUpserts ?? []) as never,
      focusDeletes: (body.focusDeletes ?? []) as never,
    });

    return NextResponse.json(profile);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save preferences" },
      { status: 500 }
    );
  }
}
