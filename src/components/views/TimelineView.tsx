"use client";
import { useState, useEffect } from "react";
import { cn, getCurrentPSTHour } from "@/lib/utils";

interface TimelineBlock {
  type: "free" | "meeting" | "meeting-light" | "overlay";
  startH: number;
  startM: number;
  durationH: number;
  title: string;
  meta: string;
  url?: string;
  suggestions?: string;
  chips?: { label: string; url: string; color: "amber" | "red" | "teal" }[];
}

const BLOCKS: TimelineBlock[] = [
  {
    type: "free", startH: 6, startM: 0, durationH: 2.5,
    title: "2.5 hrs free \u2014 Morning Deep Work", meta: "",
    suggestions: "Reply to Scott WRV (5 min), Draft EP Wealth reply (10 min), Review Locauto claim docs (15 min), Respond to David Stark QNAP (5 min)",
    chips: [
      { label: "Reply Scott WRV \u00B7 5m", url: "https://outlook.office365.com/owa/?ItemID=AAMkADcxMzk0YWZlLTY3NTMtNGMwZS1iYjY1LTMwNzQxODY4NzJmNQBGAAAAAAAqqFVVwKwHTpHh%2Fn2snM4RBwDrzb4zfl3PR42aPMRPrJIYAAAASV%2FpAABdJVDk7zpYSLdKG%2F2iDTQsAAWudiEoAAA%3D&exvsurl=1&viewmodel=ReadMessageItem", color: "amber" },
      { label: "Draft EP Wealth \u00B7 10m", url: "https://outlook.office365.com/owa/?ItemID=AAMkADcxMzk0YWZlLTY3NTMtNGMwZS1iYjY1LTMwNzQxODY4NzJmNQBGAAAAAAAqqFVVwKwHTpHh%2Fn2snM4RBwDrzb4zfl3PR42aPMRPrJIYAAAASV%2FpAABdJVDk7zpYSLdKG%2F2iDTQsAARLXabwAAA%3D&exvsurl=1&viewmodel=ReadMessageItem", color: "red" },
      { label: "Review Locauto \u00B7 15m", url: "https://outlook.office365.com/owa/?ItemID=AAMkADcxMzk0YWZlLTY3NTMtNGMwZS1iYjY1LTMwNzQxODY4NzJmNQBGAAAAAAAqqFVVwKwHTpHh%2Fn2snM4RBwDrzb4zfl3PR42aPMRPrJIYAAAASV%2FpAABdJVDk7zpYSLdKG%2F2iDTQsAAVwEdHGAAA%3D&exvsurl=1&viewmodel=ReadMessageItem", color: "amber" },
      { label: "David Stark QNAP \u00B7 5m", url: "https://sonance-slack.slack.com/archives/D08CPPDNG21", color: "teal" },
    ],
  },
  {
    type: "meeting-light", startH: 8, startM: 30, durationH: 0.5,
    title: "Day 2 Kick-Off", meta: "8:30 \u2013 9:00 AM \u00B7 Coffee & Pastries \u00B7 Boardroom",
    url: "https://outlook.office365.com/owa/?path=/calendar/item",
  },
  {
    type: "meeting", startH: 9, startM: 0, durationH: 3,
    title: "Services Leader Working Session", meta: "9:00 AM \u2013 12:00 PM \u00B7 Boardroom \u00B7 Longest block",
    url: "https://outlook.office365.com/owa/?path=/calendar/item",
  },
  {
    type: "overlay", startH: 10, startM: 30, durationH: 0.5,
    title: "Dr. Lindberg Call", meta: "10:30 AM \u00B7 Phone \u00B7 via Jeana",
    url: "https://outlook.office365.com/owa/?path=/calendar",
  },
  {
    type: "meeting", startH: 12, startM: 0, durationH: 2,
    title: "Working Lunch & Revised Plan Presentation", meta: "12:00 \u2013 2:00 PM \u00B7 Boardroom",
    url: "https://outlook.office365.com/owa/?path=/calendar/item",
  },
  {
    type: "meeting", startH: 14, startM: 0, durationH: 1,
    title: "SLT Closeout Session", meta: "2:00 \u2013 3:00 PM \u00B7 Boardroom",
    url: "https://outlook.office365.com/owa/?path=/calendar/item",
  },
  {
    type: "free", startH: 15, startM: 0, durationH: 3,
    title: "3 hrs free \u2014 Post-Summit", meta: "",
    suggestions: "Compensation decisions with Pat (30 min), Keith/Derick alignment (30 min), EP Wealth notes (20 min), Cloudflare API token (10 min), Spec out RR for Dan Fields (20 min), SLT self eval follow-up (10 min)",
    chips: [
      { label: "Comp decisions w/ Pat \u00B7 30m", url: "https://app.asana.com/1/1201171894258423/project/1211840949719691/task/1213302096308654", color: "red" },
      { label: "Keith/Derick alignment \u00B7 30m", url: "", color: "red" },
      { label: "EP Wealth notes \u00B7 20m", url: "https://app.asana.com/1/1201171894258423/project/1211840949719691/task/1212685060221215", color: "amber" },
      { label: "Cloudflare API token \u00B7 10m", url: "https://app.asana.com/1/1201171894258423/task/1213281763082767", color: "amber" },
      { label: "Spec RR Dan Fields \u00B7 20m", url: "https://app.asana.com/1/1201171894258423/project/1211840949719691/task/1211871469381038", color: "amber" },
      { label: "SLT eval follow-up \u00B7 10m", url: "https://app.asana.com/1/1201171894258423/project/1211840949719691/task/1211558188777256", color: "amber" },
    ],
  },
];

