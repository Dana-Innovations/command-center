"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useAttention } from "@/lib/attention/client";
import type {
  AttentionProvider,
  AttentionFeedbackValue,
  AttentionProfile,
  FocusNode,
  ImportanceTier,
} from "@/lib/attention/types";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "connections", label: "Connections" },
  { id: "focus", label: "Focus" },
  { id: "advanced", label: "Advanced learning" },
] as const;

const IMPORTANCE_OPTIONS: Array<{
  value: ImportanceTier;
  label: string;
  short: string;
}> = [
  { value: "critical", label: "Critical", short: "High" },
  { value: "normal", label: "Normal", short: "Norm" },
  { value: "quiet", label: "Quiet", short: "Quiet" },
  { value: "muted", label: "Muted", short: "Mute" },
];

const FEEDBACK_LABELS: Record<AttentionFeedbackValue, string> = {
  raise: "Raised before",
  right: "Held at the right level",
  lower: "Lowered before",
};

const PROVIDER_CONNECTION_LABELS: Record<AttentionProvider, string> = {
  outlook_mail: "Microsoft 365",
  outlook_calendar: "Microsoft 365",
  asana: "Asana",
  teams: "Microsoft 365",
  slack: "Slack",
};

interface FocusPreviewRecord {
  key: string;
  provider: AttentionProvider;
  entityType: string;
  entityId: string;
  label: string;
  importance: ImportanceTier;
  assumed: boolean;
}

function buildFocusPreviewRecords(
  focusProviders: FocusNode[],
  profile: AttentionProfile | null
) {
  const preview = new Map<string, FocusPreviewRecord>();
  const saved = profile?.focusPreferences ?? [];

  for (const record of saved) {
    const key = `${record.provider}::${record.entity_type}::${record.entity_id}`;
    preview.set(key, {
      key,
      provider: record.provider,
      entityType: record.entity_type,
      entityId: record.entity_id,
      label: record.label_snapshot?.trim() ? record.label_snapshot : record.entity_id,
      importance: record.importance,
      assumed: false,
    });
  }

  const visit = (nodes: FocusNode[]) => {
    for (const node of nodes) {
      const skipContainer =
        node.entityType === "mail_root" || node.entityType === "calendar_root";
      const key = `${node.provider}::${node.entityType}::${node.entityId}`;
      const existing = preview.get(key);

      if (!skipContainer && node.importance !== "normal") {
        preview.set(key, {
          key,
          provider: node.provider,
          entityType: node.entityType,
          entityId: node.entityId,
          label: node.label,
          importance: node.importance,
          assumed: existing ? false : node.importance === node.inheritedImportance,
        });
      }

      if (node.children?.length) {
        visit(node.children);
      }
    }
  };

  visit(focusProviders);

  return Array.from(preview.values());
}

function filterNodes(nodes: FocusNode[], query: string): FocusNode[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return nodes;

  return nodes
    .map((node) => ({
      ...node,
      children: filterNodes(node.children ?? [], trimmed),
    }))
    .filter((node) => {
      const text = `${node.label} ${node.description ?? ""}`.toLowerCase();
      return (
        text.includes(trimmed) || Boolean(node.children && node.children.length > 0)
      );
    });
}

function FocusTierControl({
  value,
  inheritedValue,
  onChange,
  disabled,
}: {
  value: ImportanceTier;
  inheritedValue: ImportanceTier;
  onChange: (next: ImportanceTier) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex rounded-2xl border border-[var(--bg-card-border)] bg-black/10 p-1">
      {IMPORTANCE_OPTIONS.map((option) => {
        const active = option.value === value;
        const inherited = !active && option.value === inheritedValue;
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-xl px-2.5 py-1.5 text-[11px] font-medium transition-colors",
              active
                ? "bg-[var(--tab-active-bg)] text-[var(--text-heading)]"
                : inherited
                  ? "text-accent-amber"
                  : "text-text-muted hover:text-text-body"
            )}
            title={option.label}
          >
            {option.short}
          </button>
        );
      })}
    </div>
  );
}

