"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/useAuth";
import { usePeople } from "@/hooks/usePeople";
import { useAttention } from "@/lib/attention/client";
import type { AttentionPersonPreference } from "@/lib/attention/people";
import {
  buildAttentionPersonPreferenceId,
  getAttentionPersonRankingWeight,
  getSeededAttentionPeopleForUser,
  normalizePersonEmail,
  normalizePersonLabel,
} from "@/lib/attention/people";
import { cn } from "@/lib/utils";

type AddMode = "important" | "both";

interface SuggestedPerson {
  key: string;
  preference: AttentionPersonPreference;
  reason: string;
  starter?: boolean;
}

const URGENCY_WEIGHT = {
  red: 30,
  amber: 18,
  teal: 10,
  gray: 0,
} as const;

function titleCase(value: string) {
  return value
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function buildPreferenceFromDraft(
  value: string,
  mode: AddMode
): AttentionPersonPreference | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const email = normalizePersonEmail(trimmed);
  const withoutEmail = email
    ? trimmed.replace(email, "").replace(/[<>()[\]]/g, " ")
    : trimmed;
  const name = normalizePersonLabel(withoutEmail) || titleCase(email.split("@")[0] ?? "");
  if (!name && !email) return null;

  return {
    id: buildAttentionPersonPreferenceId({ name, email }),
    name: name || email,
    email: email || null,
    aliases: [],
    pinned: mode === "both",
    important: true,
    source: "manual",
  };
}

function buildSuggestedPreference(
  name: string,
  email: string | undefined,
  source: AttentionPersonPreference["source"]
) {
  return {
    id: buildAttentionPersonPreferenceId({ name, email }),
    name,
    email: normalizePersonEmail(email) || null,
    aliases: [],
    pinned: false,
    important: true,
    source,
  } satisfies AttentionPersonPreference;
}

