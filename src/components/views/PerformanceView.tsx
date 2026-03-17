"use client";

import { Button } from "@/components/ui/button";
import { useConnections } from "@/hooks/useConnections";
import { useAttention } from "@/lib/attention/client";
import type { PerformanceSubView } from "@/lib/tab-config";
import { MetricsView } from "@/components/views/MetricsView";
import { SalesTabView } from "@/components/views/SalesTabView";
import { SurfaceConnectState } from "@/components/views/SurfaceConnectState";
import { SurfaceIntro, SurfaceSubnav } from "@/components/views/SurfaceChrome";

interface PerformanceViewProps {
  activeSubView: PerformanceSubView;
  onConnectService: (provider: string) => Promise<void>;
  onOpenSetup?: () => void;
  onSubViewChange: (subView: PerformanceSubView) => void;
}

export function PerformanceView({
  activeSubView,
  onConnectService,
  onOpenSetup,
  onSubViewChange,
}: PerformanceViewProps) {
  const connections = useConnections();
  const { connectingService } = useAttention();
  const hasAnyData = connections.salesforce || connections.powerbi;

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

      {!hasAnyData ? (
        <SurfaceConnectState
          title="Connect business performance data"
          description="Start with Salesforce to unlock the fastest real performance win here, then add Power BI for supporting dashboards."
          services={["Salesforce", "Power BI"]}
          outcomes={[
            "Live pipeline risk and opportunity movement",
            "Open deals that need attention soon",
            "Metrics and dashboards once Power BI is added",
          ]}
          primaryActionLabel={
            connectingService === "salesforce"
              ? "Connecting Salesforce..."
              : "Connect Salesforce"
          }
          primaryActionDisabled={connectingService === "salesforce"}
          onPrimaryAction={() => void onConnectService("salesforce")}
          secondaryActionLabel={onOpenSetup ? "Personalize" : undefined}
          onSecondaryAction={onOpenSetup}
        />
      ) : activeSubView === "metrics" ? (
        connections.powerbi ? (
          <MetricsView />
        ) : (
          <SurfaceConnectState
            title="Connect Power BI to view metrics"
            description="This subview is reserved for KPI cards and reports from Power BI."
            services={["Power BI"]}
            outcomes={[
              "Executive KPI cards from live BI data",
              "Supporting reports behind pipeline movement",
            ]}
            primaryActionLabel={
              connectingService === "powerbi"
                ? "Connecting Power BI..."
                : "Connect Power BI"
            }
            primaryActionDisabled={connectingService === "powerbi"}
            onPrimaryAction={() => void onConnectService("powerbi")}
            secondaryActionLabel={onOpenSetup ? "Personalize" : undefined}
            onSecondaryAction={onOpenSetup}
          />
        )
      ) : connections.salesforce ? (
        <SalesTabView />
      ) : (
        <SurfaceConnectState
          title="Connect Salesforce to view sales performance"
          description="This subview is reserved for pipeline, trends, and open opportunity detail from Salesforce."
          services={["Salesforce"]}
          outcomes={[
            "Pipeline trend lines from live opportunity data",
            "Open deals and follow-up risk in one place",
          ]}
          primaryActionLabel={
            connectingService === "salesforce"
              ? "Connecting Salesforce..."
              : "Connect Salesforce"
          }
          primaryActionDisabled={connectingService === "salesforce"}
          onPrimaryAction={() => void onConnectService("salesforce")}
          secondaryActionLabel={onOpenSetup ? "Personalize" : undefined}
          onSecondaryAction={onOpenSetup}
        />
      )}
    </div>
  );
}
