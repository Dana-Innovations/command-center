"use client";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { PriorityItem } from "@/lib/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { SlackIcon } from "@/components/ui/icons";

function SourceIcon({ source }: { source: PriorityItem["source"] }) {
  if (source === "email") return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
  if (source === "teams") return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
  if (source === "slack") return <SlackIcon size={14} />;
  if (source === "asana") return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="6" r="4" /><circle cx="5" cy="17" r="4" /><circle cx="19" cy="17" r="4" />
    </svg>
  );
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
    </svg>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? "text-red-400 bg-red-400/10 border-red-400/20"
    : score >= 60 ? "text-amber-400 bg-amber-400/10 border-amber-400/20"
    : score >= 40 ? "text-teal-400 bg-teal-400/10 border-teal-400/20"
    : "text-text-muted bg-white/5 border-white/10";
  return (
    <span className={cn("text-xs font-bold tabular-nums w-8 text-center rounded border px-1 py-0.5 shrink-0", color)}>
      {score}
    </span>
  );
}

function SignalPills({ item }: { item: PriorityItem & { displayScore?: number } }) {
  const pills: { label: string; color: string }[] = [];
  if (item.urgent)                pills.push({ label: "Urgent", color: "text-red-400 bg-red-400/10" });
  if (item.legal)                 pills.push({ label: "Legal", color: "text-purple-400 bg-purple-400/10" });
  if (item.financial)             pills.push({ label: "Financial", color: "text-amber-400 bg-amber-400/10" });
  if (item.daysOverdue > 0)       pills.push({ label: `${item.daysOverdue}d overdue`, color: "text-red-300 bg-red-300/10" });
  if (item.hardDeadlineWithin7)   pills.push({ label: "Due soon", color: "text-amber-300 bg-amber-300/10" });
  if (item.multiplePeopleWaiting) pills.push({ label: "Team thread", color: "text-blue-300 bg-blue-300/10" });
  if (item.needsReply && !item.urgent) pills.push({ label: "Unread", color: "text-text-muted bg-white/5" });

  if (pills.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-0.5">
      {pills.slice(0, 2).map(p => (
        <span key={p.label} className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", p.color)}>
          {p.label}
        </span>
      ))}
    </div>
  );
}

interface PriorityEngineProps {
  items?: (PriorityItem & { displayScore?: number })[];
  onJeana?: (title: string, context: string) => void;
}

export function PriorityEngine({ items = [], onJeana }: PriorityEngineProps) {
  const [filter, setFilter] = useState<"all" | "email" | "asana" | "teams">("all");
  const [doneItems, setDoneItems] = useState<Set<string>>(new Set());

  const filtered = useMemo(() =>
    items
      .filter(i => !doneItems.has(i.title))
      .filter(i => filter === "all" || i.source === filter)
      .slice(0, 15),
    [items, filter, doneItems]
  );

  const counts = useMemo(() => ({
    email: items.filter(i => i.source === "email").length,
    asana: items.filter(i => i.source === "asana").length,
    teams: items.filter(i => i.source === "teams").length,
  }), [items]);

  return (
    <section className="glass-card anim-card flex flex-col" style={{ animationDelay: "80ms" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text-heading">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          Priority Queue
          <span className="text-xs font-normal text-text-muted">({items.length})</span>
        </h2>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-3">
        {([["all", "All"], ["email", `Email ${counts.email}`], ["asana", `Tasks ${counts.asana}`], ["teams", `Teams ${counts.teams}`]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              "text-xs px-2.5 py-1 rounded-lg transition-all cursor-pointer",
              filter === key
                ? "bg-accent-amber text-[#0d0d0d] font-semibold"
                : "text-text-muted hover:text-text-heading bg-white/5 hover:bg-white/10"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-0 divide-y divide-[var(--bg-card-border)] overflow-y-auto" style={{ maxHeight: 480 }}>
          {filtered.map((item) => (
            <div key={item.title} className="group flex items-start gap-3 py-3">
              <ScoreBadge score={item.displayScore ?? 0} />
              <span className="shrink-0 text-text-muted mt-0.5">
                <SourceIcon source={item.source} />
              </span>
              <div className="min-w-0 flex-1">
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-text-heading hover:text-accent-amber transition-colors line-clamp-2 leading-snug">
                    {item.title}
                  </a>
                ) : (
                  <div className="text-sm text-text-heading line-clamp-2 leading-snug">{item.title}</div>
                )}
                {/* Sender / source subtitle */}
                {(item as {sender?: string}).sender && (
                  <div className="text-xs text-text-muted mt-0.5 truncate">
                    {(item as {sender?: string}).sender}
                  </div>
                )}
                <SignalPills item={item} />
              </div>
              {/* Action buttons — only visible on row hover */}
              <div className="flex items-center gap-1 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {item.source === "asana" && (
                  <button
                    className="text-xs px-2 py-1 rounded-md hover:bg-teal-400/20 text-text-muted hover:text-teal-400 transition-colors cursor-pointer"
                    onClick={() => setDoneItems(prev => new Set(prev).add(item.title))}
                  >
                    Done
                  </button>
                )}
                <button
                  className="text-xs px-2 py-1 rounded-md hover:bg-amber-400/10 text-text-muted hover:text-amber-400 transition-colors cursor-pointer"
                  onClick={() => onJeana?.(item.title, item.source)}
                >
                  Jeana
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
