import type {
  AttentionFeedbackValue,
  AttentionProfile,
  AttentionTarget,
  FeedbackEventRecord,
  FocusPreferenceRecord,
  ItemFeedbackRecord,
  PriorityBiasRecord,
  UserSettingsRecord,
} from "@/lib/attention/types";
import {
  clampBias,
  createEmptyUserSettings,
  feedbackScore,
  mergeAttentionSettings,
  normalizeFeedbackValue,
  normalizeImportanceTier,
  normalizeUserSettings,
  sanitizeKeys,
} from "@/lib/attention/utils";
import { createServiceClient } from "@/lib/supabase/server";

const FEEDBACK_UPDATE_WEIGHTS = {
  resource: 0.35,
  actor: 0.2,
  topic: 0.12,
  provider: 0.08,
} as const;

const ATTENTION_SCHEMA_TABLE_NAMES = [
  "user_settings",
  "user_focus_preferences",
  "user_item_feedback",
  "user_feedback_events",
  "user_priority_biases",
] as const;

export const ATTENTION_SCHEMA_MISSING_MESSAGE =
  "Focus preferences are not set up in Supabase for this environment yet.";

export function isAttentionSchemaMissingError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return ATTENTION_SCHEMA_TABLE_NAMES.some((tableName) =>
    message.includes(tableName)
  );
}

function asRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeSettingsRow(
  value: unknown,
  cortexUserId: string
): UserSettingsRecord {
  const record = asRecord(value);
  return normalizeUserSettings(
    record
      ? {
          cortex_user_id: String(record.cortex_user_id ?? cortexUserId),
          preference_version: Number(record.preference_version ?? 1),
          onboarding: asRecord(record.onboarding) ?? {},
          dashboard: asRecord(record.dashboard) ?? {},
          advanced_ranking: asRecord(record.advanced_ranking) ?? {},
          created_at: typeof record.created_at === "string" ? record.created_at : undefined,
          updated_at: typeof record.updated_at === "string" ? record.updated_at : undefined,
        }
      : null,
    cortexUserId
  );
}

function normalizeFocusRow(value: unknown, cortexUserId: string): FocusPreferenceRecord | null {
  const record = asRecord(value);
  if (!record) return null;

  const provider = String(record.provider ?? "").trim();
  const entityType = String(record.entity_type ?? "").trim();
  const entityId = String(record.entity_id ?? "").trim();
  if (!provider || !entityType || !entityId) return null;

  return {
    id: typeof record.id === "string" ? record.id : undefined,
    cortex_user_id: String(record.cortex_user_id ?? cortexUserId),
    provider: provider as FocusPreferenceRecord["provider"],
    entity_type: entityType as FocusPreferenceRecord["entity_type"],
    entity_id: entityId,
    parent_entity_type:
      typeof record.parent_entity_type === "string"
        ? (record.parent_entity_type as FocusPreferenceRecord["parent_entity_type"])
        : null,
    parent_entity_id:
      typeof record.parent_entity_id === "string" ? record.parent_entity_id : null,
    label_snapshot:
      typeof record.label_snapshot === "string" ? record.label_snapshot : null,
    importance: normalizeImportanceTier(record.importance),
    selector: asRecord(record.selector) ?? {},
    metadata: asRecord(record.metadata) ?? {},
    created_at: typeof record.created_at === "string" ? record.created_at : undefined,
    updated_at: typeof record.updated_at === "string" ? record.updated_at : undefined,
  };
}

