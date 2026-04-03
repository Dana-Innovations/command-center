"use client";

import { useEffect } from "react";
import type { DeltaGroup, DeltaItem } from "@/lib/delta-snapshot";

/* ── Service icons ── */

function ServiceGroupIcon({ service }: { service: DeltaGroup["service"] }) {
  const size = 16;
  switch (service) {
    case "emails":
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
          <rect x="1" y="3" width="14" height="10" rx="2" stroke="#0078d4" strokeWidth="1.3" />
          <path d="M1.5 4.5L8 9L14.5 4.5" stroke="#0078d4" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "calendar":
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
          <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="#d4a44c" strokeWidth="1.3" />
          <path d="M5 1.5v3M11 1.5v3M2 7h12" stroke="#d4a44c" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    case "tasks":
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="4.5" r="2.5" stroke="#f06a6a" strokeWidth="1.3" />
          <circle cx="4" cy="10.5" r="2.5" stroke="#f06a6a" strokeWidth="1.3" />
          <circle cx="12" cy="10.5" r="2.5" stroke="#f06a6a" strokeWidth="1.3" />
        </svg>
      );
    case "chats":
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
          <path d="M2.5 2.5h11a1.5 1.5 0 011.5 1.5v6a1.5 1.5 0 01-1.5 1.5H9l-3 2.5v-2.5H2.5A1.5 1.5 0 011 10V4a1.5 1.5 0 011.5-1.5z" stroke="#6264a7" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      );
    case "slack":
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
          <path d="M3.5 9.5a1.25 1.25 0 110-2.5h3.25v2.5a1.25 1.25 0 01-1.25 1.25H3.5z" stroke="#4a154b" strokeWidth="1.1" />
          <path d="M12.5 6.5a1.25 1.25 0 110 2.5H9.25V6.5a1.25 1.25 0 011.25-1.25h2z" stroke="#4a154b" strokeWidth="1.1" />
          <path d="M6.5 3.5a1.25 1.25 0 112.5 0v3.25H6.5a1.25 1.25 0 01-1.25-1.25v-2z" stroke="#4a154b" strokeWidth="1.1" />
          <path d="M9.5 12.5a1.25 1.25 0 11-2.5 0V9.25H9.5a1.25 1.25 0 011.25 1.25v2z" stroke="#4a154b" strokeWidth="1.1" />
        </svg>
      );
    case "salesforce":
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
          <path d="M3 12l2-4 3 2 3-5 2 3" stroke="#3fb950" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M2 13h12" stroke="#3fb950" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
  }
}

/* ── Change type badges ── */

const changeTypeConfig: Record<DeltaItem["changeType"], { label: string; color: string }> = {
  new: { label: "New", color: "text-accent-teal" },
  updated: { label: "Updated", color: "text-accent-amber" },
  completed: { label: "Completed", color: "text-accent-green" },
  stage_change: { label: "Stage change", color: "text-accent-green" },
};

/* ── Relative time formatting ── */

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/* ── Service badge colors ── */

const serviceBadgeColors: Record<DeltaGroup["service"], string> = {
  emails: "bg-[#0078d4]/15 text-[#0078d4]",
  calendar: "bg-accent-amber/15 text-accent-amber",
  tasks: "bg-[#f06a6a]/15 text-[#f06a6a]",
  chats: "bg-[#6264a7]/15 text-[#6264a7]",
  slack: "bg-[#4a154b]/15 text-[#a371f7]",
  salesforce: "bg-accent-green/15 text-accent-green",
};

/* ── Panel ── */

interface DeltaFeedPanelProps {
  isOpen: boolean;
  onClose: () => void;
  groups: DeltaGroup[];
  totalChanges: number;
  lastSeenAt: Date | null;
  onAcknowledge: () => void;
}

export function DeltaFeedPanel({
  isOpen,
  onClose,
  groups,
  totalChanges,
  lastSeenAt,
  onAcknowledge,
}: DeltaFeedPanelProps) {
  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const summaryParts = groups.map(
    (g) => `${g.count} ${g.label.toLowerCase()}`
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-md bg-[var(--bg-main)] border-l border-[var(--bg-card-border)] overflow-y-auto animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[var(--bg-main)] border-b border-[var(--bg-card-border)] px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[15px] font-semibold text-text-heading">
                What Changed
              </h2>
              {lastSeenAt && (
                <div className="text-[11px] text-text-muted mt-0.5">
                  Since {relativeTime(lastSeenAt)}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text-body transition-colors p-1"
              aria-label="Close"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M2 2l14 14M16 2L2 16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Summary bar */}
        <div className="px-5 py-3 bg-accent-teal/[0.04] border-b border-[var(--bg-card-border)]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[11px] font-medium text-accent-teal">
              {totalChanges} {totalChanges === 1 ? "change" : "changes"} total
            </span>
            <span className="text-[11px] text-text-muted">
              {summaryParts.join(" \u00B7 ")}
            </span>
          </div>
        </div>

        {/* Groups */}
        <div className="divide-y divide-[var(--bg-card-border)]">
          {groups.map((group) => (
            <div key={group.service} className="px-5 py-4">
              {/* Group header */}
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 flex items-center justify-center rounded-md bg-white/5">
                  <ServiceGroupIcon service={group.service} />
                </div>
                <span className="text-xs font-semibold text-text-heading">
                  {group.label}
                </span>
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${serviceBadgeColors[group.service]}`}
                >
                  {group.count} {group.count === 1 ? "change" : "changes"}
                </span>
              </div>

              {/* Items */}
              {group.items.length > 0 ? (
                <div className="flex flex-col gap-2 pl-7">
                  {group.items.slice(0, 5).map((item) => {
                    const cfg = changeTypeConfig[item.changeType];
                    return (
                      <div key={item.id} className="text-xs leading-relaxed">
                        <span className={`font-medium ${cfg.color}`}>
                          {cfg.label}:
                        </span>{" "}
                        <span className="text-text-body">{item.title}</span>
                        {item.detail && (
                          <span className="text-text-muted">
                            {" "}
                            &mdash; {item.detail}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {group.items.length > 5 && (
                    <div className="text-[11px] text-text-muted italic">
                      +{group.items.length - 5} more
                    </div>
                  )}
                </div>
              ) : (
                <div className="pl-7 text-[11px] text-text-muted italic">
                  {group.count} {group.count === 1 ? "item" : "items"} synced
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Empty state */}
        {groups.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-text-muted">
              No changes since your last visit.
            </p>
          </div>
        )}

        {/* Footer */}
        {groups.length > 0 && (
          <div className="sticky bottom-0 bg-[var(--bg-main)] border-t border-[var(--bg-card-border)] px-5 py-4 flex justify-center">
            <button
              onClick={() => {
                onAcknowledge();
                onClose();
              }}
              className="rounded-lg bg-white/[0.06] px-5 py-2.5 text-xs font-medium text-text-muted hover:bg-white/10 hover:text-text-body transition-colors"
            >
              Mark all as seen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
