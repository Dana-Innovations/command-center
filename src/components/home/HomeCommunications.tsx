"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { AttentionFeedbackControl } from "@/components/ui/AttentionFeedbackControl";
import { EmptyState } from "@/components/ui/EmptyState";
import { ServiceIcon } from "@/components/ui/ServiceIcon";
import { CollapsibleSection } from "./CollapsibleSection";
import type { TabId } from "@/lib/tab-config";
import type { CommunicationCardItem } from "./useHomeData";

/* ── Helpers ── */

function sourceLabel(item: CommunicationCardItem): string | null {
  if (item.kind === "chat") {
    if (item.subKind === "dm") return "DM";
    if (item.subKind === "group-chat") return "Group Chat";
    return "Teams";
  }
  if (item.kind === "asana") return "Comment";
  return null;
}

function agingLabel(item: CommunicationCardItem): string | null {
  const ageMs = Date.now() - item.timestamp;
  const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
  if (ageDays <= 0) return null;
  return ageDays === 1 ? "aging 1 day" : `aging ${ageDays} days`;
}

function heatIntensity(score: number, base: number, range: number): number {
  return Math.min(1, Math.max(0, (score - base) / range));
}

/* ── Tier Components ── */

function ActNowCard({ item }: { item: CommunicationCardItem }) {
  const intensity = heatIntensity(item.score, 60, 40);
  const CardWrapper = item.url ? "a" : "div";
  const linkProps = item.url
    ? { href: item.url, target: "_blank" as const, rel: "noopener noreferrer" }
    : {};

  return (
    <CardWrapper
      {...linkProps}
      className="group block rounded-[20px] border border-[var(--bg-card-border)] bg-white/[0.03] p-4 transition-colors duration-200 hover:border-[var(--bg-card-hover-border)]"
      style={{ borderLeftWidth: 3, borderLeftColor: `rgba(212, 164, 76, ${0.3 + intensity * 0.7})` }}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
            <ServiceIcon kind={item.kind} size={14} className="shrink-0 opacity-70" />
            {sourceLabel(item) && (
              <>
                <span className="font-medium text-text-body">{sourceLabel(item)}</span>
                <span className="opacity-40">&middot;</span>
              </>
            )}
            <span className="truncate">{item.meta}</span>
          </div>
          <p className="mt-1.5 text-sm font-semibold leading-snug text-text-heading group-hover:text-accent-amber transition-colors duration-200">
            {item.title}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-text-muted">
            {item.preview}
          </p>
        </div>
        <AttentionFeedbackControl
          target={item.attentionTarget as Parameters<typeof AttentionFeedbackControl>[0]["target"]}
          surface="home"
          compact
        />
      </div>
    </CardWrapper>
  );
}

function FollowUpCard({ item }: { item: CommunicationCardItem }) {
  const intensity = heatIntensity(item.score, 30, 40);
  const age = agingLabel(item);
  const CardWrapper = item.url ? "a" : "div";
  const linkProps = item.url
    ? { href: item.url, target: "_blank" as const, rel: "noopener noreferrer" }
    : {};

  return (
    <CardWrapper
      {...linkProps}
      className="group block rounded-[20px] border border-[var(--bg-card-border)] bg-white/[0.03] p-4 transition-colors duration-200 hover:border-[var(--bg-card-hover-border)]"
      style={{ borderLeftWidth: 3, borderLeftColor: `rgba(0, 178, 169, ${0.3 + intensity * 0.7})` }}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
            <ServiceIcon kind={item.kind} size={14} className="shrink-0 opacity-70" />
            {sourceLabel(item) && (
              <>
                <span className="font-medium text-text-body">{sourceLabel(item)}</span>
                <span className="opacity-40">&middot;</span>
              </>
            )}
            <span className="truncate">{item.meta}</span>
          </div>
          <p className="mt-1.5 text-sm font-medium leading-snug text-text-heading group-hover:text-accent-amber transition-colors duration-200">
            {item.title}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-text-muted">
            {item.preview}
          </p>
          {age && (
            <span className="mt-1.5 inline-block text-[10px] font-medium text-accent-teal">
              {age}
            </span>
          )}
        </div>
        <AttentionFeedbackControl
          target={item.attentionTarget as Parameters<typeof AttentionFeedbackControl>[0]["target"]}
          surface="home"
          compact
        />
      </div>
    </CardWrapper>
  );
}

