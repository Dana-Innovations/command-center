"use client";

import { Button } from "@/components/ui/button";
import { useConnections } from "@/hooks/useConnections";
import type { OperationsSubView } from "@/lib/tab-config";
import { DelegationView } from "@/components/views/DelegationView";
import { MindensView } from "@/components/views/MindensView";
import { InlineConnectBanner } from "@/components/ui/InlineConnectBanner";
import { SurfaceIntro, SurfaceSubnav } from "@/components/views/SurfaceChrome";

interface OperationsViewProps {
  activeSubView: OperationsSubView;
  onOpenSetup?: () => void;
  onSubViewChange: (subView: OperationsSubView) => void;
}

export function OperationsView({
  activeSubView,
  onOpenSetup,
  onSubViewChange,
}: OperationsViewProps) {
  const connections = useConnections();

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

      {!connections.asana && (
        <InlineConnectBanner service="Asana" onConnect={onOpenSetup} />
      )}
      {!connections.monday && (
        <InlineConnectBanner service="Monday.com" onConnect={onOpenSetup} />
      )}

      {activeSubView === "orders" ? (
        connections.monday ? <MindensView /> : null
      ) : (
        connections.asana ? <DelegationView /> : null
      )}
    </div>
  );
}
