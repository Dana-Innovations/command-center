"use client";

import { Button } from "@/components/ui/button";
import { AttentionFeedbackControl } from "@/components/ui/AttentionFeedbackControl";
import { EmptyState } from "@/components/ui/EmptyState";
import { ServiceIcon } from "@/components/ui/ServiceIcon";
import { CollapsibleSection } from "./CollapsibleSection";
import type { TabId } from "@/lib/tab-config";
import type { CommunicationCardItem } from "./useHomeData";

function sourceLabel(item: CommunicationCardItem): string | null {
  if (item.kind === "chat") {
    if (item.subKind === "dm") return "DM";
    if (item.subKind === "group-chat") return "Group Chat";
    return "Teams";
  }
  if (item.kind === "asana") return "Comment";
  return null;
}

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

  return (
    <CollapsibleSection
      storageKey="home-comms-expanded"
      title="Communications Now"
      description="Threads, chats, and channels most likely to need you next."
      badge={filtered.length || null}
      animDelay={animDelay}
      action={
        <Button variant="ghost" size="sm" onClick={() => onNavigate("communications")}>
          View all in Comms
        </Button>
      }
    >
      {filtered.length === 0 ? (
        <EmptyState variant="all-clear" context="communications" />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map((item) => {
            const label = sourceLabel(item);
            const CardWrapper = item.url ? "a" : "div";
            const linkProps = item.url
              ? { href: item.url, target: "_blank" as const, rel: "noopener noreferrer" }
              : {};

            return (
              <CardWrapper
                key={item.id}
                {...linkProps}
                className="group block rounded-[20px] border border-[var(--bg-card-border)] bg-white/[0.03] p-4 transition-colors duration-200 hover:border-[var(--bg-card-hover-border)]"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    {/* Meta row: icon + source label + sender + time */}
                    <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                      <ServiceIcon kind={item.kind} size={14} className="shrink-0 opacity-70" />
                      {label && (
                        <>
                          <span className="font-medium text-text-body">{label}</span>
                          <span className="opacity-40">·</span>
                        </>
                      )}
                      <span className="truncate">{item.meta}</span>
                    </div>
                    {/* Title */}
                    <p className="mt-1.5 text-sm font-medium leading-snug text-text-heading group-hover:text-accent-amber transition-colors duration-200">
                      {item.title}
                    </p>
                    {/* Preview */}
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
          })}
        </div>
      )}
    </CollapsibleSection>
  );
}
