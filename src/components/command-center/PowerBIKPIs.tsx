"use client";

import { usePowerBI } from "@/hooks/usePowerBI";
import { TrendingUp, TrendingDown, Minus, BarChart3 } from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  revenue: "Revenue",
  operations: "Operations",
  growth: "Growth",
};

const CATEGORY_ORDER = ["revenue", "operations", "growth"];

function formatValue(value: number | null, unit: string): string {
  if (value === null) return "—";
  if (unit === "$") {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}m`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
    return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  if (unit === "%") return `${Math.round(value)}%`;
  if (unit === "#") {
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toFixed(0);
  }
  return String(value);
}

function TrendIndicator({
  current,
  previous,
}: {
  current: number | null;
  previous: number | null;
}) {
  if (current === null || previous === null || previous === 0) {
    return <Minus className="w-3.5 h-3.5 text-text-muted" />;
  }
  const pctChange = ((current - previous) / Math.abs(previous)) * 100;
  if (pctChange > 1) {
    return (
      <span className="flex items-center gap-1 text-accent-green text-xs">
        <TrendingUp className="w-3.5 h-3.5" />
        +{pctChange.toFixed(1)}%
      </span>
    );
  }
  if (pctChange < -1) {
    return (
      <span className="flex items-center gap-1 text-accent-red text-xs">
        <TrendingDown className="w-3.5 h-3.5" />
        {pctChange.toFixed(1)}%
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-text-muted text-xs">
      <Minus className="w-3.5 h-3.5" />
      Flat
    </span>
  );
}

export function PowerBIKPIs() {
  const { kpisByCategory, loading, error } = usePowerBI();

  if (loading) {
    return (
      <section className="glass-card anim-card">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4 text-[#0070D2]" />
          <h2 className="text-sm font-semibold text-text-heading">Pipeline KPIs</h2>
        <span className="text-[10px] text-text-muted bg-[#0070D2]/10 text-[#0070D2] px-1.5 py-0.5 rounded">Salesforce live</span>
        </div>
        <div className="text-sm text-text-muted animate-pulse">Loading KPIs...</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="glass-card anim-card">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4 text-[#0070D2]" />
          <h2 className="text-sm font-semibold text-text-heading">Pipeline KPIs</h2>
        <span className="text-[10px] text-text-muted bg-[#0070D2]/10 text-[#0070D2] px-1.5 py-0.5 rounded">Salesforce live</span>
        </div>
        <div className="text-sm text-accent-red">{error}</div>
      </section>
    );
  }

  const categories = CATEGORY_ORDER.filter((c) => kpisByCategory[c]?.length);

  if (categories.length === 0) {
    return (
      <section className="glass-card anim-card">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4 text-[#0070D2]" />
          <h2 className="text-sm font-semibold text-text-heading">Pipeline KPIs</h2>
        <span className="text-[10px] text-text-muted bg-[#0070D2]/10 text-[#0070D2] px-1.5 py-0.5 rounded">Salesforce live</span>
        </div>
        <div className="text-sm text-text-muted">
          Loading pipeline data from Salesforce...
        </div>
      </section>
    );
  }

  return (
    <section className="glass-card anim-card">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-4 h-4 text-[#0070D2]" />
        <h2 className="text-sm font-semibold text-text-heading">Pipeline KPIs</h2>
        <span className="text-[10px] text-text-muted bg-[#0070D2]/10 text-[#0070D2] px-1.5 py-0.5 rounded">Salesforce live</span>
      </div>

      <div className="space-y-5">
        {categories.map((category) => (
          <div key={category}>
            <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
              {CATEGORY_LABELS[category] || category}
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {kpisByCategory[category].map((kpi) => (
                <div
                  key={kpi.id}
                  className="bg-[var(--bg-card)]/50 border border-[var(--bg-card-border)] rounded-lg p-3"
                >
                  <div className="text-xs text-text-muted mb-1">{kpi.kpi_name}</div>
                  <div className="text-lg font-semibold text-text-heading">
                    {formatValue(kpi.current_value, kpi.unit)}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <TrendIndicator
                      current={kpi.current_value}
                      previous={kpi.previous_value}
                    />
                    {kpi.target_value !== null && (
                      <span className="text-[10px] text-text-muted">
                        Target: {formatValue(kpi.target_value, kpi.unit)}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-text-muted">{kpi.period}</span>
                  {(kpi as unknown as { subtitle?: string }).subtitle && (
                    <span className="text-[10px] text-text-muted block mt-0.5">{(kpi as unknown as { subtitle?: string }).subtitle}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
