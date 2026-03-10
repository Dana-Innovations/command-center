"use client";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar, Doughnut, Pie } from "react-chartjs-2";
import { useSalesforce } from "@/hooks/useSalesforce";
import { SalesforceOpportunity } from "@/lib/types";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

const chartTextColor = "#B8B8B8";
const gridColor = "rgba(255,255,255,0.06)";

// Stage ordering for the funnel — matches Salesforce picklist (includes -PG variants)
const STAGE_ORDER = [
  "Qualification", "Qualification - PG",
  "Discovery", "Discovery - PG",
  "Rendering", "Rendering - PG",
  "Prototype", "Prototype - PG",
  "Engineering", "Engineering - PG",
  "Quote Created", "Quote Created - PG",
  "Proposal", "Proposal - PG",
  "Proof of Concept", "Proof of Concept - PG",
  "Design Review", "Design Review - PG",
  "Pending Order", "Pending Order - PG",
  "Qualified", "Qualified - PG",
  "Forecasted", "Forecasted - PG",
  "Closed Won",
];

const STAGE_COLORS: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  "Qualification":     { bg: "rgba(102,102,102,0.75)", border: "#666",    text: "text-[#999]",       badge: "bg-[rgba(102,102,102,0.15)] text-[#999]" },
  "Discovery":         { bg: "rgba(0,163,225,0.75)",  border: "#00A3E1", text: "text-accent-amber", badge: "bg-accent-amber/15 text-accent-amber" },
  "Rendering":         { bg: "rgba(54,162,235,0.65)",  border: "#36A2EB", text: "text-[#5BB5F5]",    badge: "bg-[rgba(54,162,235,0.15)] text-[#5BB5F5]" },
  "Prototype":         { bg: "rgba(160,120,220,0.65)", border: "#A078DC", text: "text-[#C4A8F0]",    badge: "bg-[rgba(160,120,220,0.15)] text-[#C4A8F0]" },
  "Engineering":       { bg: "rgba(255,159,64,0.65)",  border: "#FF9F40", text: "text-[#FFB870]",    badge: "bg-[rgba(255,159,64,0.15)] text-[#FFB870]" },
  "Quote Created":     { bg: "rgba(0,163,225,0.65)",  border: "#00A3E1", text: "text-accent-teal",  badge: "bg-accent-teal/15 text-accent-teal" },
  "Proposal":          { bg: "rgba(0,163,225,0.75)",  border: "#00A3E1", text: "text-accent-teal",  badge: "bg-accent-teal/15 text-accent-teal" },
  "Proof of Concept":  { bg: "rgba(0,112,210,0.65)",   border: "#0070D2", text: "text-[#5BB5F5]",    badge: "bg-[rgba(0,112,210,0.15)] text-[#5BB5F5]" },
  "Design Review":     { bg: "rgba(153,102,255,0.65)", border: "#9966FF", text: "text-[#B899FF]",    badge: "bg-[rgba(153,102,255,0.15)] text-[#B899FF]" },
  "Pending Order":     { bg: "rgba(232,93,93,0.75)",   border: "#E85D5D", text: "text-accent-red",   badge: "bg-accent-red/15 text-accent-red" },
  "Qualified":         { bg: "rgba(0,178,169,0.65)",  border: "#00B2A9", text: "text-accent-green", badge: "bg-accent-green/15 text-accent-green" },
  "Forecasted":        { bg: "rgba(0,178,169,0.75)",  border: "#00B2A9", text: "text-accent-green", badge: "bg-accent-green/15 text-accent-green" },
  "Closed Won":        { bg: "rgba(0,178,169,0.85)",  border: "#00B2A9", text: "text-accent-green", badge: "bg-accent-green/15 text-accent-green" },
};

const DEFAULT_STAGE = { bg: "rgba(102,102,102,0.5)", border: "#666", text: "text-text-muted", badge: "bg-[rgba(102,102,102,0.15)] text-[#999]" };

function getStageStyle(stage: string) {
  // Handle " - PG" procurement group variants by stripping the suffix
  const base = stage.replace(/ - PG$/, "");
  return STAGE_COLORS[base] || DEFAULT_STAGE;
}

function stageBadge(stage: string) {
  const style = getStageStyle(stage);
  return (
    <span className={cn("text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded whitespace-nowrap", style.badge)}>
      {stage}
    </span>
  );
}

