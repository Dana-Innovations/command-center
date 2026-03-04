"use client";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useMonday } from "@/hooks/useMonday";

// ─── Status badge colors ────────────────────────────────────────────────────

function statusColor(status: string) {
  const s = status.toUpperCase();
  if (s.includes("DWG NEEDED")) return "bg-accent-red/15 text-accent-red";
  if (s.includes("BONITA PO NEEDED")) return "bg-accent-amber/15 text-accent-amber";
  if (s.includes("SALES ORDER NEEDED")) return "bg-accent-amber/15 text-accent-amber";
  if (s.includes("IN PRODUCTION")) return "bg-accent-teal/15 text-accent-teal";
  if (s === "COMPLETE") return "bg-accent-green/15 text-accent-green";
  return "bg-white/10 text-text-muted";
}

function locationBadge(loc: string) {
  if (loc.toLowerCase().includes("minden")) return "text-accent-amber";
  if (loc.toLowerCase().includes("bonita")) return "text-accent-teal";
  return "text-text-muted";
}

function needsAttention(status: string) {
  const s = status.toUpperCase();
  return s.includes("DWG NEEDED") || s.includes("BONITA PO NEEDED") || s.includes("SALES ORDER NEEDED");
}

function fmtAmount(n: number) {
  if (!n) return "—";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

// ─── KPI Card ───────────────────────────────────────────────────────────────

function KPICard({ label, value, color, delay }: { label: string; value: string | number; color: string; delay: string }) {
  return (
    <div className="glass-card anim-card p-4" style={{ animationDelay: delay }}>
      <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">{label}</div>
      <div className={cn("text-2xl font-bold tabular-nums", color)}>{value}</div>
    </div>
  );
}

// ─── Main View ──────────────────────────────────────────────────────────────

export function MindensView() {
  const { orders, throughput, loading, error } = useMonday();
  const [prodOpen, setProdOpen] = useState(true);

  const activeOrders = useMemo(() =>
    orders.filter((o) => o.status.toUpperCase() !== "COMPLETE" || !o.group_title.toLowerCase().includes("archive")),
    [orders]
  );

  const mindenCount = useMemo(() => activeOrders.filter((o) => o.location.toLowerCase().includes("minden")).length, [activeOrders]);
  const bonitaCount = useMemo(() => activeOrders.filter((o) => o.location.toLowerCase().includes("bonita")).length, [activeOrders]);
  const attentionOrders = useMemo(() => activeOrders.filter((o) => needsAttention(o.status)), [activeOrders]);
  const inProduction = useMemo(() =>
    orders.filter((o) => o.status.toUpperCase().includes("IN PRODUCTION") || o.group_title.toLowerCase().includes("active in production")),
    [orders]
  );

  // Throughput: latest measurement per station
  const stationData = useMemo(() => {
    const map = new Map<string, { station: string; date: string; value: number; cycle_time: number; name: string }>();
    for (const t of throughput) {
      const existing = map.get(t.station);
      if (!existing || t.date > existing.date) {
        map.set(t.station, { station: t.station, date: t.date, value: t.value, cycle_time: t.cycle_time, name: t.name });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.station.localeCompare(b.station));
  }, [throughput]);

  if (loading) {
    return (
      <div className="space-y-5">
        {[1, 2, 3].map(i => (
          <div key={i} className="glass-card anim-card p-5 animate-pulse" style={{ animationDelay: `${i * 80}ms` }}>
            <div className="h-4 bg-white/10 rounded w-1/3 mb-3" />
            <div className="h-3 bg-white/5 rounded w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card p-6 text-center">
        <p className="text-accent-red text-sm mb-2">Failed to load Monday.com data</p>
        <p className="text-text-muted text-xs">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Active Orders" value={activeOrders.length} color="text-text-heading" delay="0ms" />
        <KPICard label="Minden Orders" value={mindenCount} color="text-accent-amber" delay="60ms" />
        <KPICard label="Bonita Orders" value={bonitaCount} color="text-accent-teal" delay="120ms" />
        <KPICard label="Needs Attention" value={attentionOrders.length} color="text-accent-red" delay="180ms" />
      </div>

      {/* Needs Attention table */}
      {attentionOrders.length > 0 && (
        <section className="glass-card anim-card p-5" style={{ animationDelay: "200ms" }}>
          <h2 className="text-sm font-semibold text-text-heading mb-4 flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Needs Attention
            <span className="text-[10px] bg-white/5 text-text-muted px-2 py-0.5 rounded-full">{attentionOrders.length}</span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-text-muted uppercase tracking-wider border-b border-white/10">
                  <th className="pb-2 pr-3">Order</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2 pr-3">Location</th>
                  <th className="pb-2 pr-3">Dealer</th>
                  <th className="pb-2 pr-3">SO#</th>
                  <th className="pb-2 pr-3 text-right">Amount</th>
                  <th className="pb-2 pr-3">Due</th>
                  <th className="pb-2">Model</th>
                </tr>
              </thead>
              <tbody>
                {attentionOrders.map((o) => (
                  <tr key={o.id} className="border-b border-white/5 hover:bg-white/[0.02] border-l-4 border-l-accent-red/60">
                    <td className="py-2 pr-3">
                      <a href={o.monday_url} target="_blank" rel="noopener noreferrer" className="font-medium text-text-heading hover:text-accent-amber transition-colors">
                        {o.name}
                      </a>
                    </td>
                    <td className="py-2 pr-3">
                      <span className={cn("text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded", statusColor(o.status))}>
                        {o.status}
                      </span>
                    </td>
                    <td className={cn("py-2 pr-3 font-medium", locationBadge(o.location))}>{o.location || "—"}</td>
                    <td className="py-2 pr-3 text-text-body">{o.dealer || "—"}</td>
                    <td className="py-2 pr-3 text-text-muted font-mono">{o.sales_order || "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-text-body">{fmtAmount(o.amount)}</td>
                    <td className="py-2 pr-3 text-text-muted">{o.due_date || "—"}</td>
                    <td className="py-2 text-text-muted">{o.model || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Throughput by Station */}
      <section className="glass-card anim-card p-5" style={{ animationDelay: "280ms" }}>
        <h2 className="text-sm font-semibold text-text-heading mb-4 flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="4" /><line x1="12" y1="20" x2="12" y2="10" /><line x1="6" y1="20" x2="6" y2="14" />
          </svg>
          Throughput by Station
          <span className="text-[10px] bg-white/5 text-text-muted px-2 py-0.5 rounded-full">{stationData.length}</span>
        </h2>
        {stationData.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {stationData.map((s) => (
              <div key={s.station} className="rounded-xl bg-white/[0.03] border border-white/5 p-3">
                <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1 truncate">{s.station}</div>
                <div className="text-xl font-bold text-text-heading tabular-nums">{s.value}</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-text-muted">{s.date}</span>
                  {s.cycle_time > 0 && (
                    <span className="text-[10px] text-accent-teal">{s.cycle_time} ct</span>
                  )}
                </div>
                <div className="text-[10px] text-text-muted mt-0.5">{s.name}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-text-muted text-xs">No throughput data available</p>
        )}
      </section>

      {/* Active In Production (collapsible) */}
      <section className="glass-card anim-card p-5" style={{ animationDelay: "360ms" }}>
        <button
          onClick={() => setProdOpen(!prodOpen)}
          className="w-full text-left text-sm font-semibold text-text-heading flex items-center gap-2 cursor-pointer"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          Active In Production
          <span className="text-[10px] bg-white/5 text-text-muted px-2 py-0.5 rounded-full">{inProduction.length}</span>
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={cn("ml-auto transition-transform", prodOpen ? "rotate-180" : "")}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {prodOpen && inProduction.length > 0 && (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-text-muted uppercase tracking-wider border-b border-white/10">
                  <th className="pb-2 pr-3">Order</th>
                  <th className="pb-2 pr-3">Location</th>
                  <th className="pb-2 pr-3">Dealer</th>
                  <th className="pb-2 pr-3">SO#</th>
                  <th className="pb-2 pr-3 text-right">Amount</th>
                  <th className="pb-2">Due</th>
                </tr>
              </thead>
              <tbody>
                {inProduction.map((o) => (
                  <tr key={o.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="py-2 pr-3">
                      <a href={o.monday_url} target="_blank" rel="noopener noreferrer" className="font-medium text-text-heading hover:text-accent-amber transition-colors">
                        {o.name}
                      </a>
                    </td>
                    <td className={cn("py-2 pr-3 font-medium", locationBadge(o.location))}>{o.location || "—"}</td>
                    <td className="py-2 pr-3 text-text-body">{o.dealer || "—"}</td>
                    <td className="py-2 pr-3 text-text-muted font-mono">{o.sales_order || "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-text-body">{fmtAmount(o.amount)}</td>
                    <td className="py-2 text-text-muted">{o.due_date || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {prodOpen && inProduction.length === 0 && (
          <p className="text-text-muted text-xs mt-3">No orders currently in production</p>
        )}
      </section>
    </div>
  );
}
