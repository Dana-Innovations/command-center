import type { AttentionTarget, UserSettingsRecord } from "@/lib/attention/types";

export type AttentionPersonPreferenceSource =
  | "manual"
  | "suggested"
  | "seeded"
  | "inferred";

export interface AttentionPersonPreference {
  id: string;
  name: string;
  email?: string | null;
  aliases: string[];
  pinned: boolean;
  important: boolean;
  source: AttentionPersonPreferenceSource;
  created_at?: string;
}

const PEOPLE_FOCUS_KEY = "people_focus";

function asRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export function normalizePersonLabel(value: string | null | undefined) {
  return (value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizePersonEmail(value: string | null | undefined) {
  const match = (value ?? "")
    .trim()
    .match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);

  return match ? match[0].toLowerCase() : "";
}

function normalizePersonIdentifier(value: string | null | undefined) {
  return normalizePersonLabel(value).toLowerCase();
}

function dedupe(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => normalizePersonLabel(value))
        .filter(Boolean)
    )
  );
}

function parseActorKeyValue(value: string) {
  return value
    .split(":")
    .slice(2)
    .join(":")
    .trim();
}

function identifiersMatch(a: string, b: string) {
  if (!a || !b) return false;
  if (a === b) return true;

  const aEmail = a.includes("@");
  const bEmail = b.includes("@");
  if (aEmail || bEmail) {
    return false;
  }

  const shorter = a.length <= b.length ? a : b;
  const longer = shorter === a ? b : a;
  return shorter.length >= 6 && longer.includes(shorter);
}

function buildPreferenceIdentifiers(preference: AttentionPersonPreference) {
  const identifiers = new Set<string>();
  const email = normalizePersonEmail(preference.email);
  if (email) identifiers.add(email);

  [preference.name, ...preference.aliases].forEach((value) => {
    const normalized = normalizePersonIdentifier(value);
    if (normalized) identifiers.add(normalized);
  });

  return Array.from(identifiers);
}

function buildSubjectIdentifiers(args: {
  name?: string | null;
  email?: string | null;
  aliases?: string[] | null;
  actorKeys?: string[] | null;
}) {
  const identifiers = new Set<string>();
  const email = normalizePersonEmail(args.email);
  if (email) identifiers.add(email);

  [args.name, ...(args.aliases ?? [])].forEach((value) => {
    const normalized = normalizePersonIdentifier(value);
    if (normalized) identifiers.add(normalized);
  });

  (args.actorKeys ?? []).forEach((actorKey) => {
    const actorValue = parseActorKeyValue(actorKey);
    const actorEmail = normalizePersonEmail(actorValue);
    const actorLabel = normalizePersonIdentifier(actorValue);
    if (actorEmail) identifiers.add(actorEmail);
    if (actorLabel) identifiers.add(actorLabel);
  });

  return Array.from(identifiers);
}

function isValidSource(
  value: unknown
): value is AttentionPersonPreferenceSource {
  return (
    value === "manual" ||
    value === "suggested" ||
    value === "seeded" ||
    value === "inferred"
  );
}

export function buildAttentionPersonPreferenceId(args: {
  name?: string | null;
  email?: string | null;
}) {
  const email = normalizePersonEmail(args.email);
  if (email) return `email:${email}`;

  const name = normalizePersonIdentifier(args.name);
  return name ? `name:${name}` : "";
}

export function normalizeAttentionPersonPreference(
  value: unknown
): AttentionPersonPreference | null {
  const record = asRecord(value);
  if (!record) return null;

  const name = normalizePersonLabel(
    typeof record.name === "string" ? record.name : null
  );
  const email = normalizePersonEmail(
    typeof record.email === "string" ? record.email : null
  );
  const aliases = dedupe(
    Array.isArray(record.aliases) ? (record.aliases as string[]) : []
  );
  const pinned = record.pinned === true;
  const important = record.important === true;

  if (!name && !email) return null;
  if (!pinned && !important) return null;

  const id =
    typeof record.id === "string" && record.id.trim()
      ? record.id.trim()
      : buildAttentionPersonPreferenceId({ name, email });
  if (!id) return null;

  return {
    id,
    name: name || email,
    email: email || null,
    aliases,
    pinned,
    important,
    source: isValidSource(record.source) ? record.source : "manual",
    created_at:
      typeof record.created_at === "string" ? record.created_at : undefined,
  };
}

