"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AttentionFeedbackControl } from "@/components/ui/AttentionFeedbackControl";
import { useMorningBrief } from "@/hooks/useMorningBrief";
import { buildBriefActionTarget } from "@/lib/morning-brief";
import type {
  BriefAction,
  BriefChange,
  BriefCorrelation,
} from "@/lib/morning-brief";
import type { AttentionTarget } from "@/lib/attention/types";
import { cn } from "@/lib/utils";

const COLLAPSE_KEY = "command-center:brief-collapsed";
const CHANGES_EXPANDED_KEY = "command-center:brief-changes-expanded";

function getStoredBoolean(key: string, fallback: boolean) {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? fallback : v === "true";
  } catch {
    return fallback;
  }
}

function formatBriefTime(value: string) {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Los_Angeles",
  });
}

function getGreeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const URGENCY_STYLES: Record<string, string> = {
  now: "bg-accent-red/15 text-accent-red",
  today: "bg-accent-amber/15 text-accent-amber",
  "this-week": "bg-accent-teal/15 text-accent-teal",
};

const SEVERITY_DOTS: Record<string, string> = {
  critical: "bg-accent-red",
  warning: "bg-accent-amber",
  info: "bg-white/30",
};

interface MorningBriefProps {
  onOpenCalendarPrep: (eventId?: string) => void;
  showPendingState?: boolean;
}

