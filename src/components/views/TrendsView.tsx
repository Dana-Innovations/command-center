"use client";
import { useRef, useEffect } from "react";
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

// Score distribution data - matches prototype
const SCORE_BANDS = { "90-100": 4, "70-89": 8, "50-69": 7, "Below 50": 5 };

const INSIGHTS = [
  { color: "red", text: "ALL bookings at 59% on final day \u2014 Residential at 33% is the drag. Enterprise at 1%." },
  { color: "green", text: "Commercial crushing at 125% and Professional at 221% \u2014 strong channel execution" },
  { color: "red", text: "7 Asana tasks overdue > 30 days \u2014 consider bulk cleanup or reassignment" },
  { color: "amber", text: "Meeting load today: 54% of day \u2014 heavier than your 40% weekly average" },
  { color: "amber", text: "3 reply drafts pending > 7 days \u2014 Scott WRV, EP Wealth, NPI all awaiting response" },
  { color: "green", text: "Jeana offered Cortex MCP for Claude \u2014 say yes, it's a quick AI tooling win" },
];

const chartTextColor = "#B8B8B8";
const gridColor = "rgba(255,255,255,0.06)";

export function TrendsView() {
  const { items } = usePriorityScore();
  const counts = { 
    email: items.filter(i => i.source === 'email').length,
    asana: items.filter(i => i.source === 'asana').length,
    teams: items.filter(i => i.source === 'teams').length,
    slack: items.filter(i => i.source === 'slack').length,
    salesforce: items.filter(i => i.source === 'salesforce').length,
  };

  const scoreBands = {
    "90-100": items.filter(i => ((i as any).displayScore ?? 0) >= 90).length,
    "70-89": items.filter(i => ((i as any).displayScore ?? 0) >= 70 && ((i as any).displayScore ?? 0) < 90).length,
    "50-69": items.filter(i => ((i as any).displayScore ?? 0) >= 50 && ((i as any).displayScore ?? 0) < 70).length,
    "Below 50": items.filter(i => ((i as any).displayScore ?? 0) < 50).length,
  };

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
                    "rgba(212,164,76,0.75)",
                    "rgba(78,205,196,0.75)",
                    "rgba(102,102,102,0.75)",
                  ],
                  borderColor: ["#E85D5D", "#D4A44C", "#4ECDC4", "#666"],
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
                    borderColor: "#4ECDC4",
                    backgroundColor: "rgba(78,205,196,0.08)",
                    borderWidth: 2,
                    pointBackgroundColor: "#4ECDC4",
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
          <h2 className="text-sm font-semibold text-text-heading mb-4">Meeting vs. Free Time Today</h2>
          <div className="h-[250px] flex items-center justify-center">
            <Doughnut
              data={{
                labels: ["Meetings (6.5 hrs)", "Free Time (5.5 hrs)"],
                datasets: [{
                  data: [6.5, 5.5],
                  backgroundColor: ["rgba(212,164,76,0.8)", "rgba(78,205,196,0.6)"],
                  borderColor: ["#D4A44C", "#4ECDC4"],
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
                    "rgba(212,164,76,0.75)",
                    "rgba(0,112,210,0.75)",
                    "rgba(78,205,196,0.75)",
                    "rgba(90,199,139,0.75)",
                  ],
                  borderColor: ["#E85D5D", "#D4A44C", "#0070D2", "#4ECDC4", "#5AC78B"],
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
                    "rgba(78,205,196,0.75)",
                    "rgba(212,164,76,0.75)",
                    "rgba(102,102,102,0.75)",
                  ],
                  borderColor: ["#E85D5D", "#4ECDC4", "#D4A44C", "#666"],
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

      {/* Week-over-Week Insights */}
      <section className="glass-card anim-card p-6" style={{ animationDelay: "320ms" }}>
        <h2 className="text-sm font-semibold text-text-heading mb-4">Week-over-Week Insights</h2>
        <ul className="space-y-2.5">
          {INSIGHTS.map((insight, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm text-text-body">
              <span className={cn(
                "w-2 h-2 rounded-full shrink-0 mt-1.5",
                insight.color === "red" && "bg-accent-red",
                insight.color === "green" && "bg-accent-green",
                insight.color === "amber" && "bg-accent-amber"
              )} />
              {insight.text}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
