"use client";

import { Button } from "@/components/ui/button";
import { AttentionFeedbackControl } from "@/components/ui/AttentionFeedbackControl";
import { EmptyState } from "@/components/ui/EmptyState";
import { CaptureButton } from "@/components/ui/CaptureButton";
import { useVaultCaptureContext } from "@/components/modals/VaultCaptureProvider";
import type { TabId } from "@/lib/tab-config";
import { CollapsibleSection } from "./CollapsibleSection";

interface CalendarItem {
  event: {
    id: string;
    subject: string;
    start_time: string;
    location: string | null;
    organizer: string | null;
    is_all_day: boolean;
    join_url: string | null;
    is_online: boolean;
  };
  attentionTarget: unknown;
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Los_Angeles",
  });
}

function formatDay(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  });
}

interface HomeCalendarProps {
  events: CalendarItem[];
  heroItemIds: Set<string>;
  onNavigate: (tab: TabId) => void;
  onOpenCalendarPrep: (eventId?: string) => void;
  animDelay?: number;
}

export function HomeCalendar({
  events,
  heroItemIds,
  onNavigate,
  onOpenCalendarPrep,
  animDelay = 200,
}: HomeCalendarProps) {
  const { open: openCapture } = useVaultCaptureContext();
  const filtered = events.filter((item) => !heroItemIds.has(`cal-${item.event.id}`));

  return (
    <CollapsibleSection
      storageKey="home-calendar-expanded"
      title="Today on Calendar"
      description="Stay ahead of the next meetings that deserve prep or context."
      badge={filtered.length || null}
      animDelay={animDelay}
      action={
        <Button variant="ghost" size="sm" onClick={() => onNavigate("calendar")}>
          View Calendar
        </Button>
      }
    >
      {filtered.length === 0 ? (
        <EmptyState variant="all-clear" context="meetings" />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map(({ event, attentionTarget }) => (
            <div
              key={event.id}
              className="rounded-[20px] border border-[var(--bg-card-border)] bg-white/[0.03] p-4"
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
                    {event.is_all_day ? formatDay(event.start_time) : `${formatDay(event.start_time)} · ${formatTime(event.start_time)}`}
                  </div>
                  <p className="mt-2 text-sm font-medium text-text-heading">{event.subject}</p>
                  <p className="mt-1 text-xs text-text-muted">
                    {event.location || event.organizer || "Calendar event"}
                  </p>
                </div>
                <AttentionFeedbackControl
                  target={attentionTarget as Parameters<typeof AttentionFeedbackControl>[0]["target"]}
                  surface="home"
                  compact
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" onClick={() => onOpenCalendarPrep(event.id)}>
                  Prep
                </Button>
                {event.join_url && event.is_online && (
                  <a
                    href={event.join_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-lg bg-white/5 px-3 py-1.5 text-xs text-text-body transition-colors hover:bg-white/10"
                  >
                    Join
                  </a>
                )}
                <CaptureButton
                  compact
                  content={`${event.subject}${event.location ? ` at ${event.location}` : ""}`}
                  sourceType="calendar"
                  sourceMeta={{
                    from: event.organizer ?? undefined,
                    subject: event.subject,
                    timestamp: event.start_time,
                    url: event.join_url ?? undefined,
                  }}
                  onCapture={openCapture}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}