function FocusStatusCard({
  title,
  body,
  tone = "default",
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  tone?: "default" | "warning" | "error";
  actionLabel?: string;
  onAction?: () => void;
}) {
  const toneClasses = {
    default: "border-[var(--bg-card-border)] bg-white/[0.03] text-text-muted",
    warning: "border-accent-amber/30 bg-accent-amber/10 text-text-body",
    error: "border-accent-red/30 bg-accent-red/10 text-text-body",
  } satisfies Record<string, string>;

  return (
    <div className={cn("rounded-2xl border p-5", toneClasses[tone])}>
      <div className="text-sm font-medium text-text-heading">{title}</div>
      <div className="mt-2 text-sm leading-relaxed">{body}</div>
      {actionLabel && onAction && (
        <div className="mt-4">
          <Button variant="secondary" size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

function FocusTree({
  nodes,
  depth = 0,
  pendingNodeId,
  onSelectNode,
  onChangeImportance,
}: {
  nodes: FocusNode[];
  depth?: number;
  pendingNodeId: string | null;
  onSelectNode: (node: FocusNode) => void;
  onChangeImportance: (node: FocusNode, next: ImportanceTier) => void;
}) {
  return (
    <div className="space-y-2">
      {nodes.map((node) => {
        const countParts = [
          node.counts?.unread ? `${node.counts.unread} unread` : null,
          node.counts?.total ? `${node.counts.total} items` : null,
          node.counts?.children ? `${node.counts.children} children` : null,
        ].filter(Boolean);

        return (
          <div key={node.id} className="space-y-2">
            <div
              className="rounded-2xl border border-[var(--bg-card-border)] bg-black/10 px-3 py-3"
              style={{ marginLeft: depth * 12 }}
            >
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <button
                  type="button"
                  onClick={() => onSelectNode(node)}
                  className="min-w-0 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-heading">
                      {node.label}
                    </span>
                    {node.lazy && (!node.children || node.children.length === 0) && (
                      <span className="rounded-full border border-accent-amber/20 bg-accent-amber/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-accent-amber">
                        Load
                      </span>
                    )}
                  </div>
                  {(node.description || countParts.length > 0) && (
                    <div className="mt-1 text-xs text-text-muted">
                      {[node.description, ...countParts].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </button>
                <FocusTierControl
                  value={node.importance}
                  inheritedValue={node.inheritedImportance}
                  disabled={pendingNodeId === node.id}
                  onChange={(next) => onChangeImportance(node, next)}
                />
              </div>
            </div>
            {node.children && node.children.length > 0 && (
              <FocusTree
                nodes={node.children}
                depth={depth + 1}
                pendingNodeId={pendingNodeId}
                onSelectNode={onSelectNode}
                onChangeImportance={onChangeImportance}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface SetupFocusViewProps {
  onBack?: () => void;
}

export function SetupFocusView({ onBack }: SetupFocusViewProps) {
  const {
    profile,
    focusProviders,
    services,
    focusMapWarnings,
    focusMapError,
    profileError,
    profileLoading,
    focusMapLoading,
    servicesLoading,
    setupTab,
    setSetupTab,
    refreshFocusMap,
    refreshServices,
    ensureTeamChannels,
    setNodeImportance,
    refreshProfile,
    completeOnboarding,
  } = useAttention();
  const { addToast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<
    AttentionProvider | ""
  >("");
  const [pendingNodeId, setPendingNodeId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [focusActionError, setFocusActionError] = useState<string | null>(null);
  const [teamRetryNodeId, setTeamRetryNodeId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedProvider && focusProviders.length > 0) {
      setSelectedProvider(focusProviders[0].provider);
    }
  }, [focusProviders, selectedProvider]);

  const providerNode = useMemo(
    () =>
      focusProviders.find((provider) => provider.provider === selectedProvider) ??
      focusProviders[0] ??
      null,
    [focusProviders, selectedProvider]
  );

  const filteredNodes = useMemo(
    () => filterNodes(providerNode?.children ?? [], search),
    [providerNode, search]
  );

  const selectedWarnings = useMemo(
    () =>
      focusMapWarnings.filter(
        (warning) =>
          (!warning.provider || warning.provider === providerNode?.provider) &&
          !(
            focusActionError &&
            warning.code === "team_channels_failed" &&
            warning.scope === teamRetryNodeId
          )
      ),
    [focusActionError, focusMapWarnings, providerNode, teamRetryNodeId]
  );

  const selectedFocusError = useMemo(() => {
    if (!focusMapError) return null;
    if (!focusMapError.provider) return focusMapError;
    return focusMapError.provider === providerNode?.provider
      ? focusMapError
      : null;
  }, [focusMapError, providerNode]);

  const hasProviderInventory = (providerNode?.children?.length ?? 0) > 0;
  const isSearching = search.trim().length > 0;
  const showInitialFocusLoading = focusMapLoading && focusProviders.length === 0;

  useEffect(() => {
    if (!teamRetryNodeId || providerNode?.provider !== "teams") return;

    const teamNode = providerNode.children?.find(
      (child) => child.entityId === teamRetryNodeId
    );
    if (teamNode?.children && teamNode.children.length > 0) {
      setFocusActionError(null);
      setTeamRetryNodeId(null);
    }
  }, [providerNode, teamRetryNodeId]);

  useEffect(() => {
    setFocusActionError(null);
  }, [selectedProvider]);

  const preview = useMemo(() => {
    const records = buildFocusPreviewRecords(focusProviders, profile);
    return {
      rise: records
        .filter((record) => record.importance === "critical")
        .sort((a, b) => a.label.localeCompare(b.label))
        .slice(0, 8),
      fade: records
        .filter(
          (record) => record.importance === "quiet" || record.importance === "muted"
        )
        .sort((a, b) => {
          if (a.importance !== b.importance) {
            return a.importance === "muted" ? -1 : 1;
          }
          return a.label.localeCompare(b.label);
        })
        .slice(0, 8),
    };
  }, [focusProviders, profile]);

  const feedbackStats = useMemo(() => {
    const feedback = profile?.feedback ?? [];
    return {
      raise: feedback.filter((item) => item.feedback === "raise").slice(0, 8),
      right: feedback.filter((item) => item.feedback === "right").slice(0, 8),
      lower: feedback.filter((item) => item.feedback === "lower").slice(0, 8),
      biases: (profile?.biases ?? []).slice(0, 10),
    };
  }, [profile]);

  const handleConnect = useCallback(
    async (provider: string) => {
      setConnecting(provider);
      try {
        const response = await fetch("/api/connections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider }),
        });
        if (!response.ok) {
          setConnecting(null);
          addToast("Failed to start the connection flow.", "error");
          return;
        }
        const data = (await response.json()) as { authorization_url?: string };
        if (!data.authorization_url) {
          setConnecting(null);
          addToast("No authorization URL was returned for this connection.", "error");
          return;
        }

        const popup = window.open(
          data.authorization_url,
          "cortex-connect",
          "width=640,height=760,popup=yes"
        );
        if (!popup) {
          setConnecting(null);
          addToast("The browser blocked the connection popup.", "error");
          return;
        }

        const interval = window.setInterval(async () => {
          if (popup?.closed) {
            window.clearInterval(interval);
            setConnecting(null);
            await Promise.all([refreshServices(), refreshFocusMap()]);
          }
        }, 1200);

        window.setTimeout(() => {
          window.clearInterval(interval);
          setConnecting(null);
        }, 300000);
      } catch (error) {
        addToast(
          error instanceof Error
            ? error.message
            : "Failed to start the connection flow.",
          "error"
        );
        setConnecting(null);
      }
    },
    [addToast, refreshFocusMap, refreshServices]
  );

  const handleSelectNode = useCallback(
    async (node: FocusNode) => {
      if (node.provider === "teams" && node.entityType === "teams_team" && node.lazy) {
        setTeamRetryNodeId(node.entityId);
        const result = await ensureTeamChannels(node.entityId);
        const teamWarning = result.warnings.find(
          (warning) =>
            warning.provider === "teams" &&
            warning.code === "team_channels_failed" &&
            warning.scope === node.entityId
        );

        if (!result.ok || teamWarning) {
          setFocusActionError(
            teamWarning?.message ||
              result.error ||
              `Couldn't load channels for ${node.label}.`
          );
          return;
        }

        setFocusActionError(null);
        setTeamRetryNodeId(null);
      }
    },
    [ensureTeamChannels]
  );

  const handleChangeImportance = useCallback(
    async (node: FocusNode, importance: ImportanceTier) => {
      setPendingNodeId(node.id);
      try {
        await setNodeImportance(node, importance);
        setFocusActionError(null);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to save the focus preference.";
        setFocusActionError(message);
        addToast(message, "error");
      } finally {
        setPendingNodeId(null);
      }
    },
    [addToast, setNodeImportance]
  );

  const retrySelectedProvider = useCallback(() => {
    setFocusActionError(null);

    if (!providerNode?.provider) {
      void refreshFocusMap();
      return;
    }

    void refreshFocusMap({ provider: providerNode.provider });
  }, [providerNode, refreshFocusMap]);

  const retryTeamChannels = useCallback(() => {
    if (!teamRetryNodeId) return;

    const teamNode = providerNode?.children?.find(
      (child) => child.entityId === teamRetryNodeId
    );
    setFocusActionError(null);

    if (teamNode) {
      void handleSelectNode(teamNode);
      return;
    }

    void refreshFocusMap({ provider: "teams", teamId: teamRetryNodeId });
  }, [handleSelectNode, providerNode, refreshFocusMap, teamRetryNodeId]);

  const connectedCount = services.filter((service) => service.connected).length;

  return (
    <div className="space-y-5">
      <section className="glass-card anim-card overflow-hidden" style={{ animationDelay: "60ms" }}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,163,225,0.16),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(0,178,169,0.12),transparent_32%)]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-[11px] uppercase tracking-[0.28em] text-accent-amber">
              Setup & Focus
            </div>
            <h1 className="mt-3 font-display text-3xl font-semibold leading-tight text-text-heading">
              Shape what rises, fades, and gets your attention first.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-muted">
              Connect the systems you care about, set structural focus once, and
              let lightweight learning fine-tune the queue over time.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onBack && (
              <Button variant="secondary" size="sm" onClick={onBack}>
                Back to Home
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={() => void completeOnboarding()}>
              Finish setup
            </Button>
          </div>
        </div>

        <div className="relative mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-[var(--bg-card-border)] bg-black/10 p-4">
            <div className="text-[10px] uppercase tracking-[0.22em] text-text-muted">
              Step 1
            </div>
            <div className="mt-2 text-lg font-semibold text-text-heading">
              Connect your systems
            </div>
            <p className="mt-2 text-sm text-text-muted">
              {connectedCount} of {services.length} services connected.
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--bg-card-border)] bg-black/10 p-4">
            <div className="text-[10px] uppercase tracking-[0.22em] text-text-muted">
              Step 2
            </div>
            <div className="mt-2 text-lg font-semibold text-text-heading">
              Define focus
            </div>
            <p className="mt-2 text-sm text-text-muted">
              {(profile?.focusPreferences ?? []).length} structural focus rule
              {(profile?.focusPreferences ?? []).length === 1 ? "" : "s"} saved.
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--bg-card-border)] bg-black/10 p-4">
            <div className="text-[10px] uppercase tracking-[0.22em] text-text-muted">
              Step 3
            </div>
            <div className="mt-2 text-lg font-semibold text-text-heading">
              Review learning
            </div>
            <p className="mt-2 text-sm text-text-muted">
              Feedback stays conservative and never overrides explicit focus.
            </p>
          </div>
        </div>
      </section>

      <section className="glass-card anim-card overflow-hidden" style={{ animationDelay: "120ms" }}>
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--bg-card-border)] pb-4">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSetupTab(tab.id)}
              className={cn(
                "rounded-2xl px-4 py-2 text-sm font-medium transition-colors",
                setupTab === tab.id
                  ? "bg-[var(--tab-active-bg)] text-text-heading"
                  : "text-text-muted hover:text-text-body"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {profileError && (
          <div className="px-5 pt-5">
            <FocusStatusCard
              title="Focus preferences are unavailable"
              body={`${profileError} You can still browse connected providers, but saved focus rules and previews may be incomplete until preferences load again.`}
              tone="warning"
              actionLabel="Retry preferences"
              onAction={() => void refreshProfile()}
            />
          </div>
        )}

        {setupTab === "connections" && (
          <div className="grid gap-5 pt-5 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-[24px] border border-[var(--bg-card-border)] bg-black/10 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-text-heading">
                    Connected services
                  </h2>
                  <p className="mt-1 text-sm text-text-muted">
                    Connect the sources that should appear in the command center.
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => void refreshServices()}>
                  Refresh
                </Button>
              </div>

              <div className="mt-5 space-y-3">
                {(servicesLoading ? [] : services).map((service) => (
                  <div
                    key={service.provider}
                    className="flex items-center justify-between rounded-2xl border border-[var(--bg-card-border)] bg-white/[0.03] p-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "h-2.5 w-2.5 rounded-full",
                            service.connected ? "bg-accent-green" : "bg-text-muted/40"
                          )}
                        />
                        <span className="text-sm font-medium text-text-heading">
                          {service.label}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-text-muted">
                        {service.connected
                          ? service.account_email || "Connected"
                          : service.description}
                      </div>
                    </div>
                    {!service.connected && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={connecting === service.provider}
                        onClick={() => void handleConnect(service.provider)}
                      >
                        {connecting === service.provider ? "Connecting..." : "Connect"}
                      </Button>
                    )}
                  </div>
                ))}
                {servicesLoading && (
                  <div className="rounded-2xl border border-[var(--bg-card-border)] bg-white/[0.03] p-5 text-sm text-text-muted">
                    Loading connected services...
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-[24px] border border-[var(--bg-card-border)] bg-black/10 p-5">
              <h2 className="text-lg font-semibold text-text-heading">
                What happens next
              </h2>
              <div className="mt-4 space-y-4 text-sm text-text-muted">
                <div className="rounded-2xl border border-[var(--bg-card-border)] bg-white/[0.03] p-4">
                  Once connected, those sources become available across Home and the
                  domain tabs.
                </div>
                <div className="rounded-2xl border border-[var(--bg-card-border)] bg-white/[0.03] p-4">
                  Focus rules tell the system which folders, projects, calendars,
                  and channels deserve structural priority.
                </div>
                <div className="rounded-2xl border border-[var(--bg-card-border)] bg-white/[0.03] p-4">
                  Learning only trims the edges. Your explicit focus rules remain the
                  steering wheel.
                </div>
              </div>
            </section>
          </div>
        )}

        {setupTab === "focus" && (
          <div className="grid gap-5 overflow-hidden pt-5 xl:grid-cols-[250px_minmax(0,1fr)_300px]">
            <section className="overflow-y-auto rounded-[24px] border border-[var(--bg-card-border)] bg-black/10 p-4">
              <div className="mb-4">
                <div className="text-[11px] uppercase tracking-[0.22em] text-text-muted">
                  Providers
                </div>
                <p className="mt-1 text-sm text-text-muted">
                  Start broad, then drill into the specific resources that matter.
                </p>
              </div>
              <div className="space-y-2">
                {focusProviders.length > 0 ? (
                  focusProviders.map((provider) => {
                    const explicitCount = (profile?.focusPreferences ?? []).filter(
                      (entry) => entry.provider === provider.provider
                    ).length;
                    return (
                      <button
                        key={provider.provider}
                        type="button"
                        onClick={() => setSelectedProvider(provider.provider)}
                        className={cn(
                          "w-full rounded-2xl border px-3 py-3 text-left transition-colors",
                          provider.provider === providerNode?.provider
                            ? "border-accent-amber/40 bg-[var(--tab-active-bg)]"
                            : "border-[var(--bg-card-border)] bg-white/[0.03] hover:bg-white/[0.06]"
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-text-heading">
                            {provider.label}
                          </span>
                          <span className="text-[10px] uppercase tracking-[0.18em] text-text-muted">
                            {provider.importance}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-text-muted">
                          {explicitCount > 0
                            ? `${explicitCount} saved focus rules`
                            : provider.description}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <FocusStatusCard
                    title="No supported providers yet"
                    body={
                      selectedFocusError?.message ||
                      "The focus map did not return any supported providers."
                    }
                    tone={selectedFocusError ? "error" : "default"}
                    actionLabel="Retry focus map"
                    onAction={retrySelectedProvider}
                  />
                )}
              </div>
            </section>

            <section className="flex min-h-0 flex-col overflow-hidden rounded-[24px] border border-[var(--bg-card-border)] bg-black/10">
              <div className="border-b border-[var(--bg-card-border)] px-5 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-text-heading">
                        {providerNode?.label ?? "Focus"}
                      </h2>
                      {focusMapLoading && focusProviders.length > 0 && (
                        <span className="rounded-full border border-[var(--bg-card-border)] bg-white/[0.04] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-text-muted">
                          Refreshing
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-text-muted">
                      Set the attention tier for the resources that matter most.
                    </p>
                  </div>
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search folders, projects, teams..."
                    className="h-10 w-full rounded-2xl border border-[var(--bg-card-border)] bg-white/[0.04] px-3 text-sm text-text-heading outline-none placeholder:text-text-muted lg:w-72"
                  />
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                <div className="space-y-4">
                  {focusActionError && (
                    <FocusStatusCard
                      title="Channels could not be loaded"
                      body={focusActionError}
                      tone="error"
                      actionLabel={teamRetryNodeId ? "Retry loading channels" : "Retry"}
                      onAction={
                        teamRetryNodeId ? retryTeamChannels : retrySelectedProvider
                      }
                    />
                  )}

                  {selectedFocusError && !focusActionError && (
                    <FocusStatusCard
                      title="Focus map could not be refreshed"
                      body={`${selectedFocusError.message} The last successful provider map will stay visible until the next refresh works.`}
                      tone="error"
                      actionLabel="Retry provider"
                      onAction={retrySelectedProvider}
                    />
                  )}

                  {selectedWarnings.map((warning) => (
                    <FocusStatusCard
                      key={`${warning.provider ?? "global"}-${warning.code}-${warning.scope ?? "all"}`}
                      title={
                        warning.provider
                          ? `${providerNode?.label ?? "Focus"} warning`
                          : "Focus setup warning"
                      }
                      body={warning.message}
                      tone="warning"
                      actionLabel="Retry provider"
                      onAction={retrySelectedProvider}
                    />
                  ))}

                  {showInitialFocusLoading ? (
                    <FocusStatusCard
                      title="Loading focus map"
                      body="Discovering your supported providers and their available resources."
                    />
                  ) : !providerNode ? (
                    <FocusStatusCard
                      title="No provider selected"
                      body="Choose a supported provider from the left to start shaping what rises and fades."
                    />
                  ) : !providerNode.connected ? (
                    <FocusStatusCard
                      title={`${providerNode.label} is not connected`}
                      body={`Connect ${PROVIDER_CONNECTION_LABELS[providerNode.provider]} in the Connections tab to load its folders, boards, teams, or channels here.`}
                      actionLabel="Open Connections"
                      onAction={() => setSetupTab("connections")}
                    />
                  ) : isSearching && filteredNodes.length === 0 ? (
                    <FocusStatusCard
                      title="No matching resources"
                      body={`No ${providerNode.label} resources match "${search.trim()}". Try a broader search.`}
                    />
                  ) : !hasProviderInventory ? (
                    <FocusStatusCard
                      title={`No ${providerNode.label} resources discovered yet`}
                      body={`This provider is connected, but no drill-down resources are available yet. Refresh the provider inventory or reconnect it from the Connections tab.`}
                      tone={selectedWarnings.length > 0 ? "warning" : "default"}
                      actionLabel="Refresh provider"
                      onAction={retrySelectedProvider}
                    />
                  ) : (
                    <FocusTree
                      nodes={filteredNodes}
                      pendingNodeId={pendingNodeId}
                      onSelectNode={(node) => void handleSelectNode(node)}
                      onChangeImportance={(node, next) =>
                        void handleChangeImportance(node, next)
                      }
                    />
                  )}
                </div>
              </div>
            </section>

            <section className="overflow-y-auto rounded-[24px] border border-[var(--bg-card-border)] bg-black/10 p-5">
              <h2 className="text-lg font-semibold text-text-heading">
                Live preview
              </h2>
              <p className="mt-1 text-sm text-text-muted">
                This is the current structural focus profile that will drive
                default surfacing and fetch priority.
              </p>

              <div className="mt-5 space-y-5">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-accent-green">
                    What will rise
                  </div>
                  <div className="mt-3 space-y-2">
                    {profileLoading && !profile ? (
                      <div className="rounded-2xl border border-[var(--bg-card-border)] bg-white/[0.03] px-3 py-3 text-sm text-text-muted">
                        Loading saved focus rules...
                      </div>
                    ) : preview.rise.length > 0 ? (
                      preview.rise.map((record) => (
                        <div
                          key={record.key}
                          className="rounded-2xl border border-accent-green/20 bg-accent-green/10 px-3 py-3 text-sm text-text-body"
                        >
                          <div className="font-medium text-text-heading">
                            {record.label}
                          </div>
                          <div className="mt-1 text-xs text-text-muted">
                            {record.provider} · {record.entityType}
                            {record.assumed ? " · assumed default" : ""}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-[var(--bg-card-border)] bg-white/[0.03] px-3 py-3 text-sm text-text-muted">
                        No critical focus rules yet.
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-accent-red">
                    What will fade
                  </div>
                  <div className="mt-3 space-y-2">
                    {profileLoading && !profile ? (
                      <div className="rounded-2xl border border-[var(--bg-card-border)] bg-white/[0.03] px-3 py-3 text-sm text-text-muted">
                        Loading saved focus rules...
                      </div>
                    ) : preview.fade.length > 0 ? (
                      preview.fade.map((record) => (
                        <div
                          key={record.key}
                          className="rounded-2xl border border-accent-red/20 bg-accent-red/10 px-3 py-3 text-sm text-text-body"
                        >
                          <div className="font-medium text-text-heading">
                            {record.label}
                          </div>
                          <div className="mt-1 text-xs text-text-muted">
                            {record.provider} · {record.importance}
                            {record.assumed ? " · assumed default" : ""}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-[var(--bg-card-border)] bg-white/[0.03] px-3 py-3 text-sm text-text-muted">
                        No quiet or muted rules yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {setupTab === "advanced" && (
          <div className="grid gap-5 pt-5 lg:grid-cols-[1fr_1fr]">
            <section className="rounded-[24px] border border-[var(--bg-card-border)] bg-black/10 p-5">
              <h2 className="text-lg font-semibold text-text-heading">
                Recent item feedback
              </h2>
              <p className="mt-1 text-sm text-text-muted">
                Raised, lowered, and right-level feedback is stored here so the
                system can learn conservatively over time.
              </p>

              <div className="mt-5 space-y-4">
                {(["raise", "right", "lower"] as AttentionFeedbackValue[]).map(
                  (feedback) => (
                    <div key={feedback}>
                      <div className="text-[11px] uppercase tracking-[0.22em] text-text-muted">
                        {FEEDBACK_LABELS[feedback]}
                      </div>
                      <div className="mt-2 space-y-2">
                        {feedbackStats[feedback].length > 0 ? (
                          feedbackStats[feedback].map((item) => (
                            <div
                              key={`${item.item_type}-${item.item_id}`}
                              className="rounded-2xl border border-[var(--bg-card-border)] bg-white/[0.03] px-3 py-3"
                            >
                              <div className="text-sm font-medium text-text-heading">
                                {item.title || item.item_id}
                              </div>
                              <div className="mt-1 text-xs text-text-muted">
                                {item.provider} · {item.surface}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-2xl border border-[var(--bg-card-border)] bg-white/[0.03] px-3 py-3 text-sm text-text-muted">
                            No {feedback} feedback yet.
                          </div>
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            </section>

            <section className="rounded-[24px] border border-[var(--bg-card-border)] bg-black/10 p-5">
              <h2 className="text-lg font-semibold text-text-heading">
                Bias snapshot
              </h2>
              <p className="mt-1 text-sm text-text-muted">
                Learned adjustments are intentionally small and should only trim
                around your explicit focus map.
              </p>

              <div className="mt-5 space-y-2">
                {feedbackStats.biases.length > 0 ? (
                  feedbackStats.biases.map((bias) => (
                    <div
                      key={`${bias.dimension_type}-${bias.dimension_key}`}
                      className="rounded-2xl border border-[var(--bg-card-border)] bg-white/[0.03] px-3 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-text-heading">
                            {bias.dimension_key}
                          </div>
                          <div className="mt-1 text-xs text-text-muted">
                            {bias.dimension_type} · {bias.sample_count} samples
                          </div>
                        </div>
                        <div
                          className={cn(
                            "rounded-full px-2.5 py-1 text-xs font-semibold",
                            bias.bias_score > 0
                              ? "bg-accent-green/15 text-accent-green"
                              : bias.bias_score < 0
                                ? "bg-accent-red/15 text-accent-red"
                                : "bg-white/10 text-text-muted"
                          )}
                        >
                          {bias.bias_score > 0 ? "+" : ""}
                          {bias.bias_score}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-[var(--bg-card-border)] bg-white/[0.03] px-3 py-3 text-sm text-text-muted">
                    No learned bias data yet.
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}

export function WorkspaceStudio() {
  return <SetupFocusView />;
}