export function PeopleFocusManager() {
  const { user } = useAuth();
  const { people, loading } = usePeople();
  const { addToast } = useToast();
  const {
    peoplePreferences,
    upsertPersonPreference,
    removePersonPreference,
    getPersonPreference,
  } = useAttention();
  const [draft, setDraft] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  const pinnedCount = peoplePreferences.filter((person) => person.pinned).length;
  const importantCount = peoplePreferences.filter((person) => person.important).length;

  const suggestions = useMemo(() => {
    const seededSuggestions = getSeededAttentionPeopleForUser(user?.email).map(
      (preference) => ({
        key: `seeded:${preference.id}`,
        preference,
        reason: "Starter for Ari",
        starter: true,
      })
    );

    const minedSuggestions = [...people]
      .filter(
        (person) =>
          !getPersonPreference({ name: person.name, email: person.email ?? null })
      )
      .sort((a, b) => {
        const aScore = URGENCY_WEIGHT[a.urgency] + a.touchpoints * 3;
        const bScore = URGENCY_WEIGHT[b.urgency] + b.touchpoints * 3;
        return bScore - aScore;
      })
      .map((person) => ({
        key: `mined:${person.name}`,
        preference: buildSuggestedPreference(
          person.name,
          person.email,
          "suggested"
        ),
        reason: `${person.touchpoints} touchpoint${
          person.touchpoints === 1 ? "" : "s"
        } · ${person.action}`,
      }));

    const combined = [...seededSuggestions, ...minedSuggestions].filter(
      (suggestion) =>
        !getPersonPreference({
          name: suggestion.preference.name,
          email: suggestion.preference.email,
          aliases: suggestion.preference.aliases,
        })
    );

    const query = draft.trim().toLowerCase();
    const filtered = query
      ? combined.filter((suggestion) => {
          const searchable = [
            suggestion.preference.name,
            suggestion.preference.email ?? "",
            ...suggestion.preference.aliases,
          ]
            .join(" ")
            .toLowerCase();
          return searchable.includes(query);
        })
      : combined;

    const unique = new Map<string, SuggestedPerson>();
    for (const suggestion of filtered) {
      if (!unique.has(suggestion.preference.id)) {
        unique.set(suggestion.preference.id, suggestion);
      }
    }

    return Array.from(unique.values()).slice(0, 10);
  }, [draft, getPersonPreference, people, user?.email]);

  const handleAdd = async (mode: AddMode) => {
    const preference = buildPreferenceFromDraft(draft, mode);
    if (!preference) {
      setDraftError("Enter a name or email to add someone.");
      return;
    }

    setSavingKey(`draft:${mode}`);
    setDraftError(null);
    try {
      await upsertPersonPreference(preference);
      setDraft("");
    } catch (error) {
      setDraftError(
        error instanceof Error
          ? error.message
          : "Couldn't save that person preference."
      );
    } finally {
      setSavingKey(null);
    }
  };

  const handleSuggest = async (
    suggestion: SuggestedPerson,
    mode: AddMode
  ) => {
    setSavingKey(`${suggestion.preference.id}:${mode}`);
    try {
      await upsertPersonPreference({
        ...suggestion.preference,
        pinned: mode === "both",
        important: true,
      });
    } catch (error) {
      addToast(
        error instanceof Error
          ? error.message
          : "Couldn't save that person preference.",
        "error"
      );
    } finally {
      setSavingKey(null);
    }
  };

  const handleToggle = async (
    preference: AttentionPersonPreference,
    field: "pinned" | "important"
  ) => {
    const next = {
      ...preference,
      [field]: !preference[field],
    };

    setSavingKey(`${preference.id}:${field}`);
    try {
      if (!next.pinned && !next.important) {
        await removePersonPreference(preference.id);
        return;
      }

      await upsertPersonPreference(next);
    } catch (error) {
      addToast(
        error instanceof Error
          ? error.message
          : "Couldn't update that person preference.",
        "error"
      );
    } finally {
      setSavingKey(null);
    }
  };

  const handleRemove = async (preference: AttentionPersonPreference) => {
    setSavingKey(`${preference.id}:remove`);
    try {
      await removePersonPreference(preference.id);
    } catch (error) {
      addToast(
        error instanceof Error
          ? error.message
          : "Couldn't remove that person preference.",
        "error"
      );
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <section className="rounded-[24px] border border-[var(--bg-card-border)] bg-black/10 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="text-[11px] uppercase tracking-[0.22em] text-accent-amber">
            People Priority
          </div>
          <h2 className="mt-2 text-lg font-semibold text-text-heading">
            Pin who should stay visible and mark who matters most.
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">
            Important people get a ranking lift across mail, chats, meetings,
            and tasks. Pinned people also stay surfaced higher in the People
            views.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="rounded-full border border-[var(--bg-card-border)] bg-white/[0.03] px-3 py-1 text-xs text-text-muted">
            {importantCount} important
          </div>
          <div className="rounded-full border border-[var(--bg-card-border)] bg-white/[0.03] px-3 py-1 text-xs text-text-muted">
            {pinnedCount} pinned
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[20px] border border-[var(--bg-card-border)] bg-white/[0.03] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-text-heading">
                Your tuned people
              </div>
              <p className="mt-1 text-xs text-text-muted">
                These are explicit per-user choices and never bleed into other
                employees&apos; profiles.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {peoplePreferences.length > 0 ? (
              peoplePreferences.map((preference) => {
                const rank = getAttentionPersonRankingWeight(preference);
                return (
                  <div
                    key={preference.id}
                    className={cn(
                      "rounded-2xl border p-3",
                      rank >= 3
                        ? "border-accent-amber/35 bg-accent-amber/10"
                        : "border-[var(--bg-card-border)] bg-black/10"
                    )}
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-medium text-text-heading">
                            {preference.name}
                          </div>
                          {preference.important && (
                            <span className="rounded-full border border-accent-amber/25 bg-accent-amber/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-accent-amber">
                              Important
                            </span>
                          )}
                          {preference.pinned && (
                            <span className="rounded-full border border-accent-teal/25 bg-accent-teal/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-accent-teal">
                              Pinned
                            </span>
                          )}
                          <span className="rounded-full border border-[var(--bg-card-border)] bg-black/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-text-muted">
                            {preference.source}
                          </span>
                        </div>
                        {preference.email && (
                          <div className="mt-1 text-xs text-text-muted">
                            {preference.email}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant={preference.important ? "primary" : "outline"}
                          size="xs"
                          disabled={savingKey === `${preference.id}:important`}
                          onClick={() => void handleToggle(preference, "important")}
                        >
                          {preference.important ? "Important on" : "Make important"}
                        </Button>
                        <Button
                          variant={preference.pinned ? "secondary" : "outline"}
                          size="xs"
                          disabled={savingKey === `${preference.id}:pinned`}
                          onClick={() => void handleToggle(preference, "pinned")}
                        >
                          {preference.pinned ? "Pinned" : "Pin"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          disabled={savingKey === `${preference.id}:remove`}
                          onClick={() => void handleRemove(preference)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--bg-card-border)] bg-black/10 p-4 text-sm text-text-muted">
                No people are pinned or marked important yet. Add someone from
                recent activity or type a name or email on the right.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[20px] border border-[var(--bg-card-border)] bg-white/[0.03] p-4">
          <div>
            <div className="text-sm font-medium text-text-heading">
              Add from activity or type someone in
            </div>
            <p className="mt-1 text-xs text-text-muted">
              Suggestions are mined from recent inbox, Teams, calendar, task,
              and Slack activity.
            </p>
          </div>

          <div className="mt-4">
            <input
              type="text"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                if (draftError) setDraftError(null);
              }}
              placeholder="Type a name or email..."
              className="h-10 w-full rounded-2xl border border-[var(--bg-card-border)] bg-black/10 px-3 text-sm text-text-heading outline-none placeholder:text-text-muted"
            />
            {draftError && (
              <div className="mt-2 text-xs text-accent-red">{draftError}</div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="sm"
                disabled={savingKey === "draft:important"}
                onClick={() => void handleAdd("important")}
              >
                Add important
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={savingKey === "draft:both"}
                onClick={() => void handleAdd("both")}
              >
                Pin + important
              </Button>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {loading ? (
              <div className="rounded-2xl border border-[var(--bg-card-border)] bg-black/10 p-4 text-sm text-text-muted">
                Loading people suggestions...
              </div>
            ) : suggestions.length > 0 ? (
              suggestions.map((suggestion) => (
                <div
                  key={suggestion.key}
                  className={cn(
                    "rounded-2xl border p-3",
                    suggestion.starter
                      ? "border-accent-teal/25 bg-accent-teal/10"
                      : "border-[var(--bg-card-border)] bg-black/10"
                  )}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-medium text-text-heading">
                          {suggestion.preference.name}
                        </div>
                        {suggestion.starter && (
                          <span className="rounded-full border border-accent-teal/25 bg-accent-teal/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-accent-teal">
                            Starter
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-text-muted">
                        {suggestion.preference.email || suggestion.reason}
                      </div>
                      {suggestion.preference.email && (
                        <div className="mt-1 text-[11px] text-text-muted/80">
                          {suggestion.reason}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        size="xs"
                        disabled={
                          savingKey === `${suggestion.preference.id}:important`
                        }
                        onClick={() => void handleSuggest(suggestion, "important")}
                      >
                        Important
                      </Button>
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={savingKey === `${suggestion.preference.id}:both`}
                        onClick={() => void handleSuggest(suggestion, "both")}
                      >
                        Pin + important
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--bg-card-border)] bg-black/10 p-4 text-sm text-text-muted">
                No new suggestions match yet. Try a different name or email.
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