export function MorningBrief({
  onOpenCalendarPrep,
  showPendingState = false,
}: MorningBriefProps) {
  const { brief, status, error, originalTargets, refresh } = useMorningBrief();
  const [collapsed, setCollapsed] = useState(() => getStoredBoolean(COLLAPSE_KEY, false));
  const [changesExpanded, setChangesExpanded] = useState(() =>
    getStoredBoolean(CHANGES_EXPANDED_KEY, false)
  );

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(COLLAPSE_KEY, String(next));
    } catch {
      /* ignore */
    }
  };

  const toggleChanges = () => {
    const next = !changesExpanded;
    setChangesExpanded(next);
    try {
      window.localStorage.setItem(CHANGES_EXPANDED_KEY, String(next));
    } catch {
      /* ignore */
    }
  };

  if (status === "idle" && showPendingState) {
    return (
      <section
        className="glass-card anim-card overflow-hidden"
        style={{ animationDelay: "0ms" }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(0,163,225,0.14),transparent_40%),radial-gradient(circle_at_bottom_left,rgba(200,155,60,0.10),transparent_36%)]" />
        <div className="relative">
          <div className="text-[11px] uppercase tracking-[0.28em] text-accent-amber">
            Live Brief
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-heading">
            Building your brief from newly connected Microsoft 365 data.
          </p>
          <p className="mt-3 text-sm text-text-muted">
            Real email, calendar, and Teams activity is syncing now. Your brief
            will appear here as soon as the first pass completes.
          </p>
        </div>
      </section>
    );
  }

  // Don't render anything if idle with no data yet
  if (status === "idle") return null;

  const hour = new Date().getHours();

  return (
    <section className="glass-card anim-card overflow-hidden" style={{ animationDelay: "0ms" }}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(0,163,225,0.14),transparent_40%),radial-gradient(circle_at_bottom_left,rgba(200,155,60,0.10),transparent_36%)]" />
      <div className="relative">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-accent-amber">
              {getGreeting(hour)} Brief
            </div>
            {brief && (
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-heading">
                {brief.headline}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {brief && (
              <span className="text-[10px] text-text-muted">
                {formatBriefTime(brief.generatedAt)}
              </span>
            )}
            <Button
              variant="ghost"
              size="xs"
              onClick={() => refresh()}
              disabled={status === "loading"}
            >
              {status === "loading" ? "..." : "Refresh"}
            </Button>
            <Button variant="ghost" size="xs" onClick={toggleCollapsed}>
              {collapsed ? "Show" : "Hide"}
            </Button>
          </div>
        </div>

        {/* Loading skeleton */}
        {status === "loading" && !brief && (
          <div className="mt-5 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-[20px] border border-[var(--bg-card-border)] bg-white/[0.03]"
              />
            ))}
          </div>
        )}

        {/* Error state */}
        {status === "error" && (
          <div className="mt-4 rounded-[16px] border border-accent-red/20 bg-accent-red/5 px-4 py-3">
            <p className="text-xs text-accent-red">
              {error || "Failed to generate brief."}
            </p>
            <Button variant="ghost" size="xs" className="mt-2" onClick={() => refresh()}>
              Try again
            </Button>
          </div>
        )}

        {/* Brief content */}
        {brief && !collapsed && (
          <div className="mt-5 space-y-5">
            {/* Priority Actions */}
            {brief.priorityActions.length > 0 && (
              <div>
                <div className="mb-3 text-[11px] uppercase tracking-[0.22em] text-text-muted">
                  Priority Actions
                </div>
                <div className="space-y-2">
                  {brief.priorityActions.map((action) => (
                    <ActionCard
                      key={action.id}
                      action={action}
                      originalTargets={originalTargets}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Cross-Correlations */}
            {brief.crossCorrelations.length > 0 && (
              <div>
                <div className="mb-3 text-[11px] uppercase tracking-[0.22em] text-text-muted">
                  Connected Insights
                </div>
                <div className="space-y-2">
                  {brief.crossCorrelations.map((correlation) => (
                    <CorrelationCard
                      key={correlation.id}
                      correlation={correlation}
                      originalTargets={originalTargets}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Calendar Highlights */}
            {brief.calendarHighlights.length > 0 && (
              <div>
                <div className="mb-3 text-[11px] uppercase tracking-[0.22em] text-text-muted">
                  Calendar Highlights
                </div>
                <div className="grid gap-2 lg:grid-cols-2">
                  {brief.calendarHighlights.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-3 rounded-[20px] border border-[var(--bg-card-border)] bg-white/[0.03] p-4"
                    >
                      <div className="min-w-0">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
                          {item.startTime ? formatBriefTime(item.startTime) : "Today"}
                        </div>
                        <p className="mt-1 text-sm text-text-heading">{item.text}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => onOpenCalendarPrep(item.eventId)}
                      >
                        Prep
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Key Numbers */}
            {brief.keyNumbers.length > 0 && (
              <div>
                <div className="mb-3 text-[11px] uppercase tracking-[0.22em] text-text-muted">
                  Key Numbers
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {brief.keyNumbers.map((metric) => (
                    <div
                      key={metric.id}
                      className="rounded-[20px] border border-[var(--bg-card-border)] bg-black/10 p-4"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-[0.22em] text-text-muted">
                          {metric.label}
                        </span>
                        <span
                          className={cn(
                            "text-[10px]",
                            metric.trend === "up" && "text-accent-green",
                            metric.trend === "down" && "text-accent-red",
                            metric.trend === "flat" && "text-text-muted"
                          )}
                        >
                          {metric.trend === "up" ? "↑" : metric.trend === "down" ? "↓" : "→"}
                        </span>
                      </div>
                      <div className="mt-1 text-2xl font-semibold tabular-nums text-text-heading">
                        {metric.value}
                      </div>
                      <p className="mt-1 text-[11px] text-text-muted">{metric.context}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Overnight Changes (collapsed by default) */}
            {brief.overnightChanges.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={toggleChanges}
                  className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-text-muted transition-colors hover:text-text-body"
                >
                  <span
                    className={cn(
                      "inline-block transition-transform",
                      changesExpanded ? "rotate-90" : ""
                    )}
                  >
                    ▸
                  </span>
                  Overnight Changes ({brief.overnightChanges.length})
                </button>
                {changesExpanded && (
                  <div className="space-y-2">
                    {brief.overnightChanges.map((change) => (
                      <ChangeCard key={change.id} change={change} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ActionCard({
  action,
  originalTargets,
}: {
  action: BriefAction;
  originalTargets: Map<string, AttentionTarget>;
}) {
  const target = buildBriefActionTarget(action, originalTargets);

  return (
    <div className="flex items-start gap-3 rounded-[20px] border border-[var(--bg-card-border)] bg-white/[0.03] p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.18em]",
              URGENCY_STYLES[action.urgency] || URGENCY_STYLES["this-week"]
            )}
          >
            {action.urgency === "this-week" ? "this week" : action.urgency}
          </span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-text-muted">
            {action.source.provider.replace("outlook_", "").replace("_", " ")}
          </span>
        </div>
        <p className="mt-2 text-sm text-text-heading">{action.text}</p>
        {action.source.url && (
          <a
            href={action.source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block text-xs text-accent-amber hover:underline"
          >
            Open source
          </a>
        )}
      </div>
      <AttentionFeedbackControl target={target} surface="morning_brief" compact />
    </div>
  );
}

function CorrelationCard({
  correlation,
  originalTargets,
}: {
  correlation: BriefCorrelation;
  originalTargets: Map<string, AttentionTarget>;
}) {
  // Use the first source for feedback if available
  const primarySource = correlation.sources[0];
  const target = primarySource
    ? originalTargets.get(`${primarySource.itemType}:${primarySource.itemId}`) ?? null
    : null;

  return (
    <div className="rounded-[20px] border border-[var(--bg-card-border)] bg-white/[0.03] p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-text-heading">{correlation.text}</p>
          {correlation.entities.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {correlation.entities.map((entity) => (
                <span
                  key={entity}
                  className="rounded-full border border-[var(--bg-card-border)] bg-white/[0.04] px-2.5 py-0.5 text-[10px] text-text-body"
                >
                  {entity}
                </span>
              ))}
            </div>
          )}
        </div>
        {target && (
          <AttentionFeedbackControl
            target={{ ...target, surface: "morning_brief" }}
            surface="morning_brief"
            compact
          />
        )}
      </div>
    </div>
  );
}

function ChangeCard({ change }: { change: BriefChange }) {
  return (
    <div className="flex items-start gap-3 rounded-[16px] border border-[var(--bg-card-border)] bg-white/[0.02] px-4 py-3">
      <span
        className={cn(
          "mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full",
          SEVERITY_DOTS[change.severity] || SEVERITY_DOTS.info
        )}
      />
      <p className="text-xs leading-relaxed text-text-body">{change.text}</p>
    </div>
  );
}
