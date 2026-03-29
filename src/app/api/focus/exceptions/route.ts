import { NextRequest, NextResponse } from "next/server";
import { getCortexUserFromRequest } from "@/lib/cortex/user";
import { createServiceClient } from "@/lib/supabase/server";
import type { FocusExceptionRule } from "@/lib/attention/types";

/**
 * GET /api/focus/exceptions — list user's exception rules
 */
export async function GET(request: NextRequest) {
  const user = await getCortexUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("user_focus_exception_rules")
    .select("*")
    .eq("cortex_user_id", user.sub)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rules: data as FocusExceptionRule[] });
}

/**
 * POST /api/focus/exceptions — create exception rules (batch)
 */
export async function POST(request: NextRequest) {
  const user = await getCortexUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { rules } = (await request.json()) as {
    rules: Array<Omit<FocusExceptionRule, "id" | "cortex_user_id" | "created_at" | "updated_at">>;
  };

  if (!rules || !Array.isArray(rules) || rules.length === 0) {
    return NextResponse.json({ error: "rules array is required" }, { status: 400 });
  }

  const rows = rules.map((rule) => ({
    cortex_user_id: user.sub,
    provider: rule.provider ?? null,
    entity_id: rule.entity_id ?? null,
    entity_name: rule.entity_name ?? null,
    condition_type: rule.condition_type,
    condition_value: rule.condition_value,
    override_tier: rule.override_tier,
    raw_text: rule.raw_text ?? null,
  }));

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("user_focus_exception_rules")
    .insert(rows)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rules: data });
}

/**
 * DELETE /api/focus/exceptions — delete a rule by id
 */
export async function DELETE(request: NextRequest) {
  const user = await getCortexUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = (await request.json()) as { id: string };
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("user_focus_exception_rules")
    .delete()
    .eq("id", id)
    .eq("cortex_user_id", user.sub);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
