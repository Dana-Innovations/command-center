"use client";

import { Button } from "@/components/ui/button";
import { useConnections } from "@/hooks/useConnections";
import { useAttention } from "@/lib/attention/client";
import type { OperationsSubView } from "@/lib/tab-config";
import { DelegationView } from "@/components/views/DelegationView";
import { MindensView } from "@/components/views/MindensView";
import { SurfaceConnectState } from "@/components/views/SurfaceConnectState";
import { SurfaceIntro, SurfaceSubnav } from "@/components/views/SurfaceChrome";

interface OperationsViewProps {
  activeSubView: OperationsSubView;
  onConnectService: (provider: string) => Promise<void>;
  onOpenSetup?: () => void;
  onSubViewChange: (subView: OperationsSubView) => void;
}

export function OperationsView({
  activeSubView,
  onConnectService,
  onOpenSetup,
  onSubViewChange,
}: OperationsViewProps) {
  const connections = useConnections();
  const { connectingService } = useAttention();
  const hasAnyData = connections.asana || connections.monday;

  return (
    <div className="space-y-5">
      <SurfaceIntro
        eyebrow="Operations"
        title="Operations"
        description="Track delegated work and order flow without mixing execution views into the top-level navigation."
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
          { id: "delegation", label: "Delegation" },
          { id: "orders", label: "Orders" },
        ]}
      />

      {!hasAnyData ? (
        <SurfaceConnectState
          title="Connect execution systems"
          description="Start with Asana to unlock delegated work and follow-up, then add Monday.com for order flow."
          services={["Asana", "Monday.com"]}
          outcomes={[
            "Delegated work that needs follow-up",
            "Project and task context tied to actual execution risk",
            "Order flow once Monday.com is connected",
          ]}
          primaryActionLabel={
            connectingService === "asana"
              ? "Connecting Asana..."
              : "Connect Asana"
          }
          primaryActionDisabled={connectingService === "asana"}
          onPrimaryAction={() => void onConnectService("asana")}
          secondaryActionLabel={onOpenSetup ? "Personalize" : undefined}
          onSecondaryAction={onOpenSetup}
        />
      ) : activeSubView === "orders" ? (
        connections.monday ? (
          <MindensView />
        ) : (
          <SurfaceConnectState
            title="Connect Monday.com to view orders"
            description="The Orders subview uses Monday.com data to monitor production and fulfillment work."
            services={["Monday.com"]}
            outcomes={[
              "Production and fulfillment queues from live order data",
              "Operational blockers tied to active orders",
            ]}
            primaryActionLabel={
              connectingService === "monday"
                ? "Connecting Monday.com..."
                : "Connect Monday.com"
            }
            primaryActionDisabled={connectingService === "monday"}
            onPrimaryAction={() => void onConnectService("monday")}
            secondaryActionLabel={onOpenSetup ? "Personalize" : undefined}
            onSecondaryAction={onOpenSetup}
          />
        )
      ) : connections.asana ? (
        <DelegationView />
      ) : (
        <SurfaceConnectState
          title="Connect Asana to view delegation"
          description="The Delegation subview uses Asana task data to show delegated work that needs follow-up."
          services={["Asana"]}
          outcomes={[
            "Delegated work with due dates and follow-up risk",
            "Task updates tied to the people involved",
          ]}
          primaryActionLabel={
            connectingService === "asana"
              ? "Connecting Asana..."
              : "Connect Asana"
          }
          primaryActionDisabled={connectingService === "asana"}
          onPrimaryAction={() => void onConnectService("asana")}
          secondaryActionLabel={onOpenSetup ? "Personalize" : undefined}
          onSecondaryAction={onOpenSetup}
        />
      )}
    </div>
  );
}
