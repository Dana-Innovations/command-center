"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";

interface TouchpointItem {
  ch: "email" | "teams" | "asana" | "slack";
  text: string;
  url: string;
  draft: string;
}

interface Person {
  name: string;
  urgency: "red" | "amber" | "teal" | "gray";
  touchpoints: number;
  items: TouchpointItem[];
  action: string;
}


const URGENCY_BORDERS: Record<string, string> = {
  red: "border-l-4 border-l-accent-red",
  amber: "border-l-4 border-l-accent-amber",
  teal: "border-l-4 border-l-accent-teal",
  gray: "border-l-4 border-l-[#555]",
};

const CH_LABEL_CLASSES: Record<string, string> = {
  email: "tag-email",
  teams: "tag-teams",
  asana: "tag-asana",
  slack: "tag-slack",
};

const TIER_CONFIG = [
  { key: "red" as const, label: "Needs Action Now", color: "text-accent-red" },
  { key: "amber" as const, label: "Follow Up", color: "text-accent-amber" },
  { key: "teal" as const, label: "Monitor", color: "text-accent-teal" },
  { key: "gray" as const, label: "Low Priority", color: "text-text-muted" },
];

interface PeopleViewProps {
  people?: Person[];
  loading?: boolean;
}

export function PeopleView({ people = [], loading = false }: PeopleViewProps) {
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  function toggleExpand(name: string) {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function handleCopyDraft(draft: string) {
    navigator.clipboard?.writeText(draft);
  }

  // Group by urgency
  const grouped: Record<string, Person[]> = { red: [], amber: [], teal: [], gray: [] };
  people.forEach((p) => {
    if (grouped[p.urgency]) grouped[p.urgency].push(p);
  });

  const totalItems = people.reduce((sum, p) => sum + p.items.length, 0);

  return (
    <div className="space-y-6">
      {people.length === 0 && loading ? (
        <div className="flex items-center justify-center p-6 rounded-lg bg-[var(--tab-bg)] text-text-muted animate-pulse">
          <span className="mr-2">👥</span>
          <span>Loading contacts from Outlook & Calendar...</span>
        </div>
      ) : people.length === 0 ? (
        <EmptyState />
      ) : (
      <>
      {/* Summary bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {TIER_CONFIG.map((tier) => {
          const count = grouped[tier.key].length;
          if (count === 0) return null;
          return (
            <span key={tier.key} className={cn("text-xs font-semibold px-2.5 py-1 rounded-lg bg-[var(--tab-bg)]", tier.color)}>
              {count} {tier.label}
            </span>
          );
        })}
        <span className="text-xs text-text-muted ml-auto">{people.length} people \u00B7 {totalItems} items</span>
      </div>

      {/* Tier sections */}
      {TIER_CONFIG.map((tier) => {
        const group = grouped[tier.key];
        if (group.length === 0) return null;

        return (
          <section key={tier.key} className="space-y-3">
            <div className="flex items-center gap-2">
              <div className={cn("w-2.5 h-2.5 rounded-full", `bg-${tier.key === "red" ? "accent-red" : tier.key === "amber" ? "accent-amber" : tier.key === "teal" ? "accent-teal" : "[#555]"}`)} />
              <h3 className={cn("text-sm font-semibold", tier.color)}>{tier.label}</h3>
              <span className="ml-1.5 text-xs bg-white/10 rounded-full px-2 py-0.5 text-text-muted">{group.length}</span>
            </div>

            <div className={cn(
              "grid gap-4",
              tier.key === "red" ? "grid-cols-1" :
              tier.key === "amber" ? "grid-cols-1 lg:grid-cols-2" :
              "grid-cols-1 lg:grid-cols-3"
            )}>
              {group.map((person) => {
                const isExpanded = expandedCards.has(person.name) || tier.key === "red" || tier.key === "amber";
                return (
                  <div
                    key={person.name}
                    className={cn("glass-card p-4", URGENCY_BORDERS[person.urgency])}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-text-heading">{person.name}</span>
                        <span className="text-xs bg-[var(--tab-bg)] text-text-muted rounded-full px-1.5 py-0.5">
                          {person.touchpoints}
                        </span>
                      </div>
                      {(tier.key === "teal" || tier.key === "gray") && (
                        <button
                          className="text-text-muted hover:text-text-body transition-colors text-xs cursor-pointer"
                          onClick={() => toggleExpand(person.name)}
                        >
                          {isExpanded ? "\u25B2" : "\u25BC"}
                        </button>
                      )}
                    </div>
                    <div className="text-xs text-text-muted mb-3">{person.action}</div>

                    {isExpanded && (
                      <div className="space-y-2">
                        {person.items.map((tp, i) => (
                          <div key={i} className="flex items-start gap-2 py-1.5 border-t border-[var(--bg-card-border)] first:border-0 first:pt-0">
                            <span className={cn("text-[9px] font-bold uppercase tracking-wider rounded-md px-1.5 py-0.5 shrink-0 mt-0.5", CH_LABEL_CLASSES[tp.ch])}>
                              {tp.ch}
                            </span>
                            <div className="min-w-0 flex-1">
                              {tp.url ? (
                                <a className="hot-link text-xs" href={tp.url} target="_blank" rel="noopener noreferrer">
                                  {tp.text}
                                </a>
                              ) : (
                                <span className="text-xs text-text-body">{tp.text}</span>
                              )}
                            </div>
                            {tp.draft && (
                              <button
                                className="text-xs text-text-muted hover:text-accent-amber transition-colors shrink-0 cursor-pointer"
                                onClick={() => handleCopyDraft(tp.draft)}
                                title="Copy draft reply"
                              >
                                \u21A9
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
      )}
    </div>
  );
}
