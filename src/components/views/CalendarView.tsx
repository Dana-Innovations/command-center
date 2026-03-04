"use client";
import { useState, useEffect, useMemo } from "react";
import { MeetingPrep } from "@/components/command-center/MeetingPrep";
import { WeatherCard } from "@/components/command-center/WeatherCard";
import { useCalendar } from "@/hooks/useCalendar";
import { transformMeetingPrep } from "@/lib/transformers";
import { CalendarEvent } from "@/lib/types";

function toPST(iso: string): Date {
  return new Date(new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
}

function nowPST(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
}

function formatTime12(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12}:00 ${period}` : `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function formatTimeRange(ev: CalendarEvent): string {
  return `${formatTime12(toPST(ev.start_time))} \u2013 ${formatTime12(toPST(ev.end_time))}`;
}

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

function NowMarker() {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="w-3 h-3 rounded-full bg-accent-red shrink-0 shadow-[0_0_8px_rgba(232,93,93,0.6)] animate-pulse" />
      <div className="flex-1 h-px bg-accent-red" />
      <span className="text-xs font-bold text-accent-red uppercase tracking-wider">NOW</span>
      <div className="flex-1 h-px bg-accent-red" />
    </div>
  );
}

function EventCard({ ev, now }: { ev: CalendarEvent; now: Date }) {
  const start = toPST(ev.start_time);
  const end = toPST(ev.end_time);
  const isHappening = start <= now && now < end;

  return (
    <div className={`glass-card p-3 flex items-start gap-3 ${isHappening ? "border border-accent-amber/60 shadow-[0_0_12px_rgba(212,164,76,0.15)]" : ""}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted tabular-nums shrink-0">{formatTimeRange(ev)}</span>
          {isHappening && (
            <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" title="Happening now" />
          )}
        </div>
        <div className="text-sm font-medium text-text-heading mt-0.5">{ev.subject}</div>
        {ev.location && <div className="text-xs text-text-muted mt-0.5">{ev.location}</div>}
      </div>
      {ev.join_url && (
        <a
          href={ev.join_url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md bg-accent-teal/15 text-accent-teal hover:bg-accent-teal/25 transition-colors"
        >
          Join
        </a>
      )}
    </div>
  );
}

export function CalendarView() {
  const { events: calEvents } = useCalendar();
  const meetingPrep = transformMeetingPrep(calEvents);

  const [now, setNow] = useState(nowPST);
  useEffect(() => {
    const timer = setInterval(() => setNow(nowPST()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const { todayAllDay, todayTimed, upcoming } = useMemo(() => {
    const sorted = [...calEvents].sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );
    const todayAllDay: CalendarEvent[] = [];
    const todayTimed: CalendarEvent[] = [];
    const upcoming: CalendarEvent[] = [];

    for (const ev of sorted) {
      const start = toPST(ev.start_time);
      if (isSameDay(start, now)) {
        if (ev.is_all_day) todayAllDay.push(ev);
        else todayTimed.push(ev);
      } else if (start > now) {
        upcoming.push(ev);
      }
    }
    return { todayAllDay, todayTimed, upcoming };
  }, [calEvents, now]);

  // NOW marker: insert before the first event whose start_time > now
  const nowInsertBefore = useMemo(() => {
    for (let i = 0; i < todayTimed.length; i++) {
      if (toPST(todayTimed[i].start_time) > now) return i;
    }
    return todayTimed.length;
  }, [todayTimed, now]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5">
        {/* Today */}
        <section className="glass-card anim-card p-5" style={{ animationDelay: "160ms" }}>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-text-heading mb-4">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Today
          </h2>

          {/* All-day events */}
          {todayAllDay.map((ev) => (
            <div key={ev.id} className="glass-card p-3 mb-2 flex items-center gap-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent-amber/15 text-accent-amber shrink-0">
                All day
              </span>
              <span className="text-sm font-medium text-text-heading truncate">{ev.subject}</span>
              {ev.location && <span className="text-xs text-text-muted truncate">{ev.location}</span>}
            </div>
          ))}

          {todayTimed.length === 0 && todayAllDay.length === 0 && (
            <div className="text-sm text-text-muted text-center py-6">No events today</div>
          )}

          {/* Timed events with NOW marker */}
          <div className="space-y-2">
            {todayTimed.map((ev, i) => (
              <div key={ev.id}>
                {i === nowInsertBefore && <NowMarker />}
                <EventCard ev={ev} now={now} />
              </div>
            ))}
            {nowInsertBefore === todayTimed.length && todayTimed.length > 0 && <NowMarker />}
          </div>
        </section>

        <WeatherCard />
      </div>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <section className="glass-card p-5">
          <h2 className="text-sm font-semibold text-text-heading mb-4 flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Upcoming
          </h2>
          <div className="space-y-2">
            {upcoming.slice(0, 10).map((ev) => {
              const start = toPST(ev.start_time);
              const dateLabel = start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
              return (
                <div key={ev.id} className="glass-card p-3 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-text-muted shrink-0">
                        {dateLabel}
                      </span>
                      <span className="text-xs text-text-muted tabular-nums">
                        {ev.is_all_day ? "All day" : formatTimeRange(ev)}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-text-heading mt-0.5">{ev.subject}</div>
                    {ev.location && <div className="text-xs text-text-muted mt-0.5">{ev.location}</div>}
                  </div>
                  {ev.join_url && (
                    <a
                      href={ev.join_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md bg-accent-teal/15 text-accent-teal hover:bg-accent-teal/25 transition-colors"
                    >
                      Join
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <MeetingPrep meetings={meetingPrep} />
    </div>
  );
}
