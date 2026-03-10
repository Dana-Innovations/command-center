"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";

import { useBookings } from "@/hooks/useBookings";
import { BookingsTargetEditor } from "./BookingsTargetEditor";

function pctColorClass(pct: number) {
  if (pct >= 100) return "text-accent-green";
  if (pct >= 70) return "text-accent-amber";
  return "text-accent-red";
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const w = 80;
  const h = 30;
  const min = Math.min(...data) - 5;
  const max = Math.max(...data) + 5;
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const polyline = points.join(" ");
  const lastPct = data[data.length - 1];
  const sparkColor = lastPct >= 70 ? "#00B2A9" : lastPct >= 40 ? "#00A3E1" : "#E85D5D";
  const lastY = h - ((data[data.length - 1] - min) / range) * h;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={sparkColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={sparkColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${h} ${polyline} ${w},${h}`}
        fill="url(#spark-grad)"
      />
      <polyline
        points={polyline}
        fill="none"
        stroke={sparkColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={w} cy={lastY.toFixed(1)} r="2.5" fill={sparkColor} />
    </svg>
  );
}

function fmt$(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000).toLocaleString()}K`;
  return `$${n.toLocaleString()}`;
}

function quarterLabel(quarter: string): string {
  const now = new Date();
  const match = quarter.match(/^(\d{4})-Q([1-4])$/);
  if (!match) return quarter;

  const year = parseInt(match[1]);
  const q = parseInt(match[2]);
  const startMonth = (q - 1) * 3;
  const startDate = new Date(year, startMonth, 1);
  const endDate = new Date(year, startMonth + 3, 0); // last day of quarter
  const totalDays = Math.ceil(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  ) + 1;

  const dayOfQuarter = Math.max(
    1,
    Math.min(
      totalDays,
      Math.ceil(
        (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      ) + 1
    )
  );

  return `Q${q} ${year} — Day ${dayOfQuarter} of ${totalDays}`;
}

export function BookingsDashboard() {
  const {
    quarter,
    segments,
    totalTarget,
    totalActual,
    totalPct,
    targets,
    loading,
    saving,
    saveTargets,
    refreshActuals,
  } = useBookings();

  const [editorOpen, setEditorOpen] = useState(false);

  // Build sparkline from segment percentages
  const sparklineData = segments.length > 0 ? segments.map((s) => s.pct) : [];

  if (loading) {
    return (
      <section className="glass-card anim-card" style={{ animationDelay: "320ms" }}>
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent-amber" />
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="glass-card anim-card" style={{ animationDelay: "320ms" }}>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text-heading mb-4">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="20" x2="12" y2="10" />
            <line x1="18" y1="20" x2="18" y2="4" />
            <line x1="6" y1="20" x2="6" y2="16" />
          </svg>
          <span className="flex-1">Bookings — {quarterLabel(quarter)}</span>
          <button
            onClick={() => refreshActuals()}
            className="text-text-muted hover:text-text-body transition-colors cursor-pointer"
            title="Refresh from Power BI"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
          <button
            onClick={() => setEditorOpen(true)}
            className="text-text-muted hover:text-text-body transition-colors cursor-pointer"
            title="Set targets"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </h2>

        {segments.length === 0 ? (
          <div className="text-center py-6">
            <div className="text-2xl mb-2">📊</div>
            <div className="text-sm font-semibold text-text-heading mb-1">
              No targets configured
            </div>
            <div className="text-xs text-text-muted mb-3">
              Set quarterly targets by vertical to track bookings progress
            </div>
            <button
              onClick={() => setEditorOpen(true)}
              className="px-4 py-1.5 text-xs font-semibold bg-accent-teal/20 text-accent-teal rounded-lg hover:bg-accent-teal/30 transition-colors cursor-pointer"
            >
              Set Targets
            </button>
          </div>
        ) : (
          <>
            <div className="mb-5">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  ALL VERTICALS
                </h3>
                <Sparkline data={sparklineData} />
              </div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-2xl font-bold text-text-heading">
                  {fmt$(totalActual)}
                </span>
                <span className="text-text-muted">/</span>
                <span className="text-lg text-text-muted">
                  {fmt$(totalTarget)}
                </span>
                <span
                  className={cn(
                    "text-sm font-bold",
                    pctColorClass(totalPct)
                  )}
                >
                  {totalPct}%
                </span>
              </div>
            </div>

            <div className="space-y-3">
              {segments.map((seg) => (
                <div key={seg.name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-text-body">{seg.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-text-muted tabular-nums">
                        {fmt$(seg.actual)}
                      </span>
                      <span
                        className={cn(
                          "font-bold tabular-nums",
                          pctColorClass(seg.pct)
                        )}
                      >
                        {seg.pct}%
                      </span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--progress-bg)]">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        seg.color
                      )}
                      style={{ width: `${Math.min(seg.pct, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {editorOpen && (
        <BookingsTargetEditor
          onClose={() => setEditorOpen(false)}
          quarter={quarter}
          existingTargets={targets}
          onSave={saveTargets}
          saving={saving}
        />
      )}
    </>
  );
}