function normalizeFeedbackRow(value: unknown, cortexUserId: string): ItemFeedbackRecord | null {
  const record = asRecord(value);
  if (!record) return null;
  const itemType = String(record.item_type ?? "").trim();
  const itemId = String(record.item_id ?? "").trim();
  const provider = String(record.provider ?? "").trim();
  if (!itemType || !itemId || !provider) return null;

  return {
    id: typeof record.id === "string" ? record.id : undefined,
    cortex_user_id: String(record.cortex_user_id ?? cortexUserId),
    item_type: itemType,
    item_id: itemId,
    provider: provider as ItemFeedbackRecord["provider"],
    surface: String(record.surface ?? "unknown"),
    title: typeof record.title === "string" ? record.title : null,
    feedback: normalizeFeedbackValue(record.feedback),
    shown_score:
      typeof record.shown_score === "number" ? record.shown_score : null,
    resource_keys: sanitizeKeys(
      Array.isArray(record.resource_keys) ? (record.resource_keys as string[]) : []
    ),
    actor_keys: sanitizeKeys(
      Array.isArray(record.actor_keys) ? (record.actor_keys as string[]) : []
    ),
    topic_keys: sanitizeKeys(
      Array.isArray(record.topic_keys) ? (record.topic_keys as string[]) : []
    ),
    metadata: asRecord(record.metadata) ?? {},
    created_at: typeof record.created_at === "string" ? record.created_at : undefined,
    updated_at: typeof record.updated_at === "string" ? record.updated_at : undefined,
  };
}

function normalizeBiasRow(value: unknown, cortexUserId: string): PriorityBiasRecord | null {
  const record = asRecord(value);
  if (!record) return null;
  const dimensionType = String(record.dimension_type ?? "").trim();
  const dimensionKey = String(record.dimension_key ?? "").trim();
  if (!dimensionType || !dimensionKey) return null;

  return {
    id: typeof record.id === "string" ? record.id : undefined,
    cortex_user_id: String(record.cortex_user_id ?? cortexUserId),
    dimension_type: dimensionType as PriorityBiasRecord["dimension_type"],
    dimension_key: dimensionKey,
    bias_score:
      typeof record.bias_score === "number" ? record.bias_score : Number(record.bias_score ?? 0),
    sample_count:
      typeof record.sample_count === "number" ? record.sample_count : Number(record.sample_count ?? 0),
    positive_count:
      typeof record.positive_count === "number" ? record.positive_count : Number(record.positive_count ?? 0),
    negative_count:
      typeof record.negative_count === "number" ? record.negative_count : Number(record.negative_count ?? 0),
    last_feedback_at:
      typeof record.last_feedback_at === "string" ? record.last_feedback_at : null,
    created_at: typeof record.created_at === "string" ? record.created_at : undefined,
    updated_at: typeof record.updated_at === "string" ? record.updated_at : undefined,
  };
}

function feedbackStats(feedback: AttentionFeedbackValue | null | undefined) {
  if (!feedback) {
    return { sample: 0, positive: 0, negative: 0 };
  }

  if (feedback === "raise") {
    return { sample: 1, positive: 1, negative: 0 };
  }

  if (feedback === "lower") {
    return { sample: 1, positive: 0, negative: 1 };
  }

  return { sample: 1, positive: 0, negative: 0 };
}

function buildBiasDimensions(target: AttentionTarget) {
  return [
    ...sanitizeKeys(target.resourceKeys).map((key) => ({
      dimension_type: "resource" as const,
      dimension_key: key,
      weight: FEEDBACK_UPDATE_WEIGHTS.resource,
    })),
    ...sanitizeKeys(target.actorKeys).slice(0, 3).map((key) => ({
      dimension_type: "actor" as const,
      dimension_key: key,
      weight: FEEDBACK_UPDATE_WEIGHTS.actor,
    })),
    ...sanitizeKeys(target.topicKeys).slice(0, 4).map((key) => ({
      dimension_type: "topic" as const,
      dimension_key: key,
      weight: FEEDBACK_UPDATE_WEIGHTS.topic,
    })),
    {
      dimension_type: "provider" as const,
      dimension_key: `provider:${target.provider}`,
      weight: FEEDBACK_UPDATE_WEIGHTS.provider,
    },
  ];
}

