"use client";

import { ReplyCenter } from "@/components/command-center/ReplyCenter";
import { Button } from "@/components/ui/button";
import { useConnections } from "@/hooks/useConnections";
import { useAttention } from "@/lib/attention/client";
import { SurfaceIntro } from "@/components/views/SurfaceChrome";
import { SurfaceConnectState } from "@/components/views/SurfaceConnectState";
import { SignalsView } from "@/components/views/SignalsView";

interface CommunicationsViewProps {
  onOpenSetup?: () => void;
  onConnectService: (provider: string) => Promise<void>;
}

export function CommunicationsView({
  onConnectService,
  onOpenSetup,
}: CommunicationsViewProps) {
  const connections = useConnections();
  const { connectingService } = useAttention();
  const connected = connections.m365 || connections.slack || connections.asana;

  return (
    <div className="space-y-5">
      <SurfaceIntro
        eyebrow="Comms"
        title="Communications"
        description="Start with the ranked reply queue, then move through channel activity, hygiene, and AI assistance."
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
          title="Connect communications data"
          description="Microsoft 365 is the fastest unlock here. It brings in live replies, Teams activity, and the core signals that shape the rest of the queue."
          services={["Microsoft 365", "Slack", "Asana"]}
          outcomes={[
            "Ranked replies from your real inbox",
            "Teams and channel context tied to the same day",
            "A stronger morning brief from your own communication load",
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
        <>
          <ReplyCenter />
          <SignalsView />
        </>
      )}
    </div>
  );
}
