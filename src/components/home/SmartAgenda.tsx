"use client";

import { cn } from "@/lib/utils";
import { useSmartAgenda } from "@/hooks/useSmartAgenda";
import { useConnections } from "@/hooks/useConnections";
import { CollapsibleSection } from "./CollapsibleSection";
import {
  formatAgendaTime,
  formatDuration,
  type AgendaBlock,
  type AgendaFreeTimeBlock,
  type AgendaMeetingBlock,
  type AgendaSuggestion,
  type AgendaSuggestionKind,
} from "@/lib/smart-agenda";
import type { TabId } from "@/lib/tab-config";

// ── Icons ────────────────────────────────────────────────────────────────────

const KIND_ICONS: Record<AgendaSuggestionKind, React.ReactNode> = {
  email: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="3" width="14" height="10" rx="2" stroke="#0078d4" strokeWidth="1.3" />
      <path d="M1.5 4.5L8 9L14.5 4.5" stroke="#0078d4" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  task: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect width="12" height="12" x="2" y="2" rx="2" stroke="#f06a6a" strokeWidth="1.3" />
      <path d="m6 8 1.5 1.5 3-3" stroke="#f06a6a" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  chat: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M2.5 2.5h11a1.5 1.5 0 011.5 1.5v6a1.5 1.5 0 01-1.5 1.5H9l-3 2.5v-2.5H2.5A1.5 1.5 0 011 10V4a1.5 1.5 0 011.5-1.5z" stroke="#6264a7" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  ),
  slack: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M6 1.5a1.5 1.5 0 100 3h1.5V3A1.5 1.5 0 006 1.5zM2 6a1.5 1.5 0 013 0v1.5H3.5A1.5 1.5 0 012 6z" fill="#E01E5A" />
      <path d="M10 14.5a1.5 1.5 0 100-3H8.5V13a1.5 1.5 0 001.5 1.5zM14 10a1.5 1.5 0 01-3 0V8.5h1.5A1.5 1.5 0 0114 10z" fill="#2EB67D" />
      <path d="M1.5 10a1.5 1.5 0 003 0V8.5H3A1.5 1.5 0 001.5 10zM6 14.5a1.5 1.5 0 010-3h1.5V13A1.5 1.5 0 016 14.5z" fill="#ECB22E" />
      <path d="M14.5 6a1.5 1.5 0 01-3 0V4.5H13A1.5 1.5 0 0114.5 6zM10 1.5a1.5 1.5 0 010 3H8.5V3A1.5 1.5 0 0110 1.5z" fill="#36C5F0" />
    </svg>
  ),
  asana: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="4.5" r="2.5" stroke="#f06a6a" strokeWidth="1.3" />
      <circle cx="4" cy="10.5" r="2.5" stroke="#f06a6a" strokeWidth="1.3" />
      <circle cx="12" cy="10.5" r="2.5" stroke="#f06a6a" strokeWidth="1.3" />
    </svg>
  ),
  salesforce: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M4 8.5a3.5 3.5 0 017 0" stroke="#00A1E0" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="8" cy="4" r="2" stroke="#00A1E0" strokeWidth="1.3" />
    </svg>
  ),
  "meeting-prep": (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="2" width="10" height="12" rx="1.5" stroke="#d4a44c" strokeWidth="1.3" />
      <path d="M6 5h4M6 8h4M6 11h2" stroke="#d4a44c" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
};

const KIND_COLORS: Record<AgendaSuggestionKind, string> = {
  email: "text-[#0078d4]",
  task: "text-[#f06a6a]",
  chat: "text-[#6264a7]",
  slack: "text-[#611f69]",
  asana: "text-[#f06a6a]",
  salesforce: "text-[#00A1E0]",
  "meeting-prep": "text-accent-amber",
};

// ── Suggestion Row ───────────────────────────────────────────────────────────

function SuggestionRow({
  suggestion,
  onNavigate,
  onOpenCalendarPrep,
}: {
  suggestion: AgendaSuggestion;
  onNavigate: (tab: TabId) => void;
  onOpenCalendarPrep: (eventId?: string) => void;
}) {
  const handleClick = () => {
    if (suggestion.kind === "meeting-prep" && suggestion.prepEventId) {
      onOpenCalendarPrep(suggestion.prepEventId);
    } else if (suggestion.url) {
      window.open(suggestion.url, "_blank", "noopener,noreferrer");
    } else if (suggestion.navigateTab) {
      onNavigate(suggestion.navigateTab);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/[0.04]"
    >
      <div className="shrink-0">{KIND_ICONS[suggestion.kind]}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-text-heading">
          {suggestion.title}
        </div>
        <div className="truncate text-[11px] text-text-muted">
          {suggestion.subtitle}
        </div>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium",
          KIND_COLORS[suggestion.kind]
        )}
      >
        {suggestion.estimatedMinutes}m
      </span>
    </button>
  );
}

// ── Meeting Block ────────────────────────────────────────────────────────────

