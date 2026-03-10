"use client";
import { cn } from "@/lib/utils";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Bar, Line, Doughnut, Pie } from "react-chartjs-2";
import { usePriorityScore } from "@/hooks/usePriorityScore";
import { useCalendar } from "@/hooks/useCalendar";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler
);

const chartTextColor = "#B8B8B8";
const gridColor = "rgba(255,255,255,0.06)";

export function TrendsView() {
  const { items } = usePriorityScore();
  const { events } = useCalendar();
  const counts = { 
    email: items.filter(i => i.source === 'email').length,
    asana: items.filter(i => i.source === 'asana').length,
    teams: items.filter(i => i.source === 'teams').length,
    slack: items.filter(i => i.source === 'slack').length,
    salesforce: items.filter(i => i.source === 'salesforce').length,
  };

  const scoreBands = {
    "90-100": items.filter(i => (i.displayScore ?? 0) >= 90).length,
    "70-89": items.filter(i => (i.displayScore ?? 0) >= 70 && (i.displayScore ?? 0) < 90).length,
    "50-69": items.filter(i => (i.displayScore ?? 0) >= 50 && (i.displayScore ?? 0) < 70).length,
    "Below 50": items.filter(i => (i.displayScore ?? 0) < 50).length,
  };

  // Live: compute meeting vs free time for today from real calendar
  const todayMeetingHrs = (() => {
    const pstOffset = -8 * 60;
    const now = new Date();
    const todayPST = new Date(now.getTime() + (now.getTimezoneOffset() + pstOffset) * 60000);
    const todayStr = todayPST.toISOString().slice(0, 10);
    let totalMins = 0;
    for (const ev of events) {
      const start = new Date(ev.start_time);
      const end = new Date(ev.end_time);
      const startPST = new Date(start.getTime() + (start.getTimezoneOffset() + pstOffset) * 60000);
      if (startPST.toISOString().slice(0, 10) !== todayStr) continue;
      totalMins += Math.max(0, (end.getTime() - start.getTime()) / 60000);
    }
    return Math.round(totalMins / 60 * 10) / 10;
  })();
  const workdayHrs = 10;
  const freeHrs = Math.max(0, Math.round((workdayHrs - todayMeetingHrs) * 10) / 10);
  const meetingLabel = `Meetings (${todayMeetingHrs}h)`;
  const freeLabel = `Free Time (${freeHrs}h)`;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Chart 1: Priority Score Distribution */}
        <section className="glass-card anim-card p-6">
          <h2 className="text-sm font-semibold text-text-heading mb-4">Priority Score Distribution</h2>
          <div className="h-[250px]">
            <Bar
              data={{
                labels: ["90\u2013100 (Critical)", "70\u201389 (High)", "50\u201369 (Medium)", "Below 50 (Low)"],
                datasets: [{
                  label: "Items",
                  data: [scoreBands["90-100"], scoreBands["70-89"], scoreBands["50-69"], scoreBands["Below 50"]],
                  backgroundColor: [
                    "rgba(232,93,93,0.75)",
                    "rgba(0,163,225,0.75)",
                    "rgba(0,178,169,0.75)",
                    "rgba(102,102,102,0.75)",
                  ],
                  borderColor: ["#E85D5D", "#00A3E1", "#00B2A9", "#666"],
                  borderWidth: 1,
                  borderRadius: 4,
                }],
              }}
              options={{
                indexAxis: "y" as const,
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      label: (ctx) => `${ctx.raw} item${ctx.raw !== 1 ? "s" : ""}`,
                    },
                  },
                },
                scales: {
                  x: {
                    grid: { color: gridColor },
                    ticks: { precision: 0, color: chartTextColor },
                  },
                  y: {
                    grid: { color: gridColor },
                    ticks: { color: chartTextColor },
                  },
                },
              }}
            />
          </div>
        </section>

        {/* Chart 2: Bookings Pace */}
        <section className="glass-card anim-card p-6" style={{ animationDelay: "80ms" }}>
          <h2 className="text-sm font-semibold text-text-heading mb-4">Bookings Pace \u2014 5 Day Trend</h2>
          <div className="h-[250px]">
            <Line
              data={{
                labels: ["Day 15", "Day 16", "Day 17", "Day 18", "Day 19", "Day 20"],
                datasets: [
                  {
                    label: "ALL",
                    data: [48, 51, 53, 55, 57, 59],
                    borderColor: "#E85D5D",
                    backgroundColor: "rgba(232,93,93,0.1)",
                    borderWidth: 2,
                    pointBackgroundColor: "#E85D5D",
                    pointRadius: 4,
                    tension: 0.35,
                    fill: true,
                  },
                  {
                    label: "Commercial",
                    data: [85, 92, 98, 108, 118, 125],
                    borderColor: "#00B2A9",
                    backgroundColor: "rgba(0,178,169,0.08)",
                    borderWidth: 2,
                    pointBackgroundColor: "#00B2A9",
                    pointRadius: 4,
                    tension: 0.35,
                    fill: true,
                  },
                  {
                    label: "100% Target",
                    data: [100, 100, 100, 100, 100, 100],
                    borderColor: "rgba(255,255,255,0.25)",
                    borderWidth: 1.5,
                    borderDash: [6, 4],
                    pointRadius: 0,
                    fill: false,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    labels: { usePointStyle: true, pointStyle: "circle", padding: 16, color: chartTextColor },
                  },
                  tooltip: {
                    callbacks: {
                      label: (ctx) => `${ctx.dataset.label}: ${ctx.raw}%`,
                    },
                  },
                },
                scales: {
                  x: {
                    grid: { color: gridColor },
                    ticks: { color: chartTextColor },
                  },
                  y: {
                    min: 30,
                    max: 140,
                    grid: { color: gridColor },
                    ticks: { callback: (v) => `${v}%`, color: chartTextColor },
                  },
                },
              }}
            />
          </div>
        </section>

        {/* Chart 3: Meeting vs Free Time */}
        <section className="glass-card anim-card p-6" style={{ animationDelay: "160ms" }}>
          <h2 className="text-sm font-semibold text-text-heading mb-4">Meeting vs. Free Time — Today <span className="text-xs font-normal text-text-muted">(live)</span></h2>
          <div className="h-[250px] flex items-center justify-center">
            <Doughnut
              data={{
                labels: [meetingLabel, freeLabel],
                datasets: [{
                  data: [todayMeetingHrs || 0.1, freeHrs || 0.1],
                  backgroundColor: ["rgba(0,163,225,0.8)", "rgba(0,178,169,0.6)"],
                  borderColor: ["#00A3E1", "#00B2A9"],
                  borderWidth: 2,
                  hoverOffset: 6,
                }],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                cutout: "65%",
                plugins: {
                  legend: {
                    position: "bottom",
                    labels: { padding: 16, usePointStyle: true, color: chartTextColor },
                  },
                },
              }}
            />
          </div>
        </section>

        {/* Chart 4: Source Breakdown */}
        <section className="glass-card anim-card p-6" style={{ animationDelay: "240ms" }}>
          <h2 className="text-sm font-semibold text-text-heading mb-4">Source Breakdown</h2>
          <div className="h-[250px] flex items-center justify-center">
            <Pie
              data={{
                labels: [
                  `Asana (${counts.asana})`,
                  `Email (${counts.email})`,
                  `Salesforce (${counts.salesforce})`,
                  `Teams (${counts.teams})`,
                  `Slack (${counts.slack})`
                ],
                datasets: [{
                  data: [counts.asana, counts.email, counts.salesforce, counts.teams, counts.slack],
                  backgroundColor: [
                    "rgba(232,93,93,0.75)",
                    "rgba(0,163,225,0.75)",
                    "rgba(0,112,210,0.75)",
                    "rgba(0,178,169,0.75)",
                    "rgba(90,199,139,0.75)",
                  ],
                  borderColor: ["#E85D5D", "#00A3E1", "#0070D2", "#00B2A9", "#00B2A9"],
                  borderWidth: 2,
                  hoverOffset: 6,
                }],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: "bottom",
                    labels: { padding: 12, usePointStyle: true, color: chartTextColor },
                  },
                },
              }}
            />
          </div>
        </section>
        {/* Chart 5: Pipeline by Stage */}
        <section className="glass-card anim-card p-6 lg:col-span-2" style={{ animationDelay: "320ms" }}>
          <h2 className="text-sm font-semibold text-text-heading mb-4">Pipeline by Stage</h2>
          <div className="h-[250px]">
            <Bar
              data={{
                labels: ["Negotiation", "Proposal", "Qualification", "Prospecting"],
                datasets: [{
                  label: "Pipeline Value",
                  data: [760000, 454000, 287000, 223000],
                  backgroundColor: [
                    "rgba(232,93,93,0.75)",
                    "rgba(0,178,169,0.75)",
                    "rgba(0,163,225,0.75)",
                    "rgba(102,102,102,0.75)",
                  ],
                  borderColor: ["#E85D5D", "#00B2A9", "#00A3E1", "#666"],
                  borderWidth: 1,
                  borderRadius: 4,
                }],
              }}
              options={{
                indexAxis: "y" as const,
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      label: (ctx) => `$${((ctx.raw as number) / 1000).toFixed(0)}K`,
                    },
                  },
                },
                scales: {
                  x: {
                    grid: { color: gridColor },
                    ticks: {
                      callback: (v) => `$${(Number(v) / 1000).toFixed(0)}K`,
                      color: chartTextColor,
                    },
                  },
                  y: {
                    grid: { color: gridColor },
                    ticks: { color: chartTextColor },
                  },
                },
              }}
            />
          </div>
        </section>
      </div>

      {/* Power BI Embedded Reports */}
      <section className="glass-card anim-card p-6 lg:col-span-2" style={{ animationDelay: "400ms" }}>
        <h2 className="text-sm font-semibold text-text-heading mb-4">Power BI Analytics</h2>
        <div className="text-sm text-text-muted">
          Embedded Power BI reports appear here when configured. Add reports to the <code className="text-xs bg-white/5 px-1 py-0.5 rounded">powerbi_report_configs</code> table.
        </div>
      </section>

      {/* Live Insights */}
      <LiveInsights items={items} meetingHrs={todayMeetingHrs} />
    </div>
  );
}

