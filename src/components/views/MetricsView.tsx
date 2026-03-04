"use client";
import { PowerBIReports } from "@/components/command-center/PowerBIReports";
import { PowerBIKPIs } from "@/components/command-center/PowerBIKPIs";
import { usePowerBI } from "@/hooks/usePowerBI";
import { useMemo } from "react";

// Filter out Trends (that's in Sales tab) — show DSA, MarketTrends, Usage
function MetricsReports() {
  const { reportConfigs } = usePowerBI();
  const metricsIds = useMemo(() =>
    reportConfigs
      .filter(r => !r.report_name?.toLowerCase().includes("trend"))
      .map(r => r.report_id),
    [reportConfigs]
  );
  if (metricsIds.length === 0) return null;
  return <PowerBIReports filterIds={metricsIds} />;
}

export function MetricsView() {
  return (
    <div className="space-y-5">
      <PowerBIKPIs />
      <MetricsReports />
    </div>
  );
}
