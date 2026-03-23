"use client";

import { useMemo } from "react";
import { ReplyCenter } from "@/components/command-center/ReplyCenter";
import { SlackCard } from "@/components/command-center/SlackCard";
import { AIFeedCard } from "@/components/command-center/AIFeedCard";
import { JeanaSection } from "@/components/command-center/JeanaSection";
import { EmailHygieneCard } from "@/components/command-center/EmailHygieneCard";
import { Button } from "@/components/ui/button";
import { useConnections } from "@/hooks/useConnections";
import { useAuth } from "@/hooks/useAuth";
import { useTasks } from "@/hooks/useTasks";
import { useAttention } from "@/lib/attention/client";
import { transformJeanaItems } from "@/lib/transformers";
import {
  SurfaceIntro,
  SurfaceSubnav,
} from "@/components/views/SurfaceChrome";
import { SurfaceConnectState } from "@/components/views/SurfaceConnectState";
import { TeamsActivityView } from "@/components/views/TeamsActivityView";
import type { CommunicationsSubView } from "@/lib/tab-config";

interface CommunicationsViewProps {
  subView: CommunicationsSubView;
  onSubViewChange: (sub: CommunicationsSubView) => void;
  onOpenSetup?: () => void;
  onConnectService: (provider: string) => Promise<void>;
}

export function CommunicationsView({
  subView,
  onSubViewChange,
  onConnectService,
  onOpenSetup,
}: CommunicationsViewProps) {
  const connections = useConnections();
  const { connectingService } = useAttention();
  const { isAri } = useAuth();
  const { tasks } = useTasks();
  const connected = connections.m365 || connections.slack || connections.asana;

  const jeanaItems = transformJeanaItems(tasks);

  // Build sub-nav items based on connected services
  const subnavItems = useMemo(() => {
    const items: Array<{ id: CommunicationsSubView; label: string }> = [
      { id: "replies", label: "Replies" },
    ];
    if (connections.m365) {
      items.push({ id: "teams", label: "Teams" });
    }
    if (connections.slack) {
      items.push({ id: "slack", label: "Slack" });
    }
    if (connections.m365) {
      items.push({ id: "hygiene", label: "Hygiene" });
    }
    return items;
  }, [connections.m365, connections.slack]);

  return (
    <div className="space-y-5">
      <SurfaceIntro
        eyebrow="Comms"
        title="Communications"
        description="Your reply queue, Teams activity, Slack messages, and email hygiene — each in its own focused view."
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
          {subnavItems.length > 1 && (
            <SurfaceSubnav
              items={subnavItems}
              active={subView}
              onChange={onSubViewChange}
            />
          )}

          {subView === "replies" && (
            <>
              <ReplyCenter />
              <AIFeedCard />
              {isAri && <JeanaSection items={jeanaItems} />}
            </>
          )}

          {subView === "teams" && <TeamsActivityView />}

          {subView === "slack" && (
            <SlackCard />
          )}

          {subView === "hygiene" && (
            <EmailHygieneCard />
          )}
        </>
      )}
    </div>
  );
}