function LiveInsights({ items, meetingHrs }: { items: { source: string; daysOverdue?: number; urgent?: boolean; financial?: boolean; legal?: boolean; displayScore?: number }[]; meetingHrs: number }) {
  const overdueCount = items.filter(i => (i.daysOverdue ?? 0) > 0).length;
  const criticalCount = items.filter(i => (i.displayScore ?? 0) >= 80).length;
  const financialCount = items.filter(i => i.financial).length;
  const legalCount = items.filter(i => i.legal).length;
  const totalItems = items.length;

  const insights: { color: string; text: string }[] = [];

  if (criticalCount > 0) insights.push({ color: "red", text: `${criticalCount} item${criticalCount > 1 ? 's' : ''} at critical priority (score ≥80) — needs attention today` });
  if (overdueCount > 0) insights.push({ color: "amber", text: `${overdueCount} overdue item${overdueCount > 1 ? 's' : ''} — review and either complete or reschedule` });
  if (legalCount > 0) insights.push({ color: "red", text: `${legalCount} legal-flagged item${legalCount > 1 ? 's' : ''} in your queue` });
  if (financialCount > 0) insights.push({ color: "amber", text: `${financialCount} finance-related item${financialCount > 1 ? 's' : ''} pending action` });
  if (meetingHrs > 6) insights.push({ color: "amber", text: `Heavy meeting day — ${meetingHrs}h of meetings scheduled. Block time for deep work tomorrow.` });
  else if (meetingHrs > 0) insights.push({ color: "green", text: `${meetingHrs}h of meetings today — reasonable load with space for focus work` });
  if (totalItems > 0 && criticalCount === 0 && overdueCount === 0) insights.push({ color: "green", text: "No critical or overdue items — you're on top of things" });

  if (insights.length === 0) {
    insights.push({ color: "green", text: "Queue is clear — good time to plan ahead or tackle a strategic project" });
  }

  return (
    <section className="glass-card anim-card p-6" style={{ animationDelay: "320ms" }}>
      <h2 className="text-sm font-semibold text-text-heading mb-4">Live Insights <span className="text-xs font-normal text-text-muted">(from your actual queue)</span></h2>
      <ul className="space-y-2.5">
        {insights.map((insight, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm text-text-body">
            <span className={cn(
              "w-2 h-2 rounded-full shrink-0 mt-1.5",
              insight.color === "red" ? "bg-accent-red" :
              insight.color === "green" ? "bg-accent-teal" :
              "bg-accent-amber"
            )} />
            {insight.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