function fmt$(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function SFLink({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[#0070D2] hover:text-[#005FB2] transition-colors" title="Open in Salesforce">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </svg>
    </a>
  );
}

// ─── Expandable Row Detail ───────────────────────────────────────
function DealDetail({ deal }: { deal: SalesforceOpportunity }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 px-4 py-3 bg-[rgba(255,255,255,0.02)] border-t border-white/5 text-xs">
      {deal.next_step && <Field label="Next Step" value={deal.next_step} />}
      {deal.last_activity_date && <Field label="Last Activity" value={new Date(deal.last_activity_date).toLocaleDateString()} />}
      {deal.territory && <Field label="Territory" value={deal.territory} />}
      {deal.forecast_category && <Field label="Forecast" value={deal.forecast_category} />}
      {deal.product_line && <Field label="Product Line" value={deal.product_line} />}
      {deal.sales_channel && <Field label="Channel" value={deal.sales_channel} />}
      {deal.record_type && <Field label="Record Type" value={deal.record_type} />}
      {deal.opp_type && <Field label="Type" value={deal.opp_type} />}
      {deal.days_in_stage != null && <Field label="Days in Stage" value={`${deal.days_in_stage}d`} />}
      {deal.push_count != null && deal.push_count > 0 && <Field label="Push Count" value={String(deal.push_count)} />}
      {deal.has_overdue_task && <Field label="Overdue Task" value="Yes" className="text-accent-red" />}
    </div>
  );
}

function Field({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <div className="text-text-muted uppercase tracking-wider text-[10px] mb-0.5">{label}</div>
      <div className={cn("text-text-body font-medium", className)}>{value}</div>
    </div>
  );
}

// ─── Main SalesView ──────────────────────────────────────────────
export function SalesView() {
  const { openOpps, closedWonOpps, loading } = useSalesforce();

  // ── Filter state for Full Deal Table ──
  const [search, setSearch] = useState("");
  const [filterStage, setFilterStage] = useState("");
  const [filterTerritory, setFilterTerritory] = useState("");
  const [filterRep, setFilterRep] = useState("");
  const [filterChannel, setFilterChannel] = useState("");
  const [filterRecordType, setFilterRecordType] = useState("");
  const [sortKey, setSortKey] = useState<keyof SalesforceOpportunity>("close_date");
  const [sortAsc, setSortAsc] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // ── Derived data ──
  const totalPipeline = useMemo(() => openOpps.reduce((s, o) => s + (o.amount || 0), 0), [openOpps]);
  const closedWonTotal = useMemo(() => closedWonOpps.reduce((s, o) => s + (o.amount || 0), 0), [closedWonOpps]);
  const avgDealSize = useMemo(() => openOpps.length > 0 ? totalPipeline / openOpps.length : 0, [totalPipeline, openOpps]);
  const weightedPipeline = useMemo(() => openOpps.reduce((s, o) => s + (o.amount || 0) * (o.probability || 0) / 100, 0), [openOpps]);

  // Stage funnel data
  const stageFunnel = useMemo(() => {
    const map = new Map<string, { count: number; value: number }>();
    openOpps.forEach((o) => {
      const s = o.stage || "Unknown";
      const cur = map.get(s) || { count: 0, value: 0 };
      cur.count++;
      cur.value += o.amount || 0;
      map.set(s, cur);
    });
    // Sort by STAGE_ORDER, then alphabetical for unknowns
    const ordered = [...map.entries()].sort((a, b) => {
      const ia = STAGE_ORDER.indexOf(a[0]);
      const ib = STAGE_ORDER.indexOf(b[0]);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return a[0].localeCompare(b[0]);
    });
    return ordered.map(([stage, data]) => ({ stage, ...data }));
  }, [openOpps]);

  // Rep leaderboard — top 10
  const repLeaderboard = useMemo(() => {
    const map = new Map<string, number>();
    openOpps.forEach((o) => {
      const rep = o.owner_name || "Unknown";
      map.set(rep, (map.get(rep) || 0) + (o.amount || 0));
    });
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([rep, value]) => ({ rep, value }));
  }, [openOpps]);

  // Territory breakdown
  const territoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    openOpps.forEach((o) => {
      const t = o.territory || "Unassigned";
      map.set(t, (map.get(t) || 0) + (o.amount || 0));
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [openOpps]);

  // Sales channel mix
  const channelMix = useMemo(() => {
    const map = new Map<string, number>();
    openOpps.forEach((o) => {
      const c = o.sales_channel || "Unknown";
      map.set(c, (map.get(c) || 0) + (o.amount || 0));
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [openOpps]);

  // Deal velocity — avg age per stage
  const dealVelocity = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    openOpps.forEach((o) => {
      if (o.age_in_days == null) return;
      const s = o.stage || "Unknown";
      const cur = map.get(s) || { total: 0, count: 0 };
      cur.total += o.age_in_days;
      cur.count++;
      map.set(s, cur);
    });
    return [...map.entries()]
      .map(([stage, d]) => ({ stage, avg: Math.round(d.total / d.count) }))
      .sort((a, b) => {
        const ia = STAGE_ORDER.indexOf(a.stage);
        const ib = STAGE_ORDER.indexOf(b.stage);
        if (ia >= 0 && ib >= 0) return ia - ib;
        if (ia >= 0) return -1;
        if (ib >= 0) return 1;
        return a.stage.localeCompare(b.stage);
      });
  }, [openOpps]);

  // At-risk deals
  const atRiskDeals = useMemo(() => {
    return openOpps
      .filter((o) => o.days_to_close <= 14 || (o.days_in_stage != null && o.days_in_stage > 30) || o.has_overdue_task)
      .sort((a, b) => a.days_to_close - b.days_to_close);
  }, [openOpps]);

  // Unique values for filter dropdowns
  const uniqueStages = useMemo(() => {
    // Sort stages by pipeline total descending
    const stageTotal = new Map<string, number>();
    openOpps.forEach((o) => {
      stageTotal.set(o.stage, (stageTotal.get(o.stage) || 0) + (o.amount || 0));
    });
    return [...new Set(openOpps.map((o) => o.stage))].sort(
      (a, b) => (stageTotal.get(b) || 0) - (stageTotal.get(a) || 0)
    );
  }, [openOpps]);
  const uniqueTerritories = useMemo(() => [...new Set(openOpps.map((o) => o.territory || "").filter(Boolean))].sort(), [openOpps]);
  const uniqueReps = useMemo(() => [...new Set(openOpps.map((o) => o.owner_name))].sort(), [openOpps]);
  const uniqueChannels = useMemo(() => [...new Set(openOpps.map((o) => o.sales_channel || "").filter(Boolean))].sort(), [openOpps]);
  const uniqueRecordTypes = useMemo(() => [...new Set(openOpps.map((o) => o.record_type || "").filter(Boolean))].sort(), [openOpps]);

  // Filtered + sorted deals for full table
  const filteredDeals = useMemo(() => {
    let deals = [...openOpps];
    if (search) {
      const q = search.toLowerCase();
      deals = deals.filter((o) => o.name.toLowerCase().includes(q) || o.account_name.toLowerCase().includes(q));
    }
    if (filterStage) deals = deals.filter((o) => o.stage === filterStage);
    if (filterTerritory) deals = deals.filter((o) => o.territory === filterTerritory);
    if (filterRep) deals = deals.filter((o) => o.owner_name === filterRep);
    if (filterChannel) deals = deals.filter((o) => o.sales_channel === filterChannel);
    if (filterRecordType) deals = deals.filter((o) => o.record_type === filterRecordType);

    deals.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return sortAsc ? av - bv : bv - av;
      return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return deals;
  }, [openOpps, search, filterStage, filterTerritory, filterRep, filterChannel, filterRecordType, sortKey, sortAsc]);

  function toggleSort(key: keyof SalesforceOpportunity) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  }

  function toggleExpand(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Chart palette
  const PALETTE = [
    "rgba(0,112,210,0.75)", "rgba(0,163,225,0.75)", "rgba(0,163,225,0.75)",
    "rgba(232,93,93,0.75)", "rgba(0,178,169,0.75)", "rgba(160,120,220,0.75)",
    "rgba(255,159,64,0.75)", "rgba(54,162,235,0.75)", "rgba(255,99,132,0.75)",
    "rgba(153,102,255,0.75)", "rgba(255,205,86,0.75)", "rgba(201,203,207,0.75)",
  ];
  const PALETTE_BORDER = [
    "#0070D2", "#00A3E1", "#00B2A9", "#E85D5D", "#00B2A9", "#A078DC",
    "#FF9F40", "#36A2EB", "#FF6384", "#9966FF", "#FFCD56", "#C9CBCF",
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-amber" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {openOpps.length === 0 && (
        <div className="glass-card p-6 text-center">
          <div className="text-2xl mb-2">📊</div>
          <div className="text-sm font-semibold text-text-heading mb-1">Salesforce not connected</div>
          <div className="text-xs text-text-muted">OAuth token required for server-side access. Contact IT to configure.</div>
        </div>
      )}
      
      {/* ── Section A: KPI Hero Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Total Open Pipeline" value={fmt$(totalPipeline)} color="text-[#0070D2]" />
        <KPICard label="Closed-Won FY" value={fmt$(closedWonTotal)} color="text-accent-green" />
        <KPICard label="Avg Deal Size" value={fmt$(avgDealSize)} color="text-accent-amber" />
        <KPICard label="Weighted Pipeline" value={fmt$(weightedPipeline)} color="text-accent-teal" />
      </div>

      {/* ── Section B: Pipeline Funnel ── */}
      <section className="glass-card p-6">
        <h2 className="text-sm font-semibold text-text-heading mb-4 flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0070D2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          Pipeline Funnel
        </h2>
        <div className="h-[300px]">
          <Bar
            data={{
              labels: stageFunnel.map((s) => `${s.stage} (${s.count})`),
              datasets: [{
                label: "Pipeline Value",
                data: stageFunnel.map((s) => s.value),
                backgroundColor: stageFunnel.map((s) => getStageStyle(s.stage).bg),
                borderColor: stageFunnel.map((s) => getStageStyle(s.stage).border),
                borderWidth: 1,
                borderRadius: 4,
              }],
            }}
            options={{
              indexAxis: "y",
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => fmt$(ctx.raw as number) } },
              },
              scales: {
                x: { grid: { color: gridColor }, ticks: { callback: (v) => fmt$(Number(v)), color: chartTextColor } },
                y: { grid: { color: gridColor }, ticks: { color: chartTextColor } },
              },
            }}
          />
        </div>
      </section>

      {/* ── Section C: Rep Leaderboard + Territory Breakdown ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className="glass-card p-6">
          <h2 className="text-sm font-semibold text-text-heading mb-4">Rep Leaderboard — Top 10</h2>
          <div className="h-[300px]">
            <Bar
              data={{
                labels: repLeaderboard.map((r) => r.rep),
                datasets: [{
                  label: "Open Pipeline",
                  data: repLeaderboard.map((r) => r.value),
                  backgroundColor: "rgba(0,112,210,0.7)",
                  borderColor: "#0070D2",
                  borderWidth: 1,
                  borderRadius: 4,
                }],
              }}
              options={{
                indexAxis: "y",
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: { callbacks: { label: (ctx) => fmt$(ctx.raw as number) } },
                },
                scales: {
                  x: { grid: { color: gridColor }, ticks: { callback: (v) => fmt$(Number(v)), color: chartTextColor } },
                  y: { grid: { color: gridColor }, ticks: { color: chartTextColor, font: { size: 11 } } },
                },
              }}
            />
          </div>
        </section>

        <section className="glass-card p-6">
          <h2 className="text-sm font-semibold text-text-heading mb-4">Territory Breakdown</h2>
          <div className="h-[300px] flex items-center justify-center">
            <Doughnut
              data={{
                labels: territoryBreakdown.map(([t, v]) => `${t} (${fmt$(v)})`),
                datasets: [{
                  data: territoryBreakdown.map(([, v]) => v),
                  backgroundColor: territoryBreakdown.map((_, i) => PALETTE[i % PALETTE.length]),
                  borderColor: territoryBreakdown.map((_, i) => PALETTE_BORDER[i % PALETTE_BORDER.length]),
                  borderWidth: 2,
                  hoverOffset: 6,
                }],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                cutout: "55%",
                plugins: {
                  legend: { position: "right", labels: { padding: 10, usePointStyle: true, color: chartTextColor, font: { size: 11 } } },
                  tooltip: { callbacks: { label: (ctx) => fmt$(ctx.raw as number) } },
                },
              }}
            />
          </div>
        </section>
      </div>

      {/* ── Section D: Sales Channel Mix + Deal Velocity ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className="glass-card p-6">
          <h2 className="text-sm font-semibold text-text-heading mb-4">Sales Channel Mix</h2>
          <div className="h-[280px] flex items-center justify-center">
            <Pie
              data={{
                labels: channelMix.map(([c, v]) => `${c} (${fmt$(v)})`),
                datasets: [{
                  data: channelMix.map(([, v]) => v),
                  backgroundColor: channelMix.map((_, i) => PALETTE[i % PALETTE.length]),
                  borderColor: channelMix.map((_, i) => PALETTE_BORDER[i % PALETTE_BORDER.length]),
                  borderWidth: 2,
                  hoverOffset: 6,
                }],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: "right", labels: { padding: 10, usePointStyle: true, color: chartTextColor, font: { size: 11 } } },
                  tooltip: { callbacks: { label: (ctx) => fmt$(ctx.raw as number) } },
                },
              }}
            />
          </div>
        </section>

        <section className="glass-card p-6">
          <h2 className="text-sm font-semibold text-text-heading mb-4">Deal Velocity — Avg Age by Stage</h2>
          <div className="h-[280px]">
            {dealVelocity.length > 0 ? (
              <Bar
                data={{
                  labels: dealVelocity.map((d) => d.stage),
                  datasets: [{
                    label: "Avg Days",
                    data: dealVelocity.map((d) => d.avg),
                    backgroundColor: dealVelocity.map((d) => getStageStyle(d.stage).bg),
                    borderColor: dealVelocity.map((d) => getStageStyle(d.stage).border),
                    borderWidth: 1,
                    borderRadius: 4,
                  }],
                }}
                options={{
                  indexAxis: "y",
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => `${ctx.raw} days` } },
                  },
                  scales: {
                    x: { grid: { color: gridColor }, ticks: { callback: (v) => `${v}d`, color: chartTextColor } },
                    y: { grid: { color: gridColor }, ticks: { color: chartTextColor, font: { size: 11 } } },
                  },
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-text-muted text-sm">
                No age data available — sync live data to populate
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ── Section E: At-Risk Deals ── */}
      {atRiskDeals.length > 0 && (
        <section className="glass-card p-6">
          <h2 className="text-sm font-semibold text-accent-red mb-4 flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            At-Risk Deals ({atRiskDeals.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-text-muted uppercase tracking-wider border-b border-white/10">
                  <th className="pb-2 pr-3">Deal</th>
                  <th className="pb-2 pr-3">Account</th>
                  <th className="pb-2 pr-3">Rep</th>
                  <th className="pb-2 pr-3">Stage</th>
                  <th className="pb-2 pr-3 text-right">Amount</th>
                  <th className="pb-2 pr-3 text-right">Days to Close</th>
                  <th className="pb-2 pr-3 text-right">Days in Stage</th>
                  <th className="pb-2 pr-3">Next Step</th>
                  <th className="pb-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {atRiskDeals.map((deal) => (
                  <AtRiskRow key={deal.id} deal={deal} expanded={expandedRows.has(deal.id)} onToggle={() => toggleExpand(deal.id)} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Section F: Full Deal Table ── */}
      <section className="glass-card p-6">
        <h2 className="text-sm font-semibold text-text-heading mb-4">All Open Deals ({openOpps.length})</h2>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <input
            type="text"
            placeholder="Search deals or accounts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-text-body placeholder:text-text-muted focus:outline-none focus:border-accent-amber/50 min-w-[200px]"
          />
          <FilterSelect label="Stage" value={filterStage} options={uniqueStages} onChange={setFilterStage} />
          <FilterSelect label="Territory" value={filterTerritory} options={uniqueTerritories} onChange={setFilterTerritory} />
          <FilterSelect label="Rep" value={filterRep} options={uniqueReps} onChange={setFilterRep} />
          <FilterSelect label="Channel" value={filterChannel} options={uniqueChannels} onChange={setFilterChannel} />
          <FilterSelect label="Record Type" value={filterRecordType} options={uniqueRecordTypes} onChange={setFilterRecordType} />
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-text-muted uppercase tracking-wider border-b border-white/10">
                <SortHeader label="Deal" field="name" sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
                <SortHeader label="Account" field="account_name" sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
                <SortHeader label="Rep" field="owner_name" sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
                <th className="pb-2 pr-3">Stage</th>
                <SortHeader label="Amount" field="amount" sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} className="text-right" />
                <SortHeader label="Prob" field="probability" sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} className="text-right" />
                <SortHeader label="Close Date" field="close_date" sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
                <SortHeader label="Age" field="age_in_days" sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} className="text-right" />
                <th className="pb-2 pr-3">Next Step</th>
                <th className="pb-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {filteredDeals.map((deal) => (
                <DealRow key={deal.id} deal={deal} expanded={expandedRows.has(deal.id)} onToggle={() => toggleExpand(deal.id)} />
              ))}
              {filteredDeals.length === 0 && (
                <tr><td colSpan={10} className="text-center py-8 text-text-muted">No deals match your filters</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 text-[10px] text-text-muted">
          {filteredDeals.length} deals &middot; {fmt$(filteredDeals.reduce((s, o) => s + (o.amount || 0), 0))} total
        </div>
      </section>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────

function KPICard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="glass-card p-4">
      <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">{label}</div>
      <div className={cn("text-2xl font-bold tabular-nums", color)}>{value}</div>
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-text-body focus:outline-none focus:border-accent-amber/50 cursor-pointer"
    >
      <option value="">All {label}s</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function SortHeader({ label, field, sortKey, sortAsc, onSort, className }: {
  label: string;
  field: keyof SalesforceOpportunity;
  sortKey: keyof SalesforceOpportunity;
  sortAsc: boolean;
  onSort: (k: keyof SalesforceOpportunity) => void;
  className?: string;
}) {
  const arrow = sortKey === field ? (sortAsc ? " \u25B2" : " \u25BC") : "";
  return (
    <th className={cn("pb-2 pr-3 cursor-pointer hover:text-text-body transition-colors select-none", className)} onClick={() => onSort(field)}>
      {label}{arrow}
    </th>
  );
}

function DealRow({ deal, expanded, onToggle }: { deal: SalesforceOpportunity; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="border-b border-white/5 hover:bg-white/[0.02] cursor-pointer" onClick={onToggle}>
        <td className="py-2 pr-3 font-medium text-text-heading max-w-[200px] truncate">{deal.name}</td>
        <td className="py-2 pr-3 text-text-body max-w-[140px] truncate">{deal.account_name}</td>
        <td className="py-2 pr-3 text-text-body">{deal.owner_name}</td>
        <td className="py-2 pr-3">{stageBadge(deal.stage)}</td>
        <td className="py-2 pr-3 text-right font-bold tabular-nums text-text-heading">{fmt$(deal.amount || 0)}</td>
        <td className="py-2 pr-3 text-right tabular-nums text-text-body">{deal.probability}%</td>
        <td className="py-2 pr-3 tabular-nums text-text-body">{new Date(deal.close_date).toLocaleDateString()}</td>
        <td className="py-2 pr-3 text-right tabular-nums text-text-body">{deal.age_in_days != null ? `${deal.age_in_days}d` : "—"}</td>
        <td className="py-2 pr-3 text-text-muted max-w-[160px] truncate">{deal.next_step || "—"}</td>
        <td className="py-2"><SFLink url={deal.sf_url} /></td>
      </tr>
      {expanded && (
        <tr><td colSpan={10}><DealDetail deal={deal} /></td></tr>
      )}
    </>
  );
}

function AtRiskRow({ deal, expanded, onToggle }: { deal: SalesforceOpportunity; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="border-b border-white/5 hover:bg-accent-red/[0.03] cursor-pointer" onClick={onToggle}>
        <td className="py-2 pr-3 font-medium text-text-heading max-w-[200px] truncate">{deal.name}</td>
        <td className="py-2 pr-3 text-text-body max-w-[140px] truncate">{deal.account_name}</td>
        <td className="py-2 pr-3 text-text-body">{deal.owner_name}</td>
        <td className="py-2 pr-3">{stageBadge(deal.stage)}</td>
        <td className="py-2 pr-3 text-right font-bold tabular-nums text-text-heading">{fmt$(deal.amount || 0)}</td>
        <td className={cn("py-2 pr-3 text-right tabular-nums font-semibold", deal.days_to_close <= 7 ? "text-accent-red" : deal.days_to_close <= 14 ? "text-accent-amber" : "text-text-body")}>
          {deal.days_to_close}d
        </td>
        <td className={cn("py-2 pr-3 text-right tabular-nums", deal.days_in_stage != null && deal.days_in_stage > 30 ? "text-accent-amber font-semibold" : "text-text-body")}>
          {deal.days_in_stage != null ? `${deal.days_in_stage}d` : "—"}
        </td>
        <td className="py-2 pr-3 text-text-muted max-w-[160px] truncate">{deal.next_step || "—"}</td>
        <td className="py-2"><SFLink url={deal.sf_url} /></td>
      </tr>
      {expanded && (
        <tr><td colSpan={9}><DealDetail deal={deal} /></td></tr>
      )}
    </>
  );
}
