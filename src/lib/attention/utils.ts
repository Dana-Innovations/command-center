import type {
  AttentionFeedbackValue,
  AttentionItem,
  AttentionProvider,
  AttentionTarget,
  FocusPreferenceRecord,
  ImportanceTier,
  PriorityBiasRecord,
  UserSettingsRecord,
} from "@/lib/attention/types";
import {
  getAttentionPersonScoreBoost,
  resolveAttentionPersonPreferenceForTarget,
} from "@/lib/attention/people";

const TOPIC_STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "against",
  "agenda",
  "an",
  "and",
  "any",
  "are",
  "aris",
  "but",
  "can",
  "for",
  "from",
  "have",
  "into",
  "meeting",
  "new",
  "not",
  "our",
  "should",
  "that",
  "the",
  "their",
  "this",
  "with",
  "your",
]);

const IMPORTANCE_BOOSTS: Record<ImportanceTier, number> = {
  critical: 18,
  normal: 0,
  quiet: -10,
  muted: -100,
};

const FEEDBACK_SCORES: Record<AttentionFeedbackValue, number> = {
  raise: 1,
  right: 0.2,
  lower: -1,
};

const DIMENSION_MULTIPLIERS = {
  resource: 1,
  actor: 0.65,
  topic: 0.35,
  provider: 0.25,
} as const;

const MAX_FINAL_BIAS = 8;
const MAX_STORED_BIAS = 4;

const MUTED_MAIL_FOLDERS = new Set([
  "clutter",
  "deleted items",
  "deleteditems",
  "junk",
  "junk email",
  "junkemail",
  "spam",
  "trash",
]);

const QUIET_MAIL_FOLDERS = new Set([
  "archive",
  "conversation history",
  "conversationhistory",
  "draft",
  "drafts",
  "outbox",
  "rss subscriptions",
  "rsssubscriptions",
  "sent",
  "sent items",
  "sentitems",
]);

export function createEmptyUserSettings(
  cortexUserId: string
): UserSettingsRecord {
  return {
    cortex_user_id: cortexUserId,
    preference_version: 1,
    onboarding: {},
    dashboard: {},
    advanced_ranking: {},
  };
}

export function normalizeUserSettings(
  value: Partial<UserSettingsRecord> | null | undefined,
  cortexUserId: string
): UserSettingsRecord {
  const defaults = createEmptyUserSettings(cortexUserId);
  if (!value) return defaults;

  return {
    cortex_user_id: value.cortex_user_id || cortexUserId,
    preference_version:
      typeof value.preference_version === "number"
        ? value.preference_version
        : defaults.preference_version,
    onboarding:
      value.onboarding && typeof value.onboarding === "object"
        ? value.onboarding
        : defaults.onboarding,
    dashboard:
      value.dashboard && typeof value.dashboard === "object"
        ? value.dashboard
        : defaults.dashboard,
    advanced_ranking:
      value.advanced_ranking && typeof value.advanced_ranking === "object"
        ? value.advanced_ranking
        : defaults.advanced_ranking,
    created_at: value.created_at,
    updated_at: value.updated_at,
  };
}

export function buildFocusPreferenceKey(
  provider: AttentionProvider,
  entityType: string,
  entityId: string
) {
  return `${provider}::${entityType}::${entityId}`;
}

export function buildProviderFocusKey(provider: AttentionProvider) {
  return buildFocusPreferenceKey(provider, "provider", provider);
}

