"use client";
import { SalesView } from "@/components/views/SalesView";
import { PowerBIReports } from "@/components/command-center/PowerBIReports";
import { usePowerBI } from "@/hooks/usePowerBI";
import { useMemo } from "react";

// Filter to only show Trends report in Sales tab
function TrendsReport() {
  const { reportConfigs, loading } = usePowerBI();
  const trendsReport = useMemo(() =>
    reportConfigs.find(r => r.report_name?.toLowerCase().includes("trend")),
    [reportConfigs]
  );

  if (loading || !trendsReport) return null;

  // Re-use PowerBIReports but we render inline heading
  return (
    <div>
      <PowerBIReports filterIds={[trendsReport.report_id]} />
    </div>
  );
}

export function SalesTabView() {
  return (
    <div className="space-y-5">
      {/* Salesforce pipeline first */}
      <SalesView />
      {/* Trends Power BI report below */}
      <TrendsReport />
    </div>
  );
}
