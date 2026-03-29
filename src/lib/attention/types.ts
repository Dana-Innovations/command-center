export const ATTENTION_PROVIDERS = [
  "outlook_mail",
  "outlook_calendar",
  "asana",
  "teams",
  "slack",
] as const;

export type AttentionProvider = (typeof ATTENTION_PROVIDERS)[number];

export const IMPORTANCE_TIERS = [
  "critical",
  "normal",
  "quiet",
  "muted",
] as const;

export type ImportanceTier = (typeof IMPORTANCE_TIERS)[number];

export const ATTENTION_FEEDBACK_VALUES = [
  "raise",
  "right",
  "lower",
] as const;

export type AttentionFeedbackValue =
  (typeof ATTENTION_FEEDBACK_VALUES)[number];

export const ATTENTION_DIMENSION_TYPES = [
  "resource",
  "actor",
  "topic",
  "provider",
] as const;

export type AttentionDimensionType =
  (typeof ATTENTION_DIMENSION_TYPES)[number];

export type FocusEntityType =
  | "provider"
  | "mail_root"
  | "mail_folder"
  | "calendar_root"
  | "calendar"
  | "asana_project"
  | "teams_team"
  | "teams_channel"
  | "slack_channel";

export interface UserSettingsRecord {
  cortex_user_id: string;
  preference_version: number;
  onboarding: Record<string, unknown>;
  dashboard: Record<string, unknown>;
  advanced_ranking: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface FocusPreferenceRecord {
  id?: string;
  cortex_user_id: string;
  provider: AttentionProvider;
  entity_type: FocusEntityType;
  entity_id: string;
  parent_entity_type?: FocusEntityType | null;
  parent_entity_id?: string | null;
  label_snapshot?: string | null;
  importance: ImportanceTier;
  selector?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface ItemFeedbackRecord {
  id?: string;
  cortex_user_id: string;
  item_type: string;
  item_id: string;
  provider: AttentionProvider;
  surface: string;
  title?: string | null;
  feedback: AttentionFeedbackValue;
  shown_score?: number | null;
  resource_keys: string[];
  actor_keys: string[];
  topic_keys: string[];
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface FeedbackEventRecord {
  id?: string;
  cortex_user_id: string;
  item_type: string;
  item_id: string;
  provider: AttentionProvider;
  surface: string;
  title?: string | null;
  old_feedback?: AttentionFeedbackValue | null;
  new_feedback: AttentionFeedbackValue;
  shown_score?: number | null;
  resource_keys: string[];
  actor_keys: string[];
  topic_keys: string[];
  metadata?: Record<string, unknown>;
  created_at?: string;
}

export interface PriorityBiasRecord {
  id?: string;
  cortex_user_id: string;
  dimension_type: AttentionDimensionType;
  dimension_key: string;
  bias_score: number;
  sample_count: number;
  positive_count: number;
  negative_count: number;
  last_feedback_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AttentionTarget {
  provider: AttentionProvider;
  itemType: string;
  itemId: string;
  title: string;
  timestamp: string;
  baseScore: number;
  surface?: string;
  resourceKeys: string[];
  actorKeys: string[];
  topicKeys: string[];
  metadata?: Record<string, unknown>;
}

export interface AttentionItem extends AttentionTarget {
  explicitImportance: ImportanceTier;
  learnedBias: number;
  finalScore: number;
  explanation: string[];
  hidden: boolean;
}

export interface FocusNode {
  id: string;
  provider: AttentionProvider;
  entityType: FocusEntityType;
  entityId: string;
  parentId?: string | null;
  label: string;
  description?: string;
  importance: ImportanceTier;
  inheritedImportance: ImportanceTier;
  connected: boolean;
  lazy?: boolean;
  counts?: {
    total?: number;
    unread?: number;
    children?: number;
  };
  metadata?: Record<string, unknown>;
  children?: FocusNode[];
}

export interface FocusMapWarning {
  provider?: AttentionProvider;
  code:
    | "profile_unavailable"
    | "session_unavailable"
    | "inventory_failed"
    | "team_channels_failed";
  message: string;
  detail?: string;
  scope?: string;
}

export interface FocusMapResponse {
  providers: FocusNode[];
  warnings?: FocusMapWarning[];
  error?: string | null;
  fetchedAt: string;
}

export interface AttentionProfile {
  settings: UserSettingsRecord;
  focusPreferences: FocusPreferenceRecord[];
  feedback: ItemFeedbackRecord[];
  biases: PriorityBiasRecord[];
}

/* ── Exception Rules ── */

export interface FocusExceptionRule {
  id: string;
  cortex_user_id: string;
  provider: string | null;
  entity_id: string | null;
  entity_name: string | null;
  condition_type: "topic" | "sender" | "keyword" | "label" | "mention";
  condition_value: string;
  override_tier: ImportanceTier;
  raw_text: string | null;
  created_at: string;
  updated_at: string;
}