export async function ensureUserSettings(cortexUserId: string) {
  const supabase = createServiceClient();
  const defaults = createEmptyUserSettings(cortexUserId);

  const { data, error } = await supabase
    .from("user_settings")
    .upsert(defaults, { onConflict: "cortex_user_id" })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return normalizeSettingsRow(data, cortexUserId);
}

export async function loadAttentionProfile(
  cortexUserId: string
): Promise<AttentionProfile> {
  const supabase = createServiceClient();
  const settings = await ensureUserSettings(cortexUserId);

  const [focusResult, feedbackResult, biasResult] = await Promise.all([
    supabase
      .from("user_focus_preferences")
      .select("*")
      .eq("cortex_user_id", cortexUserId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("user_item_feedback")
      .select("*")
      .eq("cortex_user_id", cortexUserId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("user_priority_biases")
      .select("*")
      .eq("cortex_user_id", cortexUserId)
      .order("bias_score", { ascending: false }),
  ]);

  if (focusResult.error) throw new Error(focusResult.error.message);
  if (feedbackResult.error) throw new Error(feedbackResult.error.message);
  if (biasResult.error) throw new Error(biasResult.error.message);

  return {
    settings,
    focusPreferences: (focusResult.data ?? [])
      .map((row) => normalizeFocusRow(row, cortexUserId))
      .filter((row): row is FocusPreferenceRecord => row !== null),
    feedback: (feedbackResult.data ?? [])
      .map((row) => normalizeFeedbackRow(row, cortexUserId))
      .filter((row): row is ItemFeedbackRecord => row !== null),
    biases: (biasResult.data ?? [])
      .map((row) => normalizeBiasRow(row, cortexUserId))
      .filter((row): row is PriorityBiasRecord => row !== null),
  };
}

export async function saveAttentionPreferences(args: {
  cortexUserId: string;
  settings?: Partial<UserSettingsRecord>;
  focusUpserts?: Array<
    Omit<FocusPreferenceRecord, "cortex_user_id"> & {
      cortex_user_id?: string;
    }
  >;
  focusDeletes?: Array<{
    provider: string;
    entity_type: string;
    entity_id: string;
  }>;
}) {
  const supabase = createServiceClient();
  const current = await ensureUserSettings(args.cortexUserId);

  if (args.settings) {
    const merged = mergeAttentionSettings(current, args.settings);
    const { error } = await supabase
      .from("user_settings")
      .upsert(merged, { onConflict: "cortex_user_id" });
    if (error) throw new Error(error.message);
  }

  if (args.focusUpserts && args.focusUpserts.length > 0) {
    const rows = args.focusUpserts.map((record) => ({
      cortex_user_id: args.cortexUserId,
      provider: record.provider,
      entity_type: record.entity_type,
      entity_id: record.entity_id,
      parent_entity_type: record.parent_entity_type ?? null,
      parent_entity_id: record.parent_entity_id ?? null,
      label_snapshot: record.label_snapshot ?? null,
      importance: normalizeImportanceTier(record.importance),
      selector: record.selector ?? {},
      metadata: record.metadata ?? {},
    }));

    const { error } = await supabase
      .from("user_focus_preferences")
      .upsert(rows, {
        onConflict: "cortex_user_id,provider,entity_type,entity_id",
      });

    if (error) throw new Error(error.message);
  }

  if (args.focusDeletes && args.focusDeletes.length > 0) {
    for (const record of args.focusDeletes) {
      const { error } = await supabase
        .from("user_focus_preferences")
        .delete()
        .eq("cortex_user_id", args.cortexUserId)
        .eq("provider", record.provider)
        .eq("entity_type", record.entity_type)
        .eq("entity_id", record.entity_id);

      if (error) throw new Error(error.message);
    }
  }

  return loadAttentionProfile(args.cortexUserId);
}

export async function applyAttentionFeedback(args: {
  cortexUserId: string;
  target: AttentionTarget;
  feedback: AttentionFeedbackValue;
  surface: string;
}) {
  const supabase = createServiceClient();
  const feedback = normalizeFeedbackValue(args.feedback);
  const target = {
    ...args.target,
    resourceKeys: sanitizeKeys(args.target.resourceKeys),
    actorKeys: sanitizeKeys(args.target.actorKeys),
    topicKeys: sanitizeKeys(args.target.topicKeys),
  };

  const { data: priorRow, error: priorError } = await supabase
    .from("user_item_feedback")
    .select("*")
    .eq("cortex_user_id", args.cortexUserId)
    .eq("item_type", target.itemType)
    .eq("item_id", target.itemId)
    .maybeSingle();

  if (priorError) throw new Error(priorError.message);

  const prior = normalizeFeedbackRow(priorRow, args.cortexUserId);
  const previousFeedback = prior?.feedback ?? null;
  const feedbackDelta =
    feedbackScore(feedback) -
    (previousFeedback ? feedbackScore(previousFeedback) : 0);
  const previousStats = feedbackStats(previousFeedback);
  const nextStats = feedbackStats(feedback);
  const now = new Date().toISOString();

  const row: ItemFeedbackRecord = {
    cortex_user_id: args.cortexUserId,
    item_type: target.itemType,
    item_id: target.itemId,
    provider: target.provider,
    surface: args.surface,
    title: target.title,
    feedback,
    shown_score: target.baseScore,
    resource_keys: target.resourceKeys,
    actor_keys: target.actorKeys,
    topic_keys: target.topicKeys,
    metadata: target.metadata ?? {},
  };

  const { error: upsertError } = await supabase
    .from("user_item_feedback")
    .upsert(row, { onConflict: "cortex_user_id,item_type,item_id" });

  if (upsertError) throw new Error(upsertError.message);

  const eventRow: FeedbackEventRecord = {
    cortex_user_id: args.cortexUserId,
    item_type: target.itemType,
    item_id: target.itemId,
    provider: target.provider,
    surface: args.surface,
    title: target.title,
    old_feedback: previousFeedback,
    new_feedback: feedback,
    shown_score: target.baseScore,
    resource_keys: target.resourceKeys,
    actor_keys: target.actorKeys,
    topic_keys: target.topicKeys,
    metadata: target.metadata ?? {},
  };

  const { error: eventError } = await supabase
    .from("user_feedback_events")
    .insert(eventRow);

  if (eventError) throw new Error(eventError.message);

  for (const dimension of buildBiasDimensions(target)) {
    const { data: existingRow, error: existingError } = await supabase
      .from("user_priority_biases")
      .select("*")
      .eq("cortex_user_id", args.cortexUserId)
      .eq("dimension_type", dimension.dimension_type)
      .eq("dimension_key", dimension.dimension_key)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);

    const existing = normalizeBiasRow(existingRow, args.cortexUserId) ?? {
      cortex_user_id: args.cortexUserId,
      dimension_type: dimension.dimension_type,
      dimension_key: dimension.dimension_key,
      bias_score: 0,
      sample_count: 0,
      positive_count: 0,
      negative_count: 0,
      last_feedback_at: null,
    };

    const nextBias = clampBias(
      existing.bias_score + feedbackDelta * dimension.weight
    );

    const { error: biasError } = await supabase
      .from("user_priority_biases")
      .upsert(
        {
          cortex_user_id: args.cortexUserId,
          dimension_type: dimension.dimension_type,
          dimension_key: dimension.dimension_key,
          bias_score: nextBias,
          sample_count:
            existing.sample_count + nextStats.sample - previousStats.sample,
          positive_count:
            existing.positive_count +
            nextStats.positive -
            previousStats.positive,
          negative_count:
            existing.negative_count +
            nextStats.negative -
            previousStats.negative,
          last_feedback_at: now,
        },
        { onConflict: "cortex_user_id,dimension_type,dimension_key" }
      );

    if (biasError) throw new Error(biasError.message);
  }

  return loadAttentionProfile(args.cortexUserId);
}
