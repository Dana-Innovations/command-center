"use client";

import { Button } from "@/components/ui/button";
import { useConnections } from "@/hooks/useConnections";
import type { PerformanceSubView } from "@/lib/tab-config";
import { MetricsView } from "@/components/views/MetricsView";
import { SalesTabView } from "@/components/views/SalesTabView";
import { InlineConnectBanner } from "@/components/ui/InlineConnectBanner";
import { SurfaceIntro, SurfaceSubnav } from "@/components/views/SurfaceChrome";

interface PerformanceViewProps {
  activeSubView: PerformanceSubView;
  onOpenSetup?: () => void;
  onSubViewChange: (subView: PerformanceSubView) => void;
}

export function PerformanceView({
  activeSubView,
  onOpenSetup,
  onSubViewChange,
}: PerformanceViewProps) {
  const connections = useConnections();

  return (
    <div className="space-y-5">
      <SurfaceIntro
        eyebrow="Performance"
        title="Performance"
        description="Use sales and metrics side by side so the command center shows pipeline movement first and supporting dashboards second."
        actions={
          onOpenSetup ? (
            <Button variant="secondary" size="sm" onClick={onOpenSetup}>
              Personalize
            </Button>
          ) : undefined
        }
      />

      <SurfaceSubnav
        active={activeSubView}
        onChange={onSubViewChange}
        items={[
          { id: "sales", label: "Sales" },
          { id: "metrics", label: "Metrics" },
        ]}
      />

      {!connections.salesforce && (
        <InlineConnectBanner service="Salesforce" onConnect={onOpenSetup} />
      )}
      {!connections.powerbi && (
        <InlineConnectBanner service="Power BI" onConnect={onOpenSetup} />
      )}

      {activeSubView === "metrics" ? (
        connections.powerbi ? <MetricsView /> : null
      ) : (
        connections.salesforce ? <SalesTabView /> : null
      )}
    </div>
  );
}
