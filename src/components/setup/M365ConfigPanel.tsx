"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAttention } from "@/lib/attention/client";
import { ResourcePicker, type ResourceItem } from "./ResourcePicker";
import type { FocusNode } from "@/lib/attention/types";

interface M365ConfigPanelProps {
  onSave: (config: Record<string, unknown>) => Promise<void>;
  onSkip: () => void;
}

const LOW_SIGNAL_PATTERNS = [
  "newsletter",
  "automated",
  "rss",
  "junk",
  "spam",
  "deleted",
  "clutter",
];

function isLowSignal(label: string): boolean {
  const lower = label.toLowerCase();
  return LOW_SIGNAL_PATTERNS.some((pattern) => lower.includes(pattern));
}

function folderToResource(node: FocusNode): ResourceItem {
  const count = node.counts?.unread ?? node.counts?.total ?? 0;
  return {
    id: node.entityId,
    label: node.label,
    description: node.description,
    count,
    checked: count > 0 && !isLowSignal(node.label),
  };
}

function StepIndicator({ step, total }: { step: number; total: number }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1 flex-1 rounded-full transition-colors ${
            i < step ? "bg-accent-amber" : "bg-white/10"
          }`}
        />
      ))}
      <span className="ml-1 text-xs tabular-nums text-text-muted">
        {step}/{total}
      </span>
    </div>
  );
}

function TeamAccordion({
  team,
  channels,
  channelsLoading,
  selectedChannels,
  teamChecked,
  onToggleTeam: onTeamToggle,
  onToggleChannel: onChannelToggle,
  onExpand,
  expanded,
}: {
  team: FocusNode;
  channels: FocusNode[];
  channelsLoading: boolean;
  selectedChannels: Set<string>;
  teamChecked: boolean;
  onToggleTeam: (checked: boolean) => void;
  onToggleChannel: (channelId: string, checked: boolean) => void;
  onExpand: () => void;
  expanded: boolean;
}) {
  const channelCount = team.counts?.children ?? channels.length;

  return (
    <div className="border-b border-white/5 last:border-b-0">
      <div className="flex items-center gap-3 px-3 py-2 transition-colors hover:bg-white/5">
        <input
          type="checkbox"
          checked={teamChecked}
          onChange={(e) => onTeamToggle(e.target.checked)}
          className="h-4 w-4 shrink-0 rounded accent-[var(--accent-amber)]"
        />
        <button
          type="button"
          onClick={onExpand}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="truncate text-sm text-text-body">{team.label}</span>
          {channelCount > 0 && (
            <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs tabular-nums text-text-muted">
              {channelCount}
            </span>
          )}
          <svg
            width={12}
            height={12}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`ml-auto shrink-0 text-text-muted transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className="border-t border-white/5 bg-white/[0.02] pl-6">
          {channelsLoading ? (
            <div className="flex items-center gap-2 px-3 py-3">
              <svg
                className="h-4 w-4 animate-spin text-text-muted"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  cx={12}
                  cy={12}
                  r={10}
                  stroke="currentColor"
                  strokeWidth={3}
                  strokeDasharray="60 30"
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-xs text-text-muted">Loading channels...</span>
            </div>
          ) : channels.length === 0 ? (
            <p className="px-3 py-3 text-xs text-text-muted">No channels found.</p>
          ) : (
            channels.map((ch) => (
              <label
                key={ch.entityId}
                className="flex cursor-pointer items-center gap-3 px-3 py-1.5 transition-colors hover:bg-white/5"
              >
                <input
                  type="checkbox"
                  checked={selectedChannels.has(ch.entityId)}
                  onChange={(e) => onChannelToggle(ch.entityId, e.target.checked)}
                  className="h-3.5 w-3.5 shrink-0 rounded accent-[var(--accent-amber)]"
                />
                <span className="truncate text-xs text-text-body">{ch.label}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function M365ConfigPanel({ onSave, onSkip }: M365ConfigPanelProps) {
  const { focusProviders, focusMapLoading, ensureTeamChannels } = useAttention();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // --- Step 1: Folders ---
  const mailFolders = useMemo(() => {
    const mailProvider = focusProviders.find((n) => n.provider === "outlook_mail");
    const mailRoot = mailProvider?.children?.find(
      (n) => n.entityType === "mail_root"
    );
    return mailRoot?.children ?? [];
  }, [focusProviders]);

  const [folderItems, setFolderItems] = useState<ResourceItem[]>([]);

  useEffect(() => {
    if (mailFolders.length > 0 && folderItems.length === 0) {
      setFolderItems(mailFolders.map(folderToResource));
    }
  }, [mailFolders, folderItems.length]);

  const handleFolderChange = useCallback((id: string, checked: boolean) => {
    setFolderItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, checked } : item))
    );
  }, []);

  const handleFolderSelectAll = useCallback(() => {
    setFolderItems((prev) => prev.map((item) => ({ ...item, checked: true })));
  }, []);

  const handleFolderDeselectAll = useCallback(() => {
    setFolderItems((prev) => prev.map((item) => ({ ...item, checked: false })));
  }, []);

  // --- Step 2: Teams ---
  const teams = useMemo(() => {
    const teamsProvider = focusProviders.find((n) => n.provider === "teams");
    return teamsProvider?.children ?? [];
  }, [focusProviders]);

  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [loadingTeam, setLoadingTeam] = useState<string | null>(null);
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());
  const [selectedChannels, setSelectedChannels] = useState<Map<string, Set<string>>>(
    new Map()
  );

  // Pre-select teams that have children
  useEffect(() => {
    if (teams.length > 0 && selectedTeams.size === 0) {
      const withChildren = new Set(
        teams
          .filter((t) => t.children && t.children.length > 0)
          .map((t) => t.entityId)
      );
      // If none have children yet, select all
      setSelectedTeams(
        withChildren.size > 0
          ? withChildren
          : new Set(teams.map((t) => t.entityId))
      );
    }
  }, [teams, selectedTeams.size]);

  const handleExpandTeam = useCallback(
    async (teamId: string) => {
      if (expandedTeam === teamId) {
        setExpandedTeam(null);
        return;
      }
      setExpandedTeam(teamId);
      setLoadingTeam(teamId);
      try {
        await ensureTeamChannels(teamId);
      } finally {
        setLoadingTeam(null);
      }
    },
    [expandedTeam, ensureTeamChannels]
  );

  const handleToggleTeam = useCallback(
    (teamId: string, checked: boolean) => {
      setSelectedTeams((prev) => {
        const next = new Set(prev);
        if (checked) {
          next.add(teamId);
        } else {
          next.delete(teamId);
        }
        return next;
      });

      // When unchecking a team, clear its channels
      if (!checked) {
        setSelectedChannels((prev) => {
          const next = new Map(prev);
          next.delete(teamId);
          return next;
        });
      }
    },
    []
  );

  const handleToggleChannel = useCallback(
    (teamId: string, channelId: string, checked: boolean) => {
      setSelectedChannels((prev) => {
        const next = new Map(prev);
        const teamSet = new Set(next.get(teamId) ?? []);
        if (checked) {
          teamSet.add(channelId);
        } else {
          teamSet.delete(channelId);
        }
        next.set(teamId, teamSet);
        return next;
      });
    },
    []
  );

  // Build teams config for save
  const buildTeamsConfig = useCallback(() => {
    const teamsConfig: Record<string, string[]> = {};
    for (const teamId of selectedTeams) {
      const channelSet = selectedChannels.get(teamId);
      teamsConfig[teamId] = channelSet ? Array.from(channelSet) : [];
    }
    return teamsConfig;
  }, [selectedTeams, selectedChannels]);

  // --- Save ---
  const handleDone = useCallback(async () => {
    setSaving(true);
    try {
      const selectedFolderIds = folderItems
        .filter((item) => item.checked)
        .map((item) => item.id);

      await onSave({
        folders: selectedFolderIds,
        teams: buildTeamsConfig(),
      });
    } finally {
      setSaving(false);
    }
  }, [folderItems, buildTeamsConfig, onSave]);

  return (
    <div className="p-4">
      <StepIndicator step={step} total={3} />

      {/* Step 1: Email Folders */}
      {step === 1 && (
        <>
          <ResourcePicker
            title="Email Folders"
            items={folderItems}
            onChange={handleFolderChange}
            onSelectAll={handleFolderSelectAll}
            onDeselectAll={handleFolderDeselectAll}
            loading={focusMapLoading && mailFolders.length === 0}
            emptyMessage="No mail folders found. Connect Microsoft 365 first."
          />
          <div className="mt-4 flex justify-between">
            <button
              type="button"
              onClick={onSkip}
              className="text-xs text-text-muted hover:text-text-body transition-colors"
            >
              Skip all
            </button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setStep(2)}
            >
              Next
            </Button>
          </div>
        </>
      )}

      {/* Step 2: Teams & Channels */}
      {step === 2 && (
        <>
          <p className="mb-2 text-xs font-medium text-text-muted">
            Teams & Channels
          </p>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-white/5">
            {teams.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-text-muted">
                {focusMapLoading
                  ? "Loading teams..."
                  : "No teams found."}
              </p>
            ) : (
              teams.map((team) => {
                const channels = team.children ?? [];
                return (
                  <TeamAccordion
                    key={team.entityId}
                    team={team}
                    channels={channels}
                    channelsLoading={loadingTeam === team.entityId}
                    selectedChannels={
                      selectedChannels.get(team.entityId) ?? new Set()
                    }
                    teamChecked={selectedTeams.has(team.entityId)}
                    onToggleTeam={(checked) =>
                      handleToggleTeam(team.entityId, checked)
                    }
                    onToggleChannel={(channelId, checked) =>
                      handleToggleChannel(team.entityId, channelId, checked)
                    }
                    onExpand={() => void handleExpandTeam(team.entityId)}
                    expanded={expandedTeam === team.entityId}
                  />
                );
              })
            )}
          </div>
          <div className="mt-4 flex justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep(1)}
            >
              Back
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setStep(3)}
            >
              Next
            </Button>
          </div>
        </>
      )}

      {/* Step 3: Conversations (placeholder) */}
      {step === 3 && (
        <>
          <p className="mb-2 text-xs font-medium text-text-muted">
            Conversations
          </p>
          <div className="rounded-lg border border-white/5 px-4 py-6 text-center">
            <p className="text-sm text-text-body">
              Your conversations will be surfaced automatically based on activity.
            </p>
            <p className="mt-1 text-xs text-text-muted">
              DM and group chat configuration is coming soon.
            </p>
          </div>
          <div className="mt-4 flex justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep(2)}
            >
              Back
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleDone}
              disabled={saving}
            >
              {saving ? "Saving..." : "Done"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
