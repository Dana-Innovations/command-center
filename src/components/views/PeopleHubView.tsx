"use client";

import { Button } from "@/components/ui/button";
import { useConnections } from "@/hooks/useConnections";
import { useAttention } from "@/lib/attention/client";
import { SurfaceConnectState } from "@/components/views/SurfaceConnectState";
import { SurfaceIntro } from "@/components/views/SurfaceChrome";
import { UnifiedPeopleView } from "@/components/views/UnifiedPeopleView";

interface PeopleHubViewProps {
  onOpenSetup?: () => void;
  onConnectService: (provider: string) => Promise<void>;
}

export function PeopleHubView({
  onConnectService,
  onOpenSetup,
}: PeopleHubViewProps) {
  const connections = useConnections();
  const { connectingService } = useAttention();
  const connected =
    connections.m365 ||
    connections.salesforce ||
    connections.asana ||
    connections.slack;

  return (
    <div className="space-y-5">
      <SurfaceIntro
        eyebrow="People"
        title="People"
        description="Keep relationships, recent touchpoints, and follow-up risk visible before you dive into pipeline or operations."
        actions={
          onOpenSetup ? (
            <Button variant="secondary" size="sm" onClick={onOpenSetup}>
              Personalize
            </Button>
          ) : undefined
        }
      />

      {!connected ? (
        <SurfaceConnectState
          title="Connect collaboration systems for People"
          description="Microsoft 365 is the fastest first unlock because it brings live meeting and communication context into the relationship view."
          services={["Microsoft 365", "Salesforce", "Asana", "Slack"]}
          outcomes={[
            "Recent relationship signals from meetings and messages",
            "Follow-up risk connected to actual touchpoints",
            "A stronger people layer before you dive into pipeline or tasks",
          ]}
          primaryActionLabel={
            connectingService === "microsoft"
              ? "Connecting Microsoft 365..."
              : "Connect Microsoft 365"
          }
          primaryActionDisabled={connectingService === "microsoft"}
          onPrimaryAction={() => void onConnectService("microsoft")}
          secondaryActionLabel={onOpenSetup ? "Personalize" : undefined}
          onSecondaryAction={onOpenSetup}
        />
      ) : (
        <UnifiedPeopleView />
      )}
    </div>
  );
}
