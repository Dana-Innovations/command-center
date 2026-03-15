"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/hooks/useAuth";
import type {
  AttentionProvider,
  AttentionFeedbackValue,
  AttentionItem,
  AttentionProfile,
  AttentionTarget,
  FocusMapResponse,
  FocusMapWarning,
  FocusNode,
  ImportanceTier,
} from "@/lib/attention/types";
import { applyAttentionProfile } from "@/lib/attention/utils";
import type { SetupFocusTab } from "@/lib/tab-config";
import {
  createDefaultReplyPriorityPreferences,
  mergeReplyPriorityPreferences,
  type ReplyPriorityPreferences,
} from "@/lib/reply-center";

interface ServiceStatus {
  provider: string;
  label: string;
  description: string;
  connected: boolean;
  account_email?: string;
}

interface FocusMapErrorState {
  message: string;
  provider?: AttentionProvider;
}

interface FocusMapRefreshResult {
  ok: boolean;
  warnings: FocusMapWarning[];
  error: string | null;
}

interface AttentionContextValue {
  profile: AttentionProfile | null;
  focusProviders: FocusNode[];
  services: ServiceStatus[];
  focusMapWarnings: FocusMapWarning[];
  focusMapError: FocusMapErrorState | null;
  profileError: string | null;
  profileLoading: boolean;
  focusMapLoading: boolean;
  servicesLoading: boolean;
  onboardingCompleted: boolean;
  setupTab: SetupFocusTab;
  focusRevision: number;
  replyPreferences: ReplyPriorityPreferences;
  openSetupFocus: (tab?: SetupFocusTab) => void;
  setSetupTab: (tab: SetupFocusTab) => void;
  refreshProfile: () => Promise<void>;
  refreshFocusMap: (options?: {
    provider?: AttentionProvider;
    teamId?: string;
  }) => Promise<FocusMapRefreshResult>;
  refreshServices: () => Promise<void>;
  ensureTeamChannels: (teamId: string) => Promise<FocusMapRefreshResult>;
  setNodeImportance: (node: FocusNode, importance: ImportanceTier) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  updateReplyPreferences: (preferences: ReplyPriorityPreferences) => Promise<void>;
  getItemFeedback: (
    itemType: string,
    itemId: string
  ) => AttentionFeedbackValue | null;
  submitFeedback: (
    target: AttentionTarget,
    feedback: AttentionFeedbackValue,
    surface?: string
  ) => Promise<void>;
  applyTarget: (target: AttentionTarget) => AttentionItem;
}

const AttentionContext = createContext<AttentionContextValue | null>(null);

function flattenFocusNodes(nodes: FocusNode[]) {
  const index = new Map<string, FocusNode>();

  const visit = (value: FocusNode[]) => {
    for (const node of value) {
      index.set(node.id, node);
      if (node.children?.length) {
        visit(node.children);
      }
    }
  };

  visit(nodes);
  return index;
}

function mergeProviderNodes(current: FocusNode[], next: FocusNode[]) {
  if (current.length === 0) return next;

  const merged = new Map(current.map((provider) => [provider.provider, provider]));
  for (const provider of next) {
    merged.set(provider.provider, provider);
  }

  return Array.from(merged.values());
}

function warningKey(warning: FocusMapWarning) {
  return [
    warning.provider ?? "global",
    warning.scope ?? "all",
    warning.code,
    warning.message,
  ].join("::");
}