export function sortAttentionPersonPreferences(
  preferences: AttentionPersonPreference[]
) {
  return [...preferences].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.important !== b.important) return a.important ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function getAttentionPersonPreferences(
  settings: UserSettingsRecord | null | undefined
) {
  const dashboard = asRecord(settings?.dashboard);
  const peopleFocus = dashboard ? asRecord(dashboard[PEOPLE_FOCUS_KEY]) : null;
  const rawProfiles = Array.isArray(peopleFocus?.profiles)
    ? peopleFocus?.profiles
    : [];

  return sortAttentionPersonPreferences(
    rawProfiles
      .map((profile) => normalizeAttentionPersonPreference(profile))
      .filter((profile): profile is AttentionPersonPreference => profile !== null)
  );
}

export function buildAttentionPeopleDashboardValue(
  preferences: AttentionPersonPreference[]
) {
  return {
    [PEOPLE_FOCUS_KEY]: {
      profiles: sortAttentionPersonPreferences(preferences),
    },
  };
}

export function getAttentionPersonRankingWeight(
  preference: AttentionPersonPreference | null | undefined
) {
  if (!preference) return 0;
  return (preference.pinned ? 2 : 0) + (preference.important ? 1 : 0);
}

export function getAttentionPersonScoreBoost(
  preference: AttentionPersonPreference | null | undefined
) {
  if (!preference) return 0;

  let total = 0;
  if (preference.important) total += 14;
  if (preference.pinned) total += 8;
  return total;
}

export function matchAttentionPersonPreference(
  preferences: AttentionPersonPreference[],
  args: {
    name?: string | null;
    email?: string | null;
    aliases?: string[] | null;
    actorKeys?: string[] | null;
  }
) {
  const identifiers = buildSubjectIdentifiers(args);
  if (identifiers.length === 0) return null;

  for (const preference of preferences) {
    const preferenceIdentifiers = buildPreferenceIdentifiers(preference);
    if (
      preferenceIdentifiers.some((candidate) =>
        identifiers.some((identifier) => identifiersMatch(candidate, identifier))
      )
    ) {
      return preference;
    }
  }

  return null;
}

export function upsertAttentionPersonPreference(
  current: AttentionPersonPreference[],
  next: AttentionPersonPreference
) {
  const normalized = normalizeAttentionPersonPreference(next);
  if (!normalized) return sortAttentionPersonPreferences(current);

  const retained = current.filter(
    (preference) =>
      !matchAttentionPersonPreference([preference], {
        name: normalized.name,
        email: normalized.email,
        aliases: normalized.aliases,
      })
  );

  return sortAttentionPersonPreferences([...retained, normalized]);
}

export function removeAttentionPersonPreference(
  current: AttentionPersonPreference[],
  preferenceId: string
) {
  return sortAttentionPersonPreferences(
    current.filter((preference) => preference.id !== preferenceId)
  );
}

export function resolveAttentionPersonPreferenceForTarget(
  settings: UserSettingsRecord | null | undefined,
  target: AttentionTarget
) {
  const preferences = getAttentionPersonPreferences(settings);
  if (preferences.length === 0) return null;

  return matchAttentionPersonPreference(preferences, {
    actorKeys: target.actorKeys,
  });
}

export function getSeededAttentionPeopleForUser(
  email: string | null | undefined
) {
  const normalizedEmail = normalizePersonEmail(email);
  if (normalizedEmail !== "ari@sonance.com") {
    return [];
  }

  return [
    {
      id: buildAttentionPersonPreferenceId({ name: "Jeana Ceglia" }),
      name: "Jeana Ceglia",
      email: null,
      aliases: ["Jeana"],
      pinned: true,
      important: true,
      source: "seeded" as const,
    },
    {
      id: buildAttentionPersonPreferenceId({ name: "Scott Struthers" }),
      name: "Scott Struthers",
      email: null,
      aliases: ["Scott"],
      pinned: true,
      important: true,
      source: "seeded" as const,
    },
  ];
}