export function sanitizeKeys(values: string[] | null | undefined) {
  return Array.from(
    new Set(
      (values ?? [])
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

export function normalizeFeedbackValue(value: unknown): AttentionFeedbackValue {
  return value === "raise" || value === "right" || value === "lower"
    ? value
    : "right";
}

export function normalizeImportanceTier(value: unknown): ImportanceTier {
  return value === "critical" ||
    value === "normal" ||
    value === "quiet" ||
    value === "muted"
    ? value
    : "normal";
}

function normalizeFocusLabel(value: string | null | undefined) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/^[^a-z0-9]+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function inferMailFolderImportance(
  folderName: string | null | undefined
): ImportanceTier | null {
  const normalized = normalizeFocusLabel(folderName);
  if (!normalized) return null;
  if (MUTED_MAIL_FOLDERS.has(normalized)) return "muted";
  if (QUIET_MAIL_FOLDERS.has(normalized)) return "quiet";
  return null;
}

export function inferFocusNodeImportance(args: {
  provider: AttentionProvider;
  entityType: string;
  label?: string | null;
  metadata?: Record<string, unknown> | null;
}): ImportanceTier | null {
  if (args.provider === "outlook_mail" && args.entityType === "mail_folder") {
    return inferMailFolderImportance(
      args.label ??
        (typeof args.metadata?.displayName === "string"
          ? args.metadata.displayName
          : null)
    );
  }

  if (
    args.provider === "asana" &&
    args.entityType === "asana_project" &&
    args.metadata?.archived === true
  ) {
    return "quiet";
  }

  return null;
}

export function buildFocusLookup(records: FocusPreferenceRecord[]) {
  return new Map(
    records.map((record) => [
      buildFocusPreferenceKey(
        record.provider,
        record.entity_type,
        record.entity_id
      ),
      record,
    ])
  );
}

export function buildBiasLookup(records: PriorityBiasRecord[]) {
  return new Map(
    records.map((record) => [
      `${record.dimension_type}::${record.dimension_key}`,
      record,
    ])
  );
}

export function extractTopicKeys(...values: Array<string | null | undefined>) {
  const tokens = values
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !TOPIC_STOP_WORDS.has(token));

  return Array.from(new Set(tokens)).slice(0, 6).map((token) => `topic:${token}`);
}

export function extractActorKey(
  type: "sender" | "organizer" | "assignee" | "author" | "commenter",
  value: string | null | undefined
) {
  const normalized = (value || "").trim().toLowerCase();
  if (!normalized) return null;
  return `actor:${type}:${normalized}`;
}

export function clampBias(value: number) {
  return Math.max(-MAX_STORED_BIAS, Math.min(MAX_STORED_BIAS, value));
}

export function clampFinalBias(value: number) {
  return Math.max(-MAX_FINAL_BIAS, Math.min(MAX_FINAL_BIAS, value));
}

export function feedbackScore(value: AttentionFeedbackValue) {
  return FEEDBACK_SCORES[value];
}

export function resolveExplicitImportance(
  target: AttentionTarget,
  records: FocusPreferenceRecord[]
) {
  const lookup = buildFocusLookup(records);
  const orderedKeys = [
    ...sanitizeKeys(target.resourceKeys),
    buildProviderFocusKey(target.provider),
  ];

  for (const key of orderedKeys) {
    const record = lookup.get(key);
    if (record) {
      return record.importance;
    }
  }

  if (target.provider === "outlook_mail") {
    const folderName =
      typeof target.metadata?.folder === "string"
        ? target.metadata.folder
        : typeof target.metadata?.displayName === "string"
          ? target.metadata.displayName
          : null;
    const inferred = inferMailFolderImportance(folderName);
    if (inferred) {
      return inferred;
    }
  }

  return "normal" as ImportanceTier;
}

export function computeLearnedBias(
  target: AttentionTarget,
  records: PriorityBiasRecord[]
) {
  const lookup = buildBiasLookup(records);
  let total = 0;

  for (const key of sanitizeKeys(target.resourceKeys)) {
    const record = lookup.get(`resource::${key}`);
    if (record) total += record.bias_score * DIMENSION_MULTIPLIERS.resource;
  }

  for (const key of sanitizeKeys(target.actorKeys).slice(0, 3)) {
    const record = lookup.get(`actor::${key}`);
    if (record) total += record.bias_score * DIMENSION_MULTIPLIERS.actor;
  }

  for (const key of sanitizeKeys(target.topicKeys).slice(0, 4)) {
    const record = lookup.get(`topic::${key}`);
    if (record) total += record.bias_score * DIMENSION_MULTIPLIERS.topic;
  }

  const providerRecord = lookup.get(`provider::provider:${target.provider}`);
  if (providerRecord) {
    total += providerRecord.bias_score * DIMENSION_MULTIPLIERS.provider;
  }

  return clampFinalBias(Math.round(total * 10) / 10);
}

export function applyAttentionProfile(
  target: AttentionTarget,
  focusPreferences: FocusPreferenceRecord[],
  biases: PriorityBiasRecord[],
  settings?: UserSettingsRecord | null
): AttentionItem {
  const explicitImportance = resolveExplicitImportance(target, focusPreferences);
  const learnedBias = computeLearnedBias(target, biases);
  const personPreference = resolveAttentionPersonPreferenceForTarget(
    settings,
    target
  );
  const personBoost = getAttentionPersonScoreBoost(personPreference);
  const importanceBoost = IMPORTANCE_BOOSTS[explicitImportance];
  const hidden = explicitImportance === "muted";
  const finalScore = hidden
    ? 0
    : Math.max(
        0,
        Math.min(
          100,
          Math.round(
            target.baseScore + importanceBoost + learnedBias + personBoost
          )
        )
      );

  const explanation: string[] = [];
  if (explicitImportance !== "normal") {
    explanation.push(
      explicitImportance === "critical"
        ? "Critical focus"
        : explicitImportance === "quiet"
          ? "Quiet focus"
          : "Muted focus"
    );
  }
  if (personPreference?.important) {
    explanation.push("Important person");
  }
  if (personPreference?.pinned) {
    explanation.push("Pinned person");
  }
  if (learnedBias > 0.4) {
    explanation.push(`Learned boost +${learnedBias}`);
  } else if (learnedBias < -0.4) {
    explanation.push(`Learned reduction ${learnedBias}`);
  }

  return {
    ...target,
    explicitImportance,
    learnedBias,
    finalScore,
    explanation,
    hidden,
  };
}

export function mergeAttentionSettings(
  current: UserSettingsRecord,
  updates: Partial<UserSettingsRecord>
) {
  return {
    ...current,
    onboarding: {
      ...current.onboarding,
      ...(updates.onboarding ?? {}),
    },
    dashboard: {
      ...current.dashboard,
      ...(updates.dashboard ?? {}),
    },
    advanced_ranking: {
      ...current.advanced_ranking,
      ...(updates.advanced_ranking ?? {}),
    },
    preference_version:
      typeof updates.preference_version === "number"
        ? updates.preference_version
        : current.preference_version,
  };
}