function AwareRow({ item }: { item: CommunicationCardItem }) {
  const label = sourceLabel(item);
  const CardWrapper = item.url ? "a" : "div";
  const linkProps = item.url
    ? { href: item.url, target: "_blank" as const, rel: "noopener noreferrer" }
    : {};

  return (
    <CardWrapper
      {...linkProps}
      className="group flex items-center gap-2 rounded-xl px-3 py-2 transition-colors duration-150 hover:bg-white/[0.04]"
    >
      <ServiceIcon kind={item.kind} size={13} className="shrink-0 opacity-50" />
      {label && (
        <span className="text-[10px] font-medium text-text-muted shrink-0">{label}</span>
      )}
      <span className="text-[11px] text-text-muted shrink-0">{item.meta.split(" · ")[0]}</span>
      <span className="text-[11px] text-text-muted opacity-40 shrink-0">&middot;</span>
      <span className="text-[12px] text-text-body truncate">{item.title}</span>
    </CardWrapper>
  );
}

function TierHeader({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: "amber" | "teal" | "muted";
}) {
  const colorClass =
    color === "amber"
      ? "text-accent-amber"
      : color === "teal"
        ? "text-accent-teal"
        : "text-text-muted";

  return (
    <div className="flex items-center gap-2 mb-3">
      <span
        className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${colorClass}`}
      >
        {label}
      </span>
      <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] tabular-nums text-text-muted">
        {count}
      </span>
    </div>
  );
}

/* ── Main Component ── */

interface HomeCommunicationsProps {
  items: CommunicationCardItem[];
  heroItemIds: Set<string>;
  onNavigate: (tab: TabId) => void;
  animDelay?: number;
}

export function HomeCommunications({
  items,
  heroItemIds,
  onNavigate,
  animDelay = 160,
}: HomeCommunicationsProps) {
  const filtered = items.filter((item) => !heroItemIds.has(item.id));

  const { actNow, followUp, aware } = useMemo(() => {
    const actNow: CommunicationCardItem[] = [];
    const followUp: CommunicationCardItem[] = [];
    const aware: CommunicationCardItem[] = [];

    for (const item of filtered) {
      if (item.tier === "act-now") actNow.push(item);
      else if (item.tier === "follow-up") followUp.push(item);
      else aware.push(item);
    }

    return {
      actNow: actNow.slice(0, 3),
      followUp: followUp.slice(0, 4),
      aware: aware.slice(0, 5),
    };
  }, [filtered]);

  const totalCount = actNow.length + followUp.length + aware.length;

  return (
    <CollapsibleSection
      storageKey="home-comms-expanded"
      title="Communications"
      description="Prioritized across all your tools."
      badge={totalCount || null}
      animDelay={animDelay}
      action={
        <Button variant="ghost" size="sm" onClick={() => onNavigate("communications")}>
          View all in Comms
        </Button>
      }
    >
      {totalCount === 0 ? (
        <EmptyState variant="all-clear" context="communications" />
      ) : (
        <div className="space-y-6">
          {/* Act Now Tier */}
          {actNow.length > 0 ? (
            <div>
              <TierHeader label="Act Now" count={actNow.length} color="amber" />
              <div className="grid gap-3 lg:grid-cols-2">
                {actNow.map((item) => (
                  <ActNowCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          ) : (followUp.length > 0 || aware.length > 0) ? (
            <div className="rounded-xl border border-dashed border-accent-green/20 bg-accent-green/[0.03] px-4 py-3 text-center">
              <span className="text-xs text-accent-green">Nothing urgent right now</span>
            </div>
          ) : null}

          {/* Follow Up Tier */}
          {followUp.length > 0 && (
            <div>
              <TierHeader label="Follow Up" count={followUp.length} color="teal" />
              <div className="grid gap-3 lg:grid-cols-2">
                {followUp.map((item) => (
                  <FollowUpCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          )}

          {/* Stay Aware Tier */}
          {aware.length > 0 && (
            <div>
              <TierHeader label="Stay Aware" count={aware.length} color="muted" />
              <div className="space-y-0.5">
                {aware.map((item) => (
                  <AwareRow key={item.id} item={item} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </CollapsibleSection>
  );
}