function mergeFocusWarnings(
  current: FocusMapWarning[],
  next: FocusMapWarning[],
  provider?: AttentionProvider
) {
  if (!provider) {
    return next;
  }

  const retained = current.filter((warning) => warning.provider !== provider);
  const merged = new Map(
    [...retained, ...next].map((warning) => [warningKey(warning), warning])
  );

  return Array.from(merged.values());
}

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export function AttentionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<AttentionProfile | null>(null);
  const [focusProviders, setFocusProviders] = useState<FocusNode[]>([]);
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [focusMapWarnings, setFocusMapWarnings] = useState<FocusMapWarning[]>([]);
  const [focusMapError, setFocusMapError] = useState<FocusMapErrorState | null>(
    null
  );
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [focusMapLoading, setFocusMapLoading] = useState(true);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [setupTab, setSetupTab] = useState<SetupFocusTab>("focus");
  const [focusRevision, setFocusRevision] = useState(0);
  const migratedLegacyRef = useRef(false);

  const refreshProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const next = await fetchJson<AttentionProfile>("/api/preferences", {
        cache: "no-store",
      });
      startTransition(() => {
        setProfile(next);
        setProfileError(null);
      });
    } catch (error) {
      startTransition(() => {
        setProfileError(
          error instanceof Error ? error.message : "Failed to load preferences"
        );
      });
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const refreshFocusMap = useCallback(
    async (options?: {
      provider?: AttentionProvider;
      teamId?: string;
    }): Promise<FocusMapRefreshResult> => {
      const params = new URLSearchParams();
      if (options?.provider) params.set("provider", options.provider);
      if (options?.teamId) params.set("teamId", options.teamId);

      const query = params.toString();
      setFocusMapLoading(true);
      try {
        const next = await fetchJson<FocusMapResponse>(
          `/api/focus/map${query ? `?${query}` : ""}`,
          { cache: "no-store" }
        );
        const warnings = next.warnings ?? [];

        startTransition(() => {
          setFocusProviders((current) =>
            mergeProviderNodes(current, next.providers)
          );
          setFocusMapWarnings((current) =>
            mergeFocusWarnings(current, warnings, options?.provider)
          );
          setFocusMapError((current) => {
            if (next.error) {
              return {
                message: next.error,
                provider: options?.provider,
              };
            }

            if (!options?.provider) {
              return null;
            }

            return current?.provider === options.provider ? null : current;
          });
        });

        return {
          ok: !next.error,
          warnings,
          error: next.error ?? null,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to load focus map";

        startTransition(() => {
          setFocusMapError({
            message,
            provider: options?.provider,
          });
        });

        return {
          ok: false,
          warnings: [],
          error: message,
        };
      } finally {
        setFocusMapLoading(false);
      }
    },
    []
  );

  const refreshServices = useCallback(async () => {
    setServicesLoading(true);
    try {
      const next = await fetchJson<{ services?: ServiceStatus[] }>("/api/connections", {
        cache: "no-store",
      });
      startTransition(() => setServices(next.services ?? []));
    } finally {
      setServicesLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshProfile();
    void refreshFocusMap();
    void refreshServices();
  }, [refreshFocusMap, refreshProfile, refreshServices]);

  const nodeIndex = useMemo(() => flattenFocusNodes(focusProviders), [focusProviders]);

  const replyPreferences = useMemo(
    () =>
      mergeReplyPriorityPreferences(
        profile?.settings?.advanced_ranking?.reply_priority ??
          createDefaultReplyPriorityPreferences()
      ),
    [profile]
  );

  const onboardingCompleted = useMemo(
    () => Boolean(profile?.settings?.onboarding?.workspace_studio_completed_at),
    [profile]
  );

  const savePreferences = useCallback(
    async (body: {
      settings?: Record<string, unknown>;
      focusUpserts?: Array<Record<string, unknown>>;
      focusDeletes?: Array<Record<string, unknown>>;
    }) => {
      try {
        const next = await fetchJson<AttentionProfile>("/api/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        startTransition(() => {
          setProfile(next);
          setProfileError(null);
        });
        return next;
      } catch (error) {
        startTransition(() => {
          setProfileError(
            error instanceof Error ? error.message : "Failed to save preferences"
          );
        });
        throw error;
      }
    },
    []
  );

  useEffect(() => {
    if (!profile || !user || migratedLegacyRef.current) return;

    const focusAlreadyConfigured = profile.focusPreferences.length > 0;
    const replyAlreadyConfigured = Boolean(
      profile.settings?.advanced_ranking?.reply_priority
    );
    const tasksToMigrate: {
      focusUpserts?: Array<Record<string, unknown>>;
      settings?: Record<string, unknown>;
    } = {};

    try {
      if (!focusAlreadyConfigured) {
        const storedBoards = window.localStorage.getItem("my-monkeys:project-filter");
        if (storedBoards) {
          const gids = JSON.parse(storedBoards) as string[];
          if (Array.isArray(gids) && gids.length > 0) {
            tasksToMigrate.focusUpserts = gids.map((gid) => ({
              provider: "asana",
              entity_type: "asana_project",
              entity_id: gid,
              importance: "critical",
              label_snapshot: gid,
              metadata: {},
            }));
          }
        }
      }
    } catch {
      // Ignore legacy focus migration issues.
    }

    try {
      if (!replyAlreadyConfigured) {
        const identity = (
          user.email ||
          user.user_metadata?.full_name ||
          ""
        )
          .trim()
          .toLowerCase();
        const storedReply = identity
          ? window.localStorage.getItem(`reply-center:${identity}`)
          : null;

        if (storedReply) {
          const parsed = JSON.parse(storedReply) as {
            preferences?: ReplyPriorityPreferences;
          };
          if (parsed.preferences) {
            tasksToMigrate.settings = {
              advanced_ranking: {
                reply_priority: mergeReplyPriorityPreferences(parsed.preferences),
              },
            };
          }
        }
      }
    } catch {
      // Ignore legacy reply migration issues.
    }

    migratedLegacyRef.current = true;

    if (!tasksToMigrate.focusUpserts && !tasksToMigrate.settings) {
      return;
    }

    void savePreferences(tasksToMigrate)
      .then(() => {
        setFocusRevision((value) => value + 1);
        void refreshFocusMap();
      })
      .catch(() => {
        // Loading errors are surfaced via profileError state.
      });
  }, [profile, refreshFocusMap, savePreferences, user]);

  const openSetupFocus = useCallback((tab: SetupFocusTab = "focus") => {
    setSetupTab(tab);
  }, []);

  const ensureTeamChannels = useCallback(
    async (teamId: string) => {
      if (!teamId) {
        return { ok: true, warnings: [], error: null };
      }
      const teamNode = nodeIndex.get(`teams::teams_team::${teamId}`);
      if (teamNode && teamNode.children && teamNode.children.length > 0) {
        return { ok: true, warnings: [], error: null };
      }

      return refreshFocusMap({ provider: "teams", teamId });
    },
    [nodeIndex, refreshFocusMap]
  );

  const setNodeImportance = useCallback(
    async (node: FocusNode, importance: ImportanceTier) => {
      const parent = node.parentId ? nodeIndex.get(node.parentId) : null;
      const inherited = node.inheritedImportance;
      const deleteMode = importance === inherited;

      await savePreferences({
        focusUpserts: deleteMode
          ? []
          : [
              {
                provider: node.provider,
                entity_type: node.entityType,
                entity_id: node.entityId,
                parent_entity_type: parent?.entityType ?? null,
                parent_entity_id: parent?.entityId ?? null,
                label_snapshot: node.label,
                importance,
                metadata: node.metadata ?? {},
              },
            ],
        focusDeletes: deleteMode
          ? [
              {
                provider: node.provider,
                entity_type: node.entityType,
                entity_id: node.entityId,
              },
            ]
          : [],
      });

      setFocusRevision((value) => value + 1);
      await refreshFocusMap();
    },
    [nodeIndex, refreshFocusMap, savePreferences]
  );

  const completeOnboarding = useCallback(async () => {
    await savePreferences({
      settings: {
        onboarding: {
          workspace_studio_completed_at: new Date().toISOString(),
        },
      },
    });
  }, [savePreferences]);

  const updateReplyPreferences = useCallback(
    async (preferences: ReplyPriorityPreferences) => {
      await savePreferences({
        settings: {
          advanced_ranking: {
            reply_priority: preferences,
          },
        },
      });
    },
    [savePreferences]
  );

  const getItemFeedback = useCallback(
    (itemType: string, itemId: string) =>
      profile?.feedback.find(
        (entry) => entry.item_type === itemType && entry.item_id === itemId
      )?.feedback ?? null,
    [profile]
  );

  const submitFeedback = useCallback(
    async (
      target: AttentionTarget,
      feedback: AttentionFeedbackValue,
      surface?: string
    ) => {
      const response = await fetchJson<{ profile?: AttentionProfile }>(
        "/api/attention/feedback",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target,
            feedback,
            surface: surface || target.surface || "unknown",
          }),
        }
      );

      if (response.profile) {
        startTransition(() => setProfile(response.profile ?? null));
      }
    },
    []
  );

  const applyTarget = useCallback(
    (target: AttentionTarget) =>
      applyAttentionProfile(
        target,
        profile?.focusPreferences ?? [],
        profile?.biases ?? []
      ),
    [profile]
  );

  const value = useMemo<AttentionContextValue>(
    () => ({
      profile,
      focusProviders,
      services,
      focusMapWarnings,
      focusMapError,
      profileError,
      profileLoading,
      focusMapLoading,
      servicesLoading,
      onboardingCompleted,
      setupTab,
      focusRevision,
      replyPreferences,
      openSetupFocus,
      setSetupTab,
      refreshProfile,
      refreshFocusMap,
      refreshServices,
      ensureTeamChannels,
      setNodeImportance,
      completeOnboarding,
      updateReplyPreferences,
      getItemFeedback,
      submitFeedback,
      applyTarget,
    }),
    [
      applyTarget,
      completeOnboarding,
      ensureTeamChannels,
      focusMapError,
      focusMapLoading,
      focusProviders,
      focusMapWarnings,
      focusRevision,
      getItemFeedback,
      onboardingCompleted,
      openSetupFocus,
      profile,
      profileError,
      profileLoading,
      refreshFocusMap,
      refreshProfile,
      refreshServices,
      replyPreferences,
      services,
      servicesLoading,
      setNodeImportance,
      setupTab,
      submitFeedback,
      updateReplyPreferences,
    ]
  );

  return (
    <AttentionContext.Provider value={value}>
      {children}
    </AttentionContext.Provider>
  );
}

export function useAttention() {
  const context = useContext(AttentionContext);
  if (!context) {
    throw new Error("useAttention must be used within AttentionProvider");
  }

  return context;
}
