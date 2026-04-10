"use client";
import { useState, useEffect } from "react";
import { cn, getCurrentPSTHour } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { CaptureButton } from "@/components/ui/CaptureButton";
import { useVaultCaptureContext } from "@/components/modals/VaultCaptureProvider";

interface CalEvent {
  time: string;
  title: string;
  meta: string;
  type: "normal" | "highlight";
  dotColor?: "amber" | "teal";
  startH: number;
  endH: number;
  url: string;
  overlay?: {
    time: string;
    title: string;
    meta: string;
    dotColor: "teal";
    url: string;
  };
}


interface CalendarTimelineProps {
  events?: CalEvent[];
}

export function CalendarTimeline({ events = [] }: CalendarTimelineProps) {
  const { open: openCapture } = useVaultCaptureContext();
  const [currentH, setCurrentH] = useState(getCurrentPSTHour);

  useEffect(() => {
    const timer = setInterval(() => setCurrentH(getCurrentPSTHour()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Find where NOW falls
  const nowAfterIndex = events.reduce((acc, ev, i) => {
    if (currentH >= ev.startH) return i;
    return acc;
  }, -1);

  const showNow = currentH >= 8.5 && currentH <= 16;

  return (
    <section className="glass-card anim-card" style={{ animationDelay: "160ms" }}>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-text-heading mb-4">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        Today&apos;s Schedule — Services Summit 2.0 Day 2
      </h2>

      {events.length === 0 ? (
        <EmptyState />
      ) : (
      <div className="space-y-0">
        {events.map((ev, i) => (
          <div key={i}>
            <div className={cn(
              "flex items-start gap-4 py-3",
              ev.type === "highlight" && "bg-[var(--accent-amber-dim)] rounded-lg px-3 -mx-3 my-1"
            )}>
              {/* Dot */}
              <div className={cn(
                "w-3 h-3 rounded-full mt-1.5 shrink-0 border-2",
                ev.dotColor === "amber" ? "border-accent-amber bg-accent-amber/30" :
                ev.dotColor === "teal" ? "border-accent-teal bg-accent-teal/30" :
                "border-text-muted bg-text-muted/20"
              )} />
              {/* Time */}
              <div className="text-xs text-text-muted w-[140px] shrink-0 pt-0.5">{ev.time}</div>
              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <a
                    className="hot-link text-sm font-medium"
                    href={ev.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {ev.title}
                  </a>
                  {currentH >= ev.startH && currentH < ev.endH && (
                    <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" title="Happening now">●</span>
                  )}
                  <CaptureButton
                    compact
                    content={`${ev.title}${ev.meta ? ` — ${ev.meta}` : ""}`}
                    sourceType="calendar"
                    sourceMeta={{
                      from: ev.meta || undefined,
                      subject: ev.title,
                      timestamp: new Date().toISOString(),
                      url: ev.url || undefined,
                    }}
                    onCapture={openCapture}
                  />
                </div>
                <div className="text-xs text-text-muted">{ev.meta}</div>

                {/* Overlay event */}
                {ev.overlay && (
                  <div className="mt-2 pl-4 border-l-2 border-accent-teal py-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-accent-teal shrink-0" />
                      <span className="text-xs text-text-muted">{ev.overlay.time}</span>
                    </div>
                    <a
                      className="hot-link text-sm font-medium block"
                      href={ev.overlay.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {ev.overlay.title}
                    </a>
                    <span className="text-xs text-text-muted">{ev.overlay.meta}</span>
                  </div>
                )}
              </div>
            </div>

            {/* NOW indicator */}
            {showNow && i === nowAfterIndex && (
              <div className="flex items-center gap-2 py-1 -mx-1">
                <div className="w-3 h-3 rounded-full bg-accent-red shrink-0 shadow-[0_0_8px_rgba(232,93,93,0.6)] animate-pulse" />
                <div className="flex-1 h-px bg-accent-red" />
                <span className="text-xs font-bold text-accent-red uppercase tracking-wider">NOW</span>
                <div className="flex-1 h-px bg-accent-red" />
              </div>
            )}
          </div>
        ))}
      </div>
      )}
    </section>
  );
}