function MeetingTimeBlock({
  block,
  onOpenCalendarPrep,
}: {
  block: AgendaMeetingBlock;
  onOpenCalendarPrep: (eventId?: string) => void;
}) {
  const { event } = block;
  const now = new Date();
  const isHappening =
    new Date(event.start_time) <= now && new Date(event.end_time) > now;

  return (
    <div className="relative flex gap-3">
      {/* Timeline connector */}
      <div className="flex w-5 shrink-0 flex-col items-center">
        <div
          className={cn(
            "h-3 w-3 rounded-full border-2",
            isHappening
              ? "border-accent-green bg-accent-green/30 animate-pulse"
              : "border-accent-amber bg-accent-amber/30"
          )}
        />
        <div className="w-px flex-1 bg-white/10" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pb-4">
        <div className="rounded-[16px] border border-[var(--bg-card-border)] bg-white/[0.03] p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-text-muted">
                {formatAgendaTime(block.startTime)} –{" "}
                {formatAgendaTime(block.endTime)}
                <span className="ml-2 text-text-muted/60">
                  {formatDuration(block.durationMin)}
                </span>
              </div>
              <div className="mt-1 text-sm font-medium text-text-heading">
                {event.subject}
              </div>
              {event.organizer && (
                <div className="mt-0.5 text-[11px] text-text-muted">
                  {event.organizer}
                  {event.location ? ` · ${event.location}` : ""}
                </div>
              )}
            </div>
            <div className="flex shrink-0 gap-1.5">
              {event.join_url && (
                <a
                  href={event.join_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg bg-accent-teal/15 px-2.5 py-1 text-[11px] font-medium text-accent-teal transition-colors hover:bg-accent-teal/25"
                >
                  Join
                </a>
              )}
              <button
                type="button"
                onClick={() => onOpenCalendarPrep(event.id)}
                className="rounded-lg bg-accent-amber/15 px-2.5 py-1 text-[11px] font-medium text-accent-amber transition-colors hover:bg-accent-amber/25"
              >
                Prep
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Free Time Block ──────────────────────────────────────────────────────────

function FreeTimeBlock({
  block,
  onNavigate,
  onOpenCalendarPrep,
}: {
  block: AgendaFreeTimeBlock;
  onNavigate: (tab: TabId) => void;
  onOpenCalendarPrep: (eventId?: string) => void;
}) {
  return (
    <div className="relative flex gap-3">
      {/* Timeline connector */}
      <div className="flex w-5 shrink-0 flex-col items-center">
        <div className="h-2 w-2 rounded-full border border-white/20 bg-white/5" />
        <div className="w-px flex-1 border-l border-dashed border-white/10" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pb-4">
        <div className="text-[11px] text-text-muted">
          {formatDuration(block.durationMin)} open
          {block.suggestions.length > 0 && (
            <span className="ml-1 text-text-muted/60">
              · {block.suggestions.length} suggested
            </span>
          )}
        </div>
        {block.suggestions.length > 0 ? (
          <div className="mt-1.5 space-y-0.5">
            {block.suggestions.map((suggestion) => (
              <SuggestionRow
                key={suggestion.id}
                suggestion={suggestion}
                onNavigate={onNavigate}
                onOpenCalendarPrep={onOpenCalendarPrep}
              />
            ))}
          </div>
        ) : (
          <div className="mt-1 text-xs text-text-muted/50">
            No actionable items to suggest
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

interface SmartAgendaProps {
  onNavigate: (tab: TabId) => void;
  onOpenCalendarPrep: (eventId?: string) => void;
  animDelay?: number;
}

export function SmartAgenda({
  onNavigate,
  onOpenCalendarPrep,
  animDelay = 100,
}: SmartAgendaProps) {
  const agenda = useSmartAgenda();
  const connections = useConnections();

  // Don't render outside business hours or with no data at all
  if (!agenda.visible) return null;
  if (!agenda.hasCalendar && !agenda.hasActionableItems) return null;

  const meetingCount = agenda.blocks.filter((b) => b.kind === "meeting").length;
  const suggestionCount = agenda.blocks
    .filter((b): b is AgendaFreeTimeBlock => b.kind === "free-time")
    .reduce((sum, b) => sum + b.suggestions.length, 0);

  const badgeText = meetingCount > 0
    ? `${meetingCount} meeting${meetingCount !== 1 ? "s" : ""}`
    : `${suggestionCount} items`;

  return (
    <CollapsibleSection
      storageKey="home-smart-agenda-expanded"
      defaultExpanded
      title="Your Next 4 Hours"
      description="Time-blocked view with suggested actions between meetings."
      badge={badgeText}
      animDelay={animDelay}
    >
      {/* No calendar prompt */}
      {!connections.m365 && (
        <div className="mb-3 rounded-xl border border-dashed border-white/10 px-3 py-2 text-xs text-text-muted">
          Connect Microsoft 365 to see your calendar here.
        </div>
      )}

      {/* Timeline */}
      <div className="mt-1">
        {/* Window start label */}
        <div className="mb-2 flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-accent-red shadow-[0_0_6px_rgba(232,93,93,0.5)] animate-pulse" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-accent-red">
            Now — {formatAgendaTime(agenda.windowStart)}
          </span>
          <div className="h-px flex-1 bg-accent-red/30" />
        </div>

        {/* Blocks */}
        {agenda.blocks.map((block: AgendaBlock) =>
          block.kind === "meeting" ? (
            <MeetingTimeBlock
              key={block.id}
              block={block}
              onOpenCalendarPrep={onOpenCalendarPrep}
            />
          ) : (
            <FreeTimeBlock
              key={block.id}
              block={block}
              onNavigate={onNavigate}
              onOpenCalendarPrep={onOpenCalendarPrep}
            />
          )
        )}

        {/* Window end label */}
        <div className="flex items-center gap-2 pt-1">
          <div className="h-1.5 w-1.5 rounded-full bg-white/20" />
          <span className="text-[10px] text-text-muted/50">
            {formatAgendaTime(agenda.windowEnd)}
          </span>
        </div>
      </div>
    </CollapsibleSection>
  );
}