const START_HOUR = 6;
const END_HOUR = 18;
const PX_PER_HOUR = 70;

function timeToY(hour: number, min: number): number {
  return ((hour - START_HOUR) + min / 60) * PX_PER_HOUR;
}

const BLOCK_COLORS: Record<string, string> = {
  "free": "border-2 border-dashed border-accent-green/40 bg-accent-green/5",
  "meeting": "bg-accent-amber/15 border border-accent-amber/30",
  "meeting-light": "bg-accent-amber/8 border border-accent-amber/15",
  "overlay": "bg-accent-teal/15 border border-accent-teal/30",
};

export function TimelineView() {
  const [currentH, setCurrentH] = useState(getCurrentPSTHour);
  const totalHeight = (END_HOUR - START_HOUR) * PX_PER_HOUR;

  useEffect(() => {
    const timer = setInterval(() => setCurrentH(getCurrentPSTHour()), 60000);
    return () => clearInterval(timer);
  }, []);

  const hours = [];
  for (let h = START_HOUR; h <= END_HOUR; h++) {
    const ampm = h < 12 ? "AM" : "PM";
    const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
    hours.push({ label: `${display} ${ampm}`, top: (h - START_HOUR) * PX_PER_HOUR });
  }

  const showNow = currentH >= START_HOUR && currentH <= END_HOUR;
  const nowY = showNow ? timeToY(Math.floor(currentH), Math.round((currentH % 1) * 60)) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-amber-400/10 border border-amber-400/20 text-xs text-amber-400">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        Timeline uses demo data — live calendar sync coming soon
      </div>
      <div className="flex gap-4">
      {/* Hour labels */}
      <div className="shrink-0 w-16 relative" style={{ height: totalHeight }}>
        {hours.map((h) => (
          <div
            key={h.label}
            className="absolute text-xs text-text-muted"
            style={{ top: h.top }}
          >
            {h.label}
          </div>
        ))}
      </div>

      {/* Track */}
      <div className="flex-1 relative" style={{ height: totalHeight }}>
        {/* Gridlines */}
        {hours.map((h) => (
          <div
            key={h.label}
            className="absolute left-0 right-0 border-t border-[var(--timeline-line)]"
            style={{ top: h.top }}
          />
        ))}

        {/* Blocks */}
        {BLOCKS.map((block, i) => {
          const top = timeToY(block.startH, block.startM);
          const height = block.durationH * PX_PER_HOUR;
          return (
            <div
              key={i}
              className={cn("absolute left-0 right-0 rounded-lg p-3 overflow-hidden", BLOCK_COLORS[block.type])}
              style={{ top, height, zIndex: block.type === "overlay" ? 2 : 1 }}
            >
              {block.url ? (
                <a className="hot-link text-sm font-medium block" href={block.url} target="_blank" rel="noopener noreferrer">
                  {block.title}
                </a>
              ) : (
                <div className="text-sm font-medium text-text-heading">{block.title}</div>
              )}
              {block.meta && <div className="text-xs text-text-muted">{block.meta}</div>}
              {block.suggestions && (
                <div className="text-xs text-text-muted mt-1">{block.suggestions}</div>
              )}
              {block.chips && block.chips.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {block.chips.map((chip, j) =>
                    chip.url ? (
                      <a
                        key={j}
                        className={cn(
                          "text-[10px] px-2 py-0.5 rounded-md transition-colors",
                          chip.color === "amber" && "bg-accent-amber/15 text-accent-amber hover:bg-accent-amber/25",
                          chip.color === "red" && "bg-accent-red/15 text-accent-red hover:bg-accent-red/25",
                          chip.color === "teal" && "bg-accent-teal/15 text-accent-teal hover:bg-accent-teal/25"
                        )}
                        href={chip.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {chip.label}
                      </a>
                    ) : (
                      <span
                        key={j}
                        className={cn(
                          "text-[10px] px-2 py-0.5 rounded-md",
                          chip.color === "amber" && "bg-accent-amber/15 text-accent-amber",
                          chip.color === "red" && "bg-accent-red/15 text-accent-red",
                          chip.color === "teal" && "bg-accent-teal/15 text-accent-teal"
                        )}
                      >
                        {chip.label}
                      </span>
                    )
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* NOW line */}
        {showNow && (
          <div className="absolute left-0 right-0 flex items-center z-10" style={{ top: nowY }}>
            <div className="w-3 h-3 rounded-full bg-accent-red shadow-[0_0_8px_rgba(232,93,93,0.6)] animate-pulse shrink-0" />
            <div className="flex-1 h-0.5 bg-accent-red" />
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
